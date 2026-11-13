from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload

from database import get_db
from models import (
    WarehouseStock,
    InventoryTransaction,
    StockAuditLog,
    InventoryItem,
    Order,
    OrderItem,
    Warehouse,
)
from schemas import (
    StockUpdateRequest,
    StockReceiveRequest,
    StockTransferRequest,
    StockReceiveBatchRequest,
    StockTransferBatchRequest,
    StockAdjustBatchRequest,
    ApplyDeltasRequest,
    StockSummaryResponse,
)
from auth import get_current_user
from services.stock_summary import build_item_summary

router = APIRouter(prefix="/api/stock", tags=["stock"])


async def _upsert_stock(db: AsyncSession, item_id, warehouse_id, new_qty: int) -> tuple[WarehouseStock, int]:
    """Returns (stock, delta)."""
    result = await db.execute(
        select(WarehouseStock).where(
            WarehouseStock.item_id == item_id,
            WarehouseStock.warehouse_id == warehouse_id,
        )
    )
    stock = result.scalar_one_or_none()
    old_qty = stock.quantity if stock else 0
    if stock:
        stock.quantity = new_qty
    else:
        stock = WarehouseStock(item_id=item_id, warehouse_id=warehouse_id, quantity=new_qty)
        db.add(stock)
    delta = new_qty - old_qty
    audit = StockAuditLog(
        item_id=item_id,
        warehouse_id=warehouse_id,
        old_quantity=old_qty,
        new_quantity=new_qty,
        delta=delta,
    )
    db.add(audit)
    return stock, delta


async def _apply_delta(db: AsyncSession, item_id, warehouse_id, delta: int) -> WarehouseStock:
    """Apply a stock delta. Never silently clamps — oversell raises 400."""
    result = await db.execute(
        select(WarehouseStock).where(
            WarehouseStock.item_id == item_id,
            WarehouseStock.warehouse_id == warehouse_id,
        )
    )
    stock = result.scalar_one_or_none()
    old_qty = stock.quantity if stock else 0
    new_qty = old_qty + delta
    if new_qty < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock: available {old_qty}, tried delta {delta}",
        )
    if stock:
        stock.quantity = new_qty
    else:
        stock = WarehouseStock(item_id=item_id, warehouse_id=warehouse_id, quantity=new_qty)
        db.add(stock)
    audit = StockAuditLog(
        item_id=item_id,
        warehouse_id=warehouse_id,
        old_quantity=old_qty,
        new_quantity=new_qty,
        delta=delta,
    )
    db.add(audit)
    return stock


async def _available_qty(db: AsyncSession, item_id, warehouse_id) -> int:
    result = await db.execute(
        select(WarehouseStock).where(
            WarehouseStock.item_id == item_id,
            WarehouseStock.warehouse_id == warehouse_id,
        )
    )
    stock = result.scalar_one_or_none()
    return stock.quantity if stock else 0


@router.get("/drift")
async def stock_drift(
    warehouse_id: Optional[UUID] = Query(None),
    q: Optional[str] = Query(None),
    only_drift: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Compare live warehouse_stock to SUM(transaction.quantity) per item/warehouse."""
    tx_sums = (
        await db.execute(
            select(
                InventoryTransaction.item_id,
                InventoryTransaction.warehouse_id,
                func.coalesce(func.sum(InventoryTransaction.quantity), 0),
            ).group_by(InventoryTransaction.item_id, InventoryTransaction.warehouse_id)
        )
    ).all()
    tx_map = {(row[0], row[1]): int(row[2]) for row in tx_sums}

    items_q = select(InventoryItem).options(
        selectinload(InventoryItem.stocks).joinedload(WarehouseStock.warehouse)
    ).order_by(InventoryItem.sku)
    items = (await db.execute(items_q)).scalars().unique().all()
    if q and q.strip():
        needle = q.strip().lower()
        items = [
            i for i in items
            if needle in (i.name or "").lower() or needle in (i.sku or "").lower()
        ]

    warehouses = (await db.execute(select(Warehouse))).scalars().all()
    rows = []
    for item in items:
        stocks = item.stocks
        if warehouse_id:
            stocks = [s for s in stocks if s.warehouse_id == warehouse_id]
        for s in stocks:
            tx_sum = tx_map.get((item.id, s.warehouse_id), 0)
            drift = int(s.quantity or 0) - tx_sum
            if only_drift and drift == 0:
                continue
            rows.append({
                "item_id": item.id,
                "item_name": item.name,
                "item_sku": item.sku,
                "warehouse_id": s.warehouse_id,
                "warehouse_name": s.warehouse.name if s.warehouse else None,
                "current_stock": int(s.quantity or 0),
                "tx_sum": tx_sum,
                "drift": drift,
            })
    return {"items": rows, "warehouses": [{"id": w.id, "name": w.name} for w in warehouses]}


@router.get("/summary", response_model=StockSummaryResponse)
async def stock_summary(
    warehouse_id: Optional[UUID] = Query(None),
    item_id: Optional[UUID] = Query(None),
    q: Optional[str] = Query(None),
    include_ledger: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    # Detail expand: always include ledger for a single item
    if item_id is not None:
        include_ledger = True

    items_q = select(InventoryItem).options(
        selectinload(InventoryItem.stocks).joinedload(WarehouseStock.warehouse)
    ).order_by(InventoryItem.sku)
    if item_id:
        items_q = items_q.where(InventoryItem.id == item_id)
    items = (await db.execute(items_q)).scalars().unique().all()

    if q and q.strip():
        needle = q.strip().lower()
        items = [
            i for i in items
            if needle in (i.name or "").lower()
            or needle in (i.sku or "").lower()
            or needle in (i.category or "").lower()
            or needle in (i.sub_category or "").lower()
        ]

    warehouses = (await db.execute(select(Warehouse))).scalars().all()
    warehouse_names = {str(w.id): w.name for w in warehouses}

    # Lightweight rows (no ORM relationship hydration) — much faster at scale
    tx_q = select(
        InventoryTransaction.id,
        InventoryTransaction.item_id,
        InventoryTransaction.warehouse_id,
        InventoryTransaction.quantity,
        InventoryTransaction.type,
        InventoryTransaction.created_at,
        InventoryTransaction.bol_number,
        InventoryTransaction.bol_document_url,
        InventoryTransaction.note,
    )
    if item_id:
        tx_q = tx_q.where(InventoryTransaction.item_id == item_id)
    tx_rows = (await db.execute(tx_q)).all()

    txs_by_item: dict[str, list] = {}
    items_with_sale: set[str] = set()
    for t in tx_rows:
        key = str(t.item_id)
        if t.type == "sale":
            items_with_sale.add(key)
        txs_by_item.setdefault(key, []).append(
            {
                "id": t.id,
                "type": t.type,
                "quantity": t.quantity,
                "created_at": t.created_at,
                "warehouse_id": t.warehouse_id,
                "warehouse_name": warehouse_names.get(str(t.warehouse_id)),
                "bol_number": t.bol_number,
                "bol_document_url": t.bol_document_url,
                "note": t.note,
                "source": t.note,
            }
        )

    # Legacy sold counts from order lines only for items that never wrote sale txs
    lines_by_item: dict[str, list] = {}
    legacy_needed = [i for i in items if str(i.id) not in items_with_sale]
    if legacy_needed:
        legacy_ids = [i.id for i in legacy_needed]
        line_q = (
            select(
                OrderItem.id,
                OrderItem.item_id,
                OrderItem.warehouse_id,
                OrderItem.quantity,
                Order.created_at,
                Order.shop_name,
                Order.status,
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(OrderItem.item_id.in_(legacy_ids))
        )
        if item_id:
            line_q = line_q.where(OrderItem.item_id == item_id)
        for row in (await db.execute(line_q)).all():
            key = str(row.item_id)
            lines_by_item.setdefault(key, []).append(
                {
                    "id": row.id,
                    "quantity": row.quantity,
                    "created_at": row.created_at,
                    "warehouse_id": row.warehouse_id,
                    "warehouse_name": warehouse_names.get(str(row.warehouse_id)),
                    "shop_name": row.shop_name,
                    "order_status": row.status,
                }
            )

    summaries = []
    for item in items:
        stocks = [
            {
                "warehouse_id": s.warehouse_id,
                "warehouse_name": s.warehouse.name if s.warehouse else warehouse_names.get(str(s.warehouse_id)),
                "quantity": s.quantity,
            }
            for s in item.stocks
        ]
        summary = build_item_summary(
            item_id=item.id,
            item_name=item.name,
            item_sku=item.sku,
            category=item.category,
            sub_category=item.sub_category,
            stocks=stocks,
            transactions=txs_by_item.get(str(item.id), []),
            order_lines=lines_by_item.get(str(item.id), []),
            warehouse_filter=warehouse_id,
            warehouses=warehouse_names,
            include_ledger=include_ledger,
        )
        summaries.append(summary.to_dict())

    return {"warehouse_id": warehouse_id, "items": summaries}


@router.put("/update")
async def update_stock(body: StockUpdateRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    _, delta = await _upsert_stock(db, body.item_id, body.warehouse_id, body.quantity)
    if delta != 0:
        db.add(
            InventoryTransaction(
                item_id=body.item_id,
                warehouse_id=body.warehouse_id,
                quantity=delta,
                type="manual_adjust",
            )
        )
    await db.commit()
    return {"ok": True}


@router.post("/adjust-batch")
async def adjust_stock_batch(body: StockAdjustBatchRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item is required")
    changed = 0
    for line in body.items:
        if line.quantity < 0:
            raise HTTPException(status_code=400, detail="Quantity cannot be negative")
        _, delta = await _upsert_stock(db, line.item_id, body.warehouse_id, line.quantity)
        if delta != 0:
            changed += 1
            db.add(
                InventoryTransaction(
                    item_id=line.item_id,
                    warehouse_id=body.warehouse_id,
                    quantity=delta,
                    type="manual_adjust",
                )
            )
    await db.commit()
    return {"ok": True, "changed": changed}


@router.post("/receive")
async def receive_stock(body: StockReceiveRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    await _apply_delta(db, body.item_id, body.warehouse_id, body.quantity)
    tx = InventoryTransaction(
        item_id=body.item_id,
        warehouse_id=body.warehouse_id,
        quantity=body.quantity,
        bol_number=body.bol_number,
        bol_document_url=body.bol_document_url,
        type="receive",
    )
    db.add(tx)
    await db.commit()
    return {"ok": True}


@router.post("/receive-batch")
async def receive_stock_batch(body: StockReceiveBatchRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    if not body.bol_number.strip():
        raise HTTPException(status_code=400, detail="BOL number is required")
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item is required")
    for line in body.items:
        if line.quantity <= 0:
            raise HTTPException(status_code=400, detail="Receive quantity must be positive")
        await _apply_delta(db, line.item_id, body.warehouse_id, line.quantity)
        db.add(
            InventoryTransaction(
                item_id=line.item_id,
                warehouse_id=body.warehouse_id,
                quantity=line.quantity,
                bol_number=body.bol_number.strip(),
                bol_document_url=body.bol_document_url,
                type="receive",
            )
        )
    await db.commit()
    return {"ok": True, "count": len(body.items)}


@router.post("/transfer")
async def transfer_stock(body: StockTransferRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Transfer quantity must be positive")
    if body.from_warehouse_id == body.to_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouses must differ")

    available = await _available_qty(db, body.item_id, body.from_warehouse_id)
    if available < body.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock in source warehouse ({available} available)",
        )

    wh_rows = (
        await db.execute(
            select(Warehouse).where(
                Warehouse.id.in_([body.from_warehouse_id, body.to_warehouse_id])
            )
        )
    ).scalars().all()
    wh_names = {w.id: w.name for w in wh_rows}
    from_name = wh_names.get(body.from_warehouse_id, "Source")
    to_name = wh_names.get(body.to_warehouse_id, "Destination")

    await _apply_delta(db, body.item_id, body.from_warehouse_id, -body.quantity)
    await _apply_delta(db, body.item_id, body.to_warehouse_id, body.quantity)
    db.add(
        InventoryTransaction(
            item_id=body.item_id,
            warehouse_id=body.from_warehouse_id,
            quantity=-body.quantity,
            type="transfer_out",
            note=f"To {to_name}",
        )
    )
    db.add(
        InventoryTransaction(
            item_id=body.item_id,
            warehouse_id=body.to_warehouse_id,
            quantity=body.quantity,
            type="transfer_in",
            note=f"From {from_name}",
        )
    )
    await db.commit()
    return {"ok": True}


@router.post("/transfer-batch")
async def transfer_stock_batch(body: StockTransferBatchRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    if body.from_warehouse_id == body.to_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouses must differ")
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    # Pre-check all lines (aggregate duplicate SKUs)
    needed: dict[UUID, int] = {}
    for line in body.items:
        if line.quantity <= 0:
            raise HTTPException(status_code=400, detail="Transfer quantity must be positive")
        needed[line.item_id] = needed.get(line.item_id, 0) + line.quantity

    for item_id, qty in needed.items():
        available = await _available_qty(db, item_id, body.from_warehouse_id)
        if available < qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for item {item_id} ({available} available, need {qty})",
            )

    wh_rows = (
        await db.execute(
            select(Warehouse).where(
                Warehouse.id.in_([body.from_warehouse_id, body.to_warehouse_id])
            )
        )
    ).scalars().all()
    wh_names = {w.id: w.name for w in wh_rows}
    from_name = wh_names.get(body.from_warehouse_id, "Source")
    to_name = wh_names.get(body.to_warehouse_id, "Destination")

    for line in body.items:
        await _apply_delta(db, line.item_id, body.from_warehouse_id, -line.quantity)
        await _apply_delta(db, line.item_id, body.to_warehouse_id, line.quantity)
        db.add(
            InventoryTransaction(
                item_id=line.item_id,
                warehouse_id=body.from_warehouse_id,
                quantity=-line.quantity,
                type="transfer_out",
                note=f"To {to_name}",
            )
        )
        db.add(
            InventoryTransaction(
                item_id=line.item_id,
                warehouse_id=body.to_warehouse_id,
                quantity=line.quantity,
                type="transfer_in",
                note=f"From {from_name}",
            )
        )
    await db.commit()
    return {"ok": True, "count": len(body.items)}


@router.post("/apply-deltas")
async def apply_deltas(body: ApplyDeltasRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    for change in body.changes:
        if change.delta == 0:
            continue
        await _apply_delta(db, change.item_id, change.warehouse_id, change.delta)
        db.add(
            InventoryTransaction(
                item_id=change.item_id,
                warehouse_id=change.warehouse_id,
                quantity=change.delta,
                type="manual_adjust",
            )
        )
    await db.commit()
    return {"ok": True}
