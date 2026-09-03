"""
Run this script to create all tables and seed a default admin user.
Usage: python init_db.py
"""
import asyncio
from sqlalchemy import text
from database import engine, Base
from models import (
    User, Warehouse, Category, SubCategory, InventoryItem,
    WarehouseStock, InventoryTransaction, Order, OrderItem,
    Wholesaler, Payment, StockAuditLog,
)
from auth import hash_password
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✓ Tables created")


async def seed_admin():
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == "admin@stockkeeper.com"))
        existing = result.scalar_one_or_none()
        if existing:
            print("✓ Admin user already exists")
            return
        admin = User(
            email="admin@stockkeeper.com",
            password_hash=hash_password("admin123"),
            full_name="Admin User",
            role="admin",
        )
        db.add(admin)
        await db.commit()
        print("✓ Admin user created: admin@stockkeeper.com / admin123")


async def main():
    await create_tables()
    await seed_admin()
    await engine.dispose()
    print("✓ Database initialization complete")


if __name__ == "__main__":
    asyncio.run(main())
