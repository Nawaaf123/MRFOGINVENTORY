from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from database import get_db
from models import (
    WarehouseStock,
    InventoryTransaction,
    StockAuditLog,
    InventoryItem,
    Order,
    OrderItem,
    Warehouse,
)
from schemas import (
    StockUpdateRequest,
    StockReceiveRequest,
    StockTransferRequest,
    ApplyDeltasRequest,
    StockSummaryResponse,
)
from auth import get_current_user
from services.stock_summary import build_item_summary

router = APIRouter(prefix="/api/stock", tags=["stock"])


async def _upsert_stock(db: AsyncSession, item_id, warehouse_id, new_qty: int) -> tuple[WarehouseStock, int]:
    """Returns (stock, delta)."""
    result = await db.execute(
        select(WarehouseStock).where(
            WarehouseStock.item_id == item_id,
            WarehouseStock.warehouse_id == warehouse_id,
        )
    )
    stock = result.scalar_one_or_none()
    old_qty = stock.quantity if stock else 0
    if stock:
        stock.quantity = new_qty
    else:
        stock = WarehouseStock(item_id=item_id, warehouse_id=warehouse_id, quantity=new_qty)
        db.add(stock)
    delta = new_qty - old_qty
    audit = StockAuditLog(
        item_id=item_id,
        warehouse_id=warehouse_id,
        old_quantity=old_qty,
        new_quantity=new_qty,
        delta=delta,
    )
    db.add(audit)
    return stock, delta


async def _apply_delta(db: AsyncSession, item_id, warehouse_id, delta: int) -> WarehouseStock:
    result = await db.execute(
        select(WarehouseStock).where(
            WarehouseStock.item_id == item_id,
            WarehouseStock.warehouse_id == warehouse_id,
        )
    )
    stock = result.scalar_one_or_none()
    old_qty = stock.quantity if stock else 0
    new_qty = max(0, old_qty + delta)
    if stock:
        stock.quantity = new_qty
    else:
        stock = WarehouseStock(item_id=item_id, warehouse_id=warehouse_id, quantity=new_qty)
        db.add(stock)
    audit = StockAuditLog(
        item_id=item_id,
        warehouse_id=warehouse_id,
        old_quantity=old_qty,
        new_quantity=new_qty,
        delta=new_qty - old_qty,
    )
    db.add(audit)
    return stock


@router.get("/summary", response_model=StockSummaryResponse)
async def stock_summary(
    warehouse_id: Optional[UUID] = Query(None),
    item_id: Optional[UUID] = Query(None),
    q: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    items_q = select(InventoryItem).options(
        selectinload(InventoryItem.stocks).joinedload(WarehouseStock.warehouse)
    ).order_by(InventoryItem.sku)
    if item_id:
        items_q = items_q.where(InventoryItem.id == item_id)
    items = (await db.execute(items_q)).scalars().unique().all()

    if q and q.strip():
        needle = q.strip().lower()
        items = [
            i for i in items
            if needle in (i.name or "").lower()
            or needle in (i.sku or "").lower()
            or needle in (i.category or "").lower()
            or needle in (i.sub_category or "").lower()
        ]

    warehouses = (await db.execute(select(Warehouse))).scalars().all()
    warehouse_names = {str(w.id): w.name for w in warehouses}

    tx_q = (
        select(InventoryTransaction)
        .options(
            joinedload(InventoryTransaction.item),
            joinedload(InventoryTransaction.warehouse),
        )
    )
    if item_id:
        tx_q = tx_q.where(InventoryTransaction.item_id == item_id)
    transactions = (await db.execute(tx_q)).scalars().unique().all()

    orders_q = (
        select(Order)
        .options(selectinload(Order.items).joinedload(OrderItem.warehouse))
    )
    orders = (await db.execute(orders_q)).scalars().unique().all()

    txs_by_item: dict[str, list] = {}
    for t in transactions:
        key = str(t.item_id)
        txs_by_item.setdefault(key, []).append(
            {
                "id": t.id,
                "type": t.type,
                "quantity": t.quantity,
                "created_at": t.created_at,
                "warehouse_id": t.warehouse_id,
                "warehouse_name": t.warehouse.name if t.warehouse else warehouse_names.get(str(t.warehouse_id)),
                "bol_number": t.bol_number,
                "bol_document_url": t.bol_document_url,
            }
        )

    lines_by_item: dict[str, list] = {}
    for order in orders:
        for oi in order.items:
            if item_id and oi.item_id != item_id:
                continue
            key = str(oi.item_id)
            lines_by_item.setdefault(key, []).append(
                {
                    "id": oi.id,
                    "quantity": oi.quantity,
                    "created_at": order.created_at,
                    "warehouse_id": oi.warehouse_id,
                    "warehouse_name": oi.warehouse.name if oi.warehouse else warehouse_names.get(str(oi.warehouse_id)),
                    "shop_name": order.shop_name,
                    "order_status": order.status,
                }
            )

    summaries = []
    for item in items:
        stocks = [
            {
                "warehouse_id": s.warehouse_id,
                "warehouse_name": s.warehouse.name if s.warehouse else warehouse_names.get(str(s.warehouse_id)),
                "quantity": s.quantity,
            }
            for s in item.stocks
        ]
        summary = build_item_summary(
            item_id=item.id,
            item_name=item.name,
            item_sku=item.sku,
            category=item.category,
            sub_category=item.sub_category,
            stocks=stocks,
            transactions=txs_by_item.get(str(item.id), []),
            order_lines=lines_by_item.get(str(item.id), []),
            warehouse_filter=warehouse_id,
            warehouses=warehouse_names,
        )
        summaries.append(summary.to_dict())

    return {"warehouse_id": warehouse_id, "items": summaries}


@router.put("/update")
async def update_stock(body: StockUpdateRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    _, delta = await _upsert_stock(db, body.item_id, body.warehouse_id, body.quantity)
    if delta != 0:
        db.add(
            InventoryTransaction(
                item_id=body.item_id,
                warehouse_id=body.warehouse_id,
                quantity=delta,
                type="manual_adjust",
            )
        )
    await db.commit()
    return {"ok": True}


@router.post("/receive")
async def receive_stock(body: StockReceiveRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    await _apply_delta(db, body.item_id, body.warehouse_id, body.quantity)
    tx = InventoryTransaction(
        item_id=body.item_id,
        warehouse_id=body.warehouse_id,
        quantity=body.quantity,
        bol_number=body.bol_number,
        bol_document_url=body.bol_document_url,
        type="receive",
    )
    db.add(tx)
    await db.commit()
    return {"ok": True}


@router.post("/transfer")
async def transfer_stock(body: StockTransferRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Transfer quantity must be positive")
    if body.from_warehouse_id == body.to_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouses must differ")

    result = await db.execute(
        select(WarehouseStock).where(
            WarehouseStock.item_id == body.item_id,
            WarehouseStock.warehouse_id == body.from_warehouse_id,
        )
    )
    source = result.scalar_one_or_none()
    available = source.quantity if source else 0
    if available < body.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock in source warehouse ({available} available)",
        )

    await _apply_delta(db, body.item_id, body.from_warehouse_id, -body.quantity)
    await _apply_delta(db, body.item_id, body.to_warehouse_id, body.quantity)
    tx_out = InventoryTransaction(
        item_id=body.item_id,
        warehouse_id=body.from_warehouse_id,
        quantity=-body.quantity,
        type="transfer_out",
    )
    tx_in = InventoryTransaction(
        item_id=body.item_id,
        warehouse_id=body.to_warehouse_id,
        quantity=body.quantity,
        type="transfer_in",
    )
    db.add(tx_out)
    db.add(tx_in)
    await db.commit()
    return {"ok": True}


@router.post("/apply-deltas")
async def apply_deltas(body: ApplyDeltasRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    for change in body.changes:
        if change.delta == 0:
            continue
        await _apply_delta(db, change.item_id, change.warehouse_id, change.delta)
        db.add(
            InventoryTransaction(
                item_id=change.item_id,
                warehouse_id=change.warehouse_id,
                quantity=change.delta,
                type="manual_adjust",
            )
        )
    await db.commit()
    return {"ok": True}
