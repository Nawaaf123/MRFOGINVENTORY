from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Wholesaler
from schemas import WholesalerCreate, WholesalerUpdate, WholesalerOut
from auth import get_current_user

router = APIRouter(prefix="/api/wholesalers", tags=["wholesalers"])


@router.get("", response_model=List[WholesalerOut])
async def list_wholesalers(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Wholesaler).order_by(Wholesaler.name))
    return result.scalars().all()


@router.post("", response_model=WholesalerOut)
async def create_wholesaler(body: WholesalerCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    ws = Wholesaler(**body.model_dump())
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


@router.put("/{wholesaler_id}", response_model=WholesalerOut)
async def update_wholesaler(wholesaler_id: UUID, body: WholesalerUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Wholesaler).where(Wholesaler.id == wholesaler_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Wholesaler not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(ws, k, v)
    await db.commit()
    await db.refresh(ws)
    return ws


@router.delete("/{wholesaler_id}")
async def delete_wholesaler(wholesaler_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Wholesaler).where(Wholesaler.id == wholesaler_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Wholesaler not found")
    await db.delete(ws)
    await db.commit()
    return {"ok": True}
