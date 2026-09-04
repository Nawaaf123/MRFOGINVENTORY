"""Forward-walking stock ledger that closes at live warehouse_stock."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from uuid import UUID


# Ledger sign rules
POSITIVE_TYPES = frozenset({"receive", "transfer_in", "order_cancelled"})
NEGATIVE_TYPES = frozenset({"sale", "transfer_out"})
SIGNED_AS_IS = frozenset({"opening_balance", "manual_adjust", "adjust"})

# Ops report buckets (order_cancelled is Returned, not Received)
RECEIVED_TYPES = frozenset({"receive", "transfer_in"})
SOLD_TYPES = frozenset({"sale", "transfer_out"})
RETURNED_TYPES = frozenset({"order_cancelled"})


def signed_quantity(entry_type: str, quantity: int) -> int:
    """Convert a movement to a signed delta for the ledger walk."""
    if entry_type in POSITIVE_TYPES:
        return abs(quantity)
    if entry_type in NEGATIVE_TYPES:
        return -abs(quantity)
    if entry_type == "implied_opening":
        return quantity
    return quantity


@dataclass
class LedgerEntry:
    id: str
    type: str
    quantity: int
    signed_quantity: int
    remaining_after: int
    date: datetime
    warehouse_id: Optional[str]
    warehouse_name: Optional[str]
    source: Optional[str] = None
    bol_number: Optional[str] = None
    bol_document_url: Optional[str] = None


@dataclass
class WarehouseBreakdown:
    warehouse_id: str
    warehouse_name: str
    received: int = 0
    sold: int = 0
    returned: int = 0
    remaining: int = 0


@dataclass
class ItemSummary:
    item_id: str
    item_name: str
    item_sku: str
    category: Optional[str]
    sub_category: Optional[str]
    current_stock: int
    received: int
    sold: int
    returned: int
    remaining: int
    implied_opening: int
    warehouse_breakdown: list[WarehouseBreakdown] = field(default_factory=list)
    ledger: list[LedgerEntry] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "item_name": self.item_name,
            "item_sku": self.item_sku,
            "category": self.category,
            "sub_category": self.sub_category,
            "current_stock": self.current_stock,
            "received": self.received,
            "sold": self.sold,
            "returned": self.returned,
            "remaining": self.remaining,
            "implied_opening": self.implied_opening,
            "warehouse_breakdown": [
                {
                    "warehouse_id": w.warehouse_id,
                    "warehouse_name": w.warehouse_name,
                    "received": w.received,
                    "sold": w.sold,
                    "returned": w.returned,
                    "remaining": w.remaining,
                }
                for w in self.warehouse_breakdown
            ],
            "ledger": [
                {
                    "id": e.id,
                    "type": e.type,
                    "quantity": e.quantity,
                    "signed_quantity": e.signed_quantity,
                    "remaining_after": e.remaining_after,
                    "date": e.date,
                    "warehouse_id": e.warehouse_id,
                    "warehouse_name": e.warehouse_name,
                    "source": e.source,
                    "bol_number": e.bol_number,
                    "bol_document_url": e.bol_document_url,
                }
                for e in self.ledger
            ],
        }


def _accumulate_totals(
    received: int, sold: int, returned: int, entry_type: str, signed: int
) -> tuple[int, int, int]:
    if entry_type in ("opening_balance", "implied_opening"):
        return received, sold, returned
    if entry_type in RECEIVED_TYPES:
        return received + abs(signed), sold, returned
    if entry_type in RETURNED_TYPES:
        return received, sold, returned + abs(signed)
    if entry_type in SOLD_TYPES:
        return received, sold + abs(signed), returned
    if entry_type in SIGNED_AS_IS:
        if signed > 0:
            return received + signed, sold, returned
        if signed < 0:
            return received, sold + abs(signed), returned
    return received, sold, returned


def build_item_summary(
    *,
    item_id: UUID,
    item_name: str,
    item_sku: str,
    category: Optional[str],
    sub_category: Optional[str],
    stocks: list[dict[str, Any]],
    transactions: list[dict[str, Any]],
    order_lines: list[dict[str, Any]],
    warehouse_filter: Optional[UUID] = None,
    warehouses: Optional[dict[str, str]] = None,
    include_ledger: bool = True,
) -> ItemSummary:
    """
    stocks: [{warehouse_id, warehouse_name, quantity}]
    transactions: [{id, type, quantity, created_at, warehouse_id, warehouse_name, bol_number, ...}]
    order_lines: ALL order lines including cancelled (as sales); cancels also appear as order_cancelled txs
    """
    warehouses = warehouses or {}

    def wh_name(wid: Any) -> str:
        key = str(wid)
        return warehouses.get(key) or next(
            (s.get("warehouse_name") or "" for s in stocks if str(s["warehouse_id"]) == key),
            "",
        )

    if warehouse_filter:
        wf = str(warehouse_filter)
        current_stock = sum(
            int(s["quantity"]) for s in stocks if str(s["warehouse_id"]) == wf
        )
    else:
        current_stock = sum(int(s["quantity"]) for s in stocks)

    raw_entries: list[dict[str, Any]] = []

    for t in transactions:
        if warehouse_filter and str(t["warehouse_id"]) != str(warehouse_filter):
            continue
        raw_entries.append(
            {
                "id": str(t["id"]),
                "type": t["type"],
                "quantity": int(t["quantity"]),
                "date": t["created_at"],
                "warehouse_id": str(t["warehouse_id"]) if t.get("warehouse_id") else None,
                "warehouse_name": t.get("warehouse_name") or wh_name(t.get("warehouse_id")),
                "source": t.get("bol_number") or t.get("source"),
                "bol_number": t.get("bol_number"),
                "bol_document_url": t.get("bol_document_url"),
            }
        )

    for line in order_lines:
        if warehouse_filter and str(line["warehouse_id"]) != str(warehouse_filter):
            continue
        shop = line.get("shop_name") or ""
        if line.get("order_status") == "cancelled":
            source = f"{shop} (cancelled)" if shop else "Sale (cancelled)"
        else:
            source = shop or None
        raw_entries.append(
            {
                "id": str(line["id"]),
                "type": "sale",
                "quantity": int(line["quantity"]),
                "date": line["created_at"],
                "warehouse_id": str(line["warehouse_id"]) if line.get("warehouse_id") else None,
                "warehouse_name": line.get("warehouse_name") or wh_name(line.get("warehouse_id")),
                "source": source,
                "bol_number": None,
                "bol_document_url": None,
            }
        )

    raw_entries.sort(key=lambda e: (e["date"] or datetime.min, e["id"]))

    signed_entries = []
    for e in raw_entries:
        signed = signed_quantity(e["type"], e["quantity"])
        signed_entries.append({**e, "signed_quantity": signed})

    net_movements = sum(e["signed_quantity"] for e in signed_entries)
    implied_opening = current_stock - net_movements

    received = 0
    sold = 0
    returned = 0
    for e in signed_entries:
        received, sold, returned = _accumulate_totals(
            received, sold, returned, e["type"], e["signed_quantity"]
        )

    running = implied_opening
    ledger: list[LedgerEntry] = []

    if include_ledger:
        if implied_opening != 0:
            ledger.append(
                LedgerEntry(
                    id=f"implied-opening-{item_id}",
                    type="implied_opening",
                    quantity=implied_opening,
                    signed_quantity=implied_opening,
                    remaining_after=max(0, implied_opening),
                    date=signed_entries[0]["date"] if signed_entries else datetime.utcnow(),
                    warehouse_id=str(warehouse_filter) if warehouse_filter else None,
                    warehouse_name=wh_name(warehouse_filter) if warehouse_filter else "All warehouses",
                    source="Implied opening (closes ledger to live stock)",
                )
            )

        for e in signed_entries:
            running += e["signed_quantity"]
            ledger.append(
                LedgerEntry(
                    id=e["id"],
                    type=e["type"],
                    quantity=e["quantity"],
                    signed_quantity=e["signed_quantity"],
                    remaining_after=max(0, running),
                    date=e["date"],
                    warehouse_id=e["warehouse_id"],
                    warehouse_name=e["warehouse_name"],
                    source=e.get("source"),
                    bol_number=e.get("bol_number"),
                    bol_document_url=e.get("bol_document_url"),
                )
            )

        ledger.reverse()

    breakdown_map: dict[str, WarehouseBreakdown] = {}
    for s in stocks:
        wid = str(s["warehouse_id"])
        breakdown_map[wid] = WarehouseBreakdown(
            warehouse_id=wid,
            warehouse_name=s.get("warehouse_name") or wh_name(wid),
            remaining=int(s["quantity"]),
        )

    all_for_breakdown: list[tuple[str, str, int]] = []
    for t in transactions:
        wid = str(t["warehouse_id"])
        signed = signed_quantity(t["type"], int(t["quantity"]))
        all_for_breakdown.append((wid, t["type"], signed))
    for line in order_lines:
        wid = str(line["warehouse_id"])
        signed = signed_quantity("sale", int(line["quantity"]))
        all_for_breakdown.append((wid, "sale", signed))

    for wid, etype, signed in all_for_breakdown:
        if wid not in breakdown_map:
            breakdown_map[wid] = WarehouseBreakdown(
                warehouse_id=wid,
                warehouse_name=wh_name(wid),
                remaining=0,
            )
        bd = breakdown_map[wid]
        r, s, ret = _accumulate_totals(bd.received, bd.sold, bd.returned, etype, signed)
        bd.received, bd.sold, bd.returned = r, s, ret

    return ItemSummary(
        item_id=str(item_id),
        item_name=item_name,
        item_sku=item_sku,
        category=category,
        sub_category=sub_category,
        current_stock=current_stock,
        received=received,
        sold=sold,
        returned=returned,
        remaining=current_stock,
        implied_opening=implied_opening,
        warehouse_breakdown=sorted(breakdown_map.values(), key=lambda w: w.warehouse_name),
        ledger=ledger,
    )
