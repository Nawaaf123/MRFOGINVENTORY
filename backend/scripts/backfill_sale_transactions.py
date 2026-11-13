"""
One-time (idempotent) backfill: write sale ledger rows for historical orders.

Sales used to deduct warehouse_stock without an InventoryTransaction.
This inserts type=sale rows (negative qty) for every order line that is missing one.

Safe to re-run: skips lines that already have a matching sale at the order timestamp.
Also ensures Postgres enum has the 'sale' value.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Allow `python scripts/backfill_sale_transactions.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from database import engine, AsyncSessionLocal
from models import Order, InventoryTransaction


async def ensure_sale_enum() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_enum e
                    JOIN pg_type t ON e.enumtypid = t.oid
                    WHERE t.typname = 'transaction_type' AND e.enumlabel = 'sale'
                  ) THEN
                    ALTER TYPE transaction_type ADD VALUE 'sale';
                  END IF;
                END
                $$;
                """
            )
        )


async def backfill() -> int:
    await ensure_sale_enum()
    created = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Order).options(selectinload(Order.items)).order_by(Order.created_at.asc())
        )
        orders = result.scalars().unique().all()

        for order in orders:
            for oi in order.items:
                existing = await db.execute(
                    select(InventoryTransaction).where(
                        InventoryTransaction.type == "sale",
                        InventoryTransaction.item_id == oi.item_id,
                        InventoryTransaction.warehouse_id == oi.warehouse_id,
                        InventoryTransaction.quantity == -oi.quantity,
                        InventoryTransaction.created_at == order.created_at,
                    )
                )
                if existing.scalars().first():
                    continue
                db.add(
                    InventoryTransaction(
                        item_id=oi.item_id,
                        warehouse_id=oi.warehouse_id,
                        quantity=-oi.quantity,
                        type="sale",
                        created_at=order.created_at,
                    )
                )
                created += 1

        await db.commit()
    return created


async def main() -> None:
    n = await backfill()
    print(f"✓ Backfilled {n} sale transaction(s)")


if __name__ == "__main__":
    asyncio.run(main())
