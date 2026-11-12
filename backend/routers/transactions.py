from datetime import datetime, timezone, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, and_, or_
from sqlalchemy.orm import joinedload

from database import get_db
from models import InventoryTransaction, InventoryItem
from schemas import TransactionOut, TransactionPage, ReceivingUpdateRequest
from auth import get_current_user
from routers.stock import _apply_delta

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _enrich(tx: InventoryTransaction) -> dict:
    return {
        "id": tx.id,
        "item_id": tx.item_id,
        "warehouse_id": tx.warehouse_id,
        "quantity": tx.quantity,
        "bol_number": tx.bol_number,
        "bol_document_url": tx.bol_document_url,
        "note": tx.note,
        "type": tx.type,
        "created_at": tx.created_at,
        "item_name": tx.item.name if tx.item else None,
        "item_sku": tx.item.sku if tx.item else None,
        "warehouse_name": tx.warehouse.name if tx.warehouse else None,
    }


@router.get("", response_model=TransactionPage)
async def list_transactions(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None),
    tx_type: Optional[str] = Query(None, alias="type"),
    types: Optional[str] = Query(None, description="Comma-separated types"),
    warehouse_id: Optional[UUID] = Query(None),
    days: Optional[int] = Query(None, ge=1, le=3650),
):
    filters = []
    type_list = []
    if types and types.strip():
        type_list = [t.strip() for t in types.split(",") if t.strip()]
    elif tx_type and tx_type.strip() and tx_type.strip() != "all":
        type_list = [tx_type.strip()]
    if type_list:
        filters.append(InventoryTransaction.type.in_(type_list))
    if warehouse_id:
        filters.append(InventoryTransaction.warehouse_id == warehouse_id)
    if days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        filters.append(InventoryTransaction.created_at >= cutoff)

    needle = (q or "").strip()
    if needle:
        filters.append(
            or_(
                InventoryItem.name.ilike(f"%{needle}%"),
                InventoryItem.sku.ilike(f"%{needle}%"),
                InventoryTransaction.bol_number.ilike(f"%{needle}%"),
                InventoryTransaction.note.ilike(f"%{needle}%"),
            )
        )

    count_q = select(func.count()).select_from(InventoryTransaction)
    if needle:
        count_q = count_q.join(InventoryItem, InventoryItem.id == InventoryTransaction.item_id)
    if filters:
        count_q = count_q.where(and_(*filters))
    total = int((await db.execute(count_q)).scalar_one())

    list_q = (
        select(InventoryTransaction)
        .options(joinedload(InventoryTransaction.item), joinedload(InventoryTransaction.warehouse))
        .order_by(InventoryTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if needle:
        list_q = list_q.join(InventoryItem, InventoryItem.id == InventoryTransaction.item_id)
    if filters:
        list_q = list_q.where(and_(*filters))

    txs = (await db.execute(list_q)).scalars().unique().all()
    return {
        "items": [_enrich(tx) for tx in txs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.put("/receiving")
async def update_receiving(body: ReceivingUpdateRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(InventoryTransaction).where(
            InventoryTransaction.bol_number == body.bol_number,
            InventoryTransaction.type == "receive",
        )
    )
    existing = result.scalars().all()

    for tx in existing:
        await _apply_delta(db, tx.item_id, tx.warehouse_id, -tx.quantity)

    await db.execute(
        delete(InventoryTransaction).where(
            InventoryTransaction.bol_number == body.bol_number,
            InventoryTransaction.type == "receive",
        )
    )

    new_bol = body.new_bol_number or body.bol_number

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
