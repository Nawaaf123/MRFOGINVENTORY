from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import InventoryItem, WarehouseStock, StockAuditLog
from schemas import ItemCreate, ItemUpdate, ItemOut
from auth import get_current_user

router = APIRouter(prefix="/api/items", tags=["items"])


@router.get("", response_model=List[ItemOut])
async def list_items(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(InventoryItem).options(selectinload(InventoryItem.stocks)).order_by(InventoryItem.name)
    )
    return result.scalars().all()


@router.post("", response_model=ItemOut)
async def create_item(body: ItemCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    initial_stock = body.initial_stock
    item_data = body.model_dump(exclude={"initial_stock"})
    item = InventoryItem(**item_data)
    db.add(item)
    await db.flush()

    if initial_stock:
        for s in initial_stock:
            stock = WarehouseStock(item_id=item.id, warehouse_id=s.warehouse_id, quantity=s.quantity)
            db.add(stock)
            await db.flush()
            audit = StockAuditLog(
                item_id=item.id,
                warehouse_id=s.warehouse_id,
                old_quantity=0,
                new_quantity=s.quantity,
                delta=s.quantity,
            )
            db.add(audit)

    await db.commit()
    result = await db.execute(
        select(InventoryItem).options(selectinload(InventoryItem.stocks)).where(InventoryItem.id == item.id)
    )
    return result.scalar_one()


@router.put("/{item_id}", response_model=ItemOut)
async def update_item(item_id: UUID, body: ItemUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(InventoryItem).options(selectinload(InventoryItem.stocks)).where(InventoryItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}")
async def delete_item(item_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}
