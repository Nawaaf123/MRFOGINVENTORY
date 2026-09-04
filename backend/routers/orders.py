from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from database import get_db
from models import Order, OrderItem, InventoryTransaction, InventoryItem
from schemas import OrderCreate, OrderUpdate, OrderOut, CancelRequest
from auth import get_current_user
from routers.stock import _apply_delta, _available_qty

router = APIRouter(prefix="/api/orders", tags=["orders"])


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


def _enrich_order(order: Order) -> dict:
    items = []
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
    return {
        "id": order.id,
        "shop_name": order.shop_name,
        "status": order.status,
        "shipping_fee": order.shipping_fee,
        "cancelled_at": order.cancelled_at,
        "cancelled_reason": order.cancelled_reason,
        "created_at": order.created_at,
        "items": items,
    }


@router.get("", response_model=List[OrderOut])
async def list_orders(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).joinedload(OrderItem.item),
            selectinload(Order.items).joinedload(OrderItem.warehouse),
        )
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    return [_enrich_order(o) for o in orders]


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

    await db.commit()

    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).joinedload(OrderItem.item),
            selectinload(Order.items).joinedload(OrderItem.warehouse),
        )
        .where(Order.id == order.id)
    )
    return _enrich_order(result.scalar_one())


@router.put("/{order_id}", response_model=OrderOut)
async def update_order(order_id: UUID, body: OrderUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).joinedload(OrderItem.item),
            selectinload(Order.items).joinedload(OrderItem.warehouse),
        )
        .where(Order.id == order_id)
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

    if body.items is not None:
        # Return stock from old items first so availability check sees freed qty
        for old_oi in order.items:
            await _apply_delta(db, old_oi.item_id, old_oi.warehouse_id, old_oi.quantity)

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

    await db.commit()

    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).joinedload(OrderItem.item),
            selectinload(Order.items).joinedload(OrderItem.warehouse),
        )
        .where(Order.id == order_id)
    )
    return _enrich_order(result.scalar_one())


@router.post("/{order_id}/complete", response_model=OrderOut)
async def complete_order(order_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).joinedload(OrderItem.item),
            selectinload(Order.items).joinedload(OrderItem.warehouse),
        )
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot complete a cancelled order")
    order.status = "completed"
    await db.commit()
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).joinedload(OrderItem.item),
            selectinload(Order.items).joinedload(OrderItem.warehouse),
        )
        .where(Order.id == order_id)
    )
    return _enrich_order(result.scalar_one())


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

    for oi in order.items:
        await _apply_delta(db, oi.item_id, oi.warehouse_id, oi.quantity)
        tx = InventoryTransaction(
            item_id=oi.item_id,
            warehouse_id=oi.warehouse_id,
            quantity=oi.quantity,
            type="order_cancelled",
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
