from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Payment
from schemas import PaymentCreate, PaymentOut
from auth import get_current_user

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("", response_model=List[PaymentOut])
async def list_payments(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Payment).order_by(Payment.payment_date.desc()))
    return result.scalars().all()


@router.post("", response_model=PaymentOut)
async def create_payment(body: PaymentCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    payment = Payment(**body.model_dump())
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


@router.delete("/{payment_id}")
async def delete_payment(payment_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    await db.delete(payment)
    await db.commit()
    return {"ok": True}
