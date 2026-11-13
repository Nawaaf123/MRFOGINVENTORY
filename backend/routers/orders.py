from datetime import datetime, timezone, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import joinedload, selectinload

from database import get_db
from models import Order, OrderItem, InventoryTransaction, InventoryItem
from schemas import OrderCreate, OrderUpdate, OrderOut, OrderPage, CancelRequest
from auth import get_current_user
from routers.stock import _apply_delta, _available_qty

router = APIRouter(prefix="/api/orders", tags=["orders"])

ORDER_DETAIL_LOAD = (
    selectinload(Order.items).joinedload(OrderItem.item),
    selectinload(Order.items).joinedload(OrderItem.warehouse),
)


async def _ensure_stock_available(db: AsyncSession, items: list) -> None:
    """Reject the order if any warehouse line exceeds available stock."""
    needed: dict[tuple, int] = {}
    for oi in items:
        key = (oi.item_id, oi.warehouse_id)
        needed[key] = needed.get(key, 0) + oi.quantity

    for (item_id, warehouse_id), qty in needed.items():
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Order quantity must be positive")
        available = await _available_qty(db, item_id, warehouse_id)
        if available < qty:
            item = (
                await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
            ).scalar_one_or_none()
            sku = item.sku if item else str(item_id)
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {sku}: {available} available, need {qty}",
            )


def _enrich_order(order: Order, *, include_items: bool = True, stats: dict | None = None) -> dict:
    items = []
    if include_items:
        for oi in order.items:
            items.append({
                "id": oi.id,
                "item_id": oi.item_id,
                "warehouse_id": oi.warehouse_id,
                "quantity": oi.quantity,
                "unit_price": oi.unit_price,
                "created_at": oi.created_at,
                "item_name": oi.item.name if oi.item else None,
                "item_sku": oi.item.sku if oi.item else None,
                "warehouse_name": oi.warehouse.name if oi.warehouse else None,
            })

    cases = stats.get("cases") if stats else None
    product_count = stats.get("product_count") if stats else None
    subtotal = stats.get("subtotal") if stats else None

    if include_items and order.items is not None:
        cases = sum(oi.quantity for oi in order.items)
        product_count = len(order.items)
        subtotal = sum((oi.quantity or 0) * (oi.unit_price or 0) for oi in order.items)

    return {
        "id": order.id,
        "shop_name": order.shop_name,
        "status": order.status,
        "shipping_fee": order.shipping_fee,
        "cancelled_at": order.cancelled_at,
        "cancelled_reason": order.cancelled_reason,
        "created_at": order.created_at,
        "items": items,
        "cases": cases,
        "product_count": product_count,
        "subtotal": subtotal,
    }


async def _order_stats_map(db: AsyncSession, order_ids: list[UUID]) -> dict[UUID, dict]:
    if not order_ids:
        return {}
    rows = (
        await db.execute(
            select(
                OrderItem.order_id,
                func.coalesce(func.sum(OrderItem.quantity), 0),
                func.count(OrderItem.id),
                func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0),
            )
            .where(OrderItem.order_id.in_(order_ids))
            .group_by(OrderItem.order_id)
        )
    ).all()
    return {
        row[0]: {"cases": int(row[1]), "product_count": int(row[2]), "subtotal": row[3]}
        for row in rows
    }


@router.get("", response_model=OrderPage)
async def list_orders(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None),
    days: Optional[int] = Query(None, ge=1, le=3650),
    include_cancelled: bool = Query(False),
    include_items: bool = Query(False),
    shop: Optional[str] = Query(None),
):
    filters = []
    if not include_cancelled:
        filters.append(Order.status != "cancelled")
    if q and q.strip():
        filters.append(Order.shop_name.ilike(f"%{q.strip()}%"))
    if shop and shop.strip():
        filters.append(Order.shop_name == shop.strip())
    if days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        filters.append(Order.created_at >= cutoff)

    count_q = select(func.count()).select_from(Order)
    if filters:
        count_q = count_q.where(and_(*filters))
    total = int((await db.execute(count_q)).scalar_one())

    list_q = select(Order).order_by(Order.created_at.desc()).offset(offset).limit(limit)
    if filters:
        list_q = list_q.where(and_(*filters))
    if include_items:
        list_q = list_q.options(*ORDER_DETAIL_LOAD)

    orders = (await db.execute(list_q)).scalars().unique().all()
    stats_map = {} if include_items else await _order_stats_map(db, [o.id for o in orders])

    return {
        "items": [
            _enrich_order(o, include_items=include_items, stats=stats_map.get(o.id))
            for o in orders
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Order).options(*ORDER_DETAIL_LOAD).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _enrich_order(order, include_items=True)


@router.post("", response_model=OrderOut)
async def create_order(body: OrderCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one order item is required")
    await _ensure_stock_available(db, body.items)

    order = Order(shop_name=body.shop_name, shipping_fee=body.shipping_fee)
    db.add(order)
    await db.flush()

    for oi in body.items:
        order_item = OrderItem(
            order_id=order.id,
            item_id=oi.item_id,
            warehouse_id=oi.warehouse_id,
            quantity=oi.quantity,
            unit_price=oi.unit_price,
        )
        db.add(order_item)
        await _apply_delta(db, oi.item_id, oi.warehouse_id, -oi.quantity)
        db.add(
            InventoryTransaction(
                item_id=oi.item_id,
                warehouse_id=oi.warehouse_id,
                quantity=-oi.quantity,
                type="sale",
                note=body.shop_name.strip() or None,
            )
        )

    await db.commit()

    result = await db.execute(
        select(Order).options(*ORDER_DETAIL_LOAD).where(Order.id == order.id)
    )
    return _enrich_order(result.scalar_one(), include_items=True)


@router.put("/{order_id}", response_model=OrderOut)
async def update_order(order_id: UUID, body: OrderUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Order).options(*ORDER_DETAIL_LOAD).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot edit a cancelled order")

    if body.shop_name is not None:
        order.shop_name = body.shop_name
    if body.shipping_fee is not None:
        order.shipping_fee = body.shipping_fee

    shop_label = (order.shop_name or "").strip() or None

    if body.items is not None:
        for old_oi in order.items:
            await _apply_delta(db, old_oi.item_id, old_oi.warehouse_id, old_oi.quantity)
            db.add(
                InventoryTransaction(
                    item_id=old_oi.item_id,
                    warehouse_id=old_oi.warehouse_id,
                    quantity=old_oi.quantity,
                    type="sale",
                    note=f"{shop_label} (edit void)" if shop_label else "Order edit void",
                )
            )

        for old_oi in list(order.items):
            await db.delete(old_oi)
        await db.flush()

        await _ensure_stock_available(db, body.items)

        for new_oi in body.items:
            oi = OrderItem(
                order_id=order.id,
                item_id=new_oi.item_id,
                warehouse_id=new_oi.warehouse_id,
                quantity=new_oi.quantity,
                unit_price=new_oi.unit_price,
            )
            db.add(oi)
            await _apply_delta(db, new_oi.item_id, new_oi.warehouse_id, -new_oi.quantity)
            db.add(
                InventoryTransaction(
                    item_id=new_oi.item_id,
                    warehouse_id=new_oi.warehouse_id,
                    quantity=-new_oi.quantity,
                    type="sale",
                    note=shop_label,
                )
            )

    await db.commit()

    result = await db.execute(
        select(Order).options(*ORDER_DETAIL_LOAD).where(Order.id == order_id)
    )
    return _enrich_order(result.scalar_one(), include_items=True)


@router.post("/{order_id}/complete", response_model=OrderOut)
async def complete_order(order_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Order).options(*ORDER_DETAIL_LOAD).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot complete a cancelled order")
    order.status = "completed"
    await db.commit()
    result = await db.execute(
        select(Order).options(*ORDER_DETAIL_LOAD).where(Order.id == order_id)
    )
    return _enrich_order(result.scalar_one(), include_items=True)


async def _cancel(db: AsyncSession, order_id: UUID, reason: str | None = None):
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="Order already cancelled")

    order.status = "cancelled"
    order.cancelled_at = datetime.now(timezone.utc)
    order.cancelled_reason = reason

    shop_label = (order.shop_name or "").strip() or "Order"
    cancel_note = f"{shop_label} (cancelled)"
    if reason and reason.strip():
        cancel_note = f"{cancel_note}: {reason.strip()}"

    for oi in order.items:
        await _apply_delta(db, oi.item_id, oi.warehouse_id, oi.quantity)
        tx = InventoryTransaction(
            item_id=oi.item_id,
            warehouse_id=oi.warehouse_id,
            quantity=oi.quantity,
            type="order_cancelled",
            note=cancel_note,
        )
        db.add(tx)

    await db.commit()
    return {"ok": True}


@router.post("/{order_id}/cancel")
async def cancel_order_post(order_id: UUID, body: CancelRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await _cancel(db, order_id, body.reason)


@router.delete("/{order_id}")
async def cancel_order(order_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await _cancel(db, order_id)
