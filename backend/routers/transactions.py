from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload

from database import get_db
from models import InventoryTransaction, WarehouseStock, StockAuditLog
from schemas import TransactionOut, ReceivingUpdateRequest
from auth import get_current_user
from routers.stock import _apply_delta

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _enrich(tx: InventoryTransaction) -> dict:
    d = {
        "id": tx.id,
        "item_id": tx.item_id,
        "warehouse_id": tx.warehouse_id,
        "quantity": tx.quantity,
        "bol_number": tx.bol_number,
        "bol_document_url": tx.bol_document_url,
        "type": tx.type,
        "created_at": tx.created_at,
        "item_name": tx.item.name if tx.item else None,
        "warehouse_name": tx.warehouse.name if tx.warehouse else None,
    }
    return d


@router.get("", response_model=List[TransactionOut])
async def list_transactions(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(InventoryTransaction)
        .options(joinedload(InventoryTransaction.item), joinedload(InventoryTransaction.warehouse))
        .order_by(InventoryTransaction.created_at.desc())
    )
    txs = result.scalars().all()
    return [_enrich(tx) for tx in txs]


@router.put("/receiving")
async def update_receiving(body: ReceivingUpdateRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(InventoryTransaction).where(
            InventoryTransaction.bol_number == body.bol_number,
            InventoryTransaction.type == "receive",
        )
    )
    existing = result.scalars().all()

    # Reverse old quantities
    for tx in existing:
        await _apply_delta(db, tx.item_id, tx.warehouse_id, -tx.quantity)

    # Delete old transactions
    await db.execute(
        delete(InventoryTransaction).where(
            InventoryTransaction.bol_number == body.bol_number,
            InventoryTransaction.type == "receive",
        )
    )

    new_bol = body.new_bol_number or body.bol_number

    # Create new transactions with new quantities
    for item in body.items:
        await _apply_delta(db, item.item_id, item.warehouse_id, item.quantity)
        tx = InventoryTransaction(
            item_id=item.item_id,
            warehouse_id=item.warehouse_id,
            quantity=item.quantity,
            bol_number=new_bol,
            bol_document_url=body.bol_document_url,
            type="receive",
        )
        db.add(tx)

    await db.commit()
    return {"ok": True}


@router.delete("/receiving/{bol_number}")
async def delete_receiving(bol_number: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(InventoryTransaction).where(
            InventoryTransaction.bol_number == bol_number,
            InventoryTransaction.type == "receive",
        )
    )
    txs = result.scalars().all()
    if not txs:
        raise HTTPException(status_code=404, detail="No receive transactions found for this BOL")

    for tx in txs:
        await _apply_delta(db, tx.item_id, tx.warehouse_id, -tx.quantity)

    await db.execute(
        delete(InventoryTransaction).where(
            InventoryTransaction.bol_number == bol_number,
            InventoryTransaction.type == "receive",
        )
    )
    await db.commit()
    return {"ok": True}
