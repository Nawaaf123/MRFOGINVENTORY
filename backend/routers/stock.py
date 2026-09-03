from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import WarehouseStock, InventoryTransaction, StockAuditLog
from schemas import StockUpdateRequest, StockReceiveRequest, StockTransferRequest, ApplyDeltasRequest
from auth import get_current_user

router = APIRouter(prefix="/api/stock", tags=["stock"])


async def _upsert_stock(db: AsyncSession, item_id, warehouse_id, new_qty: int) -> WarehouseStock:
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
    audit = StockAuditLog(
        item_id=item_id,
        warehouse_id=warehouse_id,
        old_quantity=old_qty,
        new_quantity=new_qty,
        delta=new_qty - old_qty,
    )
    db.add(audit)
    return stock


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


@router.put("/update")
async def update_stock(body: StockUpdateRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    await _upsert_stock(db, body.item_id, body.warehouse_id, body.quantity)
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
        await _apply_delta(db, change.item_id, change.warehouse_id, change.delta)
    await db.commit()
    return {"ok": True}
