from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import StockAuditLog
from schemas import AuditLogOut
from auth import get_current_user

router = APIRouter(prefix="/api/audit-log", tags=["audit"])


@router.get("", response_model=List[AuditLogOut])
async def list_audit_log(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(StockAuditLog).order_by(StockAuditLog.changed_at.desc()))
    return result.scalars().all()
