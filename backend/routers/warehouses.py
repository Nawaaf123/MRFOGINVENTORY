from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Warehouse
from schemas import WarehouseCreate, WarehouseUpdate, WarehouseOut, ReorderRequest
from auth import get_current_user

router = APIRouter(prefix="/api/warehouses", tags=["warehouses"])


@router.get("", response_model=List[WarehouseOut])
async def list_warehouses(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Warehouse).order_by(Warehouse.sort_order, Warehouse.name))
    return result.scalars().all()


@router.post("", response_model=WarehouseOut)
async def create_warehouse(body: WarehouseCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    wh = Warehouse(**body.model_dump())
    db.add(wh)
    await db.commit()
    await db.refresh(wh)
    return wh


@router.put("/reorder")
async def reorder_warehouses(body: ReorderRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    for item in body.items:
        result = await db.execute(select(Warehouse).where(Warehouse.id == item.id))
        wh = result.scalar_one_or_none()
        if wh:
            wh.sort_order = item.sort_order
    await db.commit()
    return {"ok": True}


@router.put("/{warehouse_id}", response_model=WarehouseOut)
async def update_warehouse(warehouse_id: UUID, body: WarehouseUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(wh, k, v)
    await db.commit()
    await db.refresh(wh)
    return wh


@router.delete("/{warehouse_id}")
async def delete_warehouse(warehouse_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    await db.delete(wh)
    await db.commit()
    return {"ok": True}
