from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload

from database import get_db
from models import InventoryItem, WarehouseStock, StockAuditLog
from schemas import ItemCreate, ItemUpdate, ItemOut
from auth import get_current_user

router = APIRouter(prefix="/api/items", tags=["items"])

ITEM_LOAD = selectinload(InventoryItem.stocks).joinedload(WarehouseStock.warehouse)


@router.get("", response_model=List[ItemOut])
async def list_items(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(InventoryItem).options(ITEM_LOAD).order_by(InventoryItem.name)
    )
    return [_enrich_item(i) for i in result.scalars().unique().all()]


def _enrich_item(item: InventoryItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "sku": item.sku,
        "category": item.category,
        "sub_category": item.sub_category,
        "min_stock": item.min_stock,
        "price": item.price,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "stocks": [
            {
                "warehouse_id": s.warehouse_id,
                "quantity": s.quantity,
                "warehouse_name": s.warehouse.name if s.warehouse else None,
            }
            for s in item.stocks
        ],
    }


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
        select(InventoryItem).options(ITEM_LOAD).where(InventoryItem.id == item.id)
    )
    return _enrich_item(result.unique().scalar_one())


@router.put("/{item_id}", response_model=ItemOut)
async def update_item(item_id: UUID, body: ItemUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(InventoryItem).options(ITEM_LOAD).where(InventoryItem.id == item_id)
    )
    item = result.unique().scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.commit()
    result = await db.execute(
        select(InventoryItem).options(ITEM_LOAD).where(InventoryItem.id == item_id)
    )
    return _enrich_item(result.unique().scalar_one())


@router.delete("/{item_id}")
async def delete_item(item_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}
