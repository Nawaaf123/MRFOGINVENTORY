from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Category, SubCategory
from schemas import CategoryCreate, CategoryUpdate, CategoryOut, SubCategoryCreate, SubCategoryOut
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["categories"])


@router.get("/categories", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Category).options(selectinload(Category.sub_categories)).order_by(Category.name)
    )
    return result.scalars().all()


@router.post("/categories", response_model=CategoryOut)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    cat = Category(**body.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    result = await db.execute(
        select(Category).options(selectinload(Category.sub_categories)).where(Category.id == cat.id)
    )
    return result.scalar_one()


@router.put("/categories/{category_id}", response_model=CategoryOut)
async def update_category(category_id: UUID, body: CategoryUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Category).options(selectinload(Category.sub_categories)).where(Category.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}")
async def delete_category(category_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(cat)
    await db.commit()
    return {"ok": True}


@router.post("/sub-categories", response_model=SubCategoryOut)
async def create_sub_category(body: SubCategoryCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    sub = SubCategory(**body.model_dump())
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/sub-categories/{sub_id}")
async def delete_sub_category(sub_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(SubCategory).where(SubCategory.id == sub_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Sub-category not found")
    await db.delete(sub)
    await db.commit()
    return {"ok": True}
