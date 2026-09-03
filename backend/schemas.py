from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "user"


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Warehouses ────────────────────────────────────────────────────────────────

class WarehouseCreate(BaseModel):
    name: str
    location: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class WarehouseOut(BaseModel):
    id: UUID
    name: str
    location: Optional[str]
    color: Optional[str]
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReorderItem(BaseModel):
    id: UUID
    sort_order: int


class ReorderRequest(BaseModel):
    items: List[ReorderItem]


# ── Categories ────────────────────────────────────────────────────────────────

class SubCategoryCreate(BaseModel):
    name: str
    category_id: UUID


class SubCategoryOut(BaseModel):
    id: UUID
    name: str
    category_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str
    color: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class CategoryOut(BaseModel):
    id: UUID
    name: str
    color: Optional[str]
    created_at: datetime
    sub_categories: List[SubCategoryOut] = []

    model_config = {"from_attributes": True}


# ── Inventory Items ───────────────────────────────────────────────────────────

class InitialStock(BaseModel):
    warehouse_id: UUID
    quantity: int


class ItemCreate(BaseModel):
    name: str
    sku: str
    category: Optional[str] = None
    sub_category: Optional[str] = None
    min_stock: int = 0
    price: Decimal = Decimal("0")
    initial_stock: Optional[List[InitialStock]] = None


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    min_stock: Optional[int] = None
    price: Optional[Decimal] = None


class StockEntry(BaseModel):
    warehouse_id: UUID
    quantity: int

    model_config = {"from_attributes": True}


class ItemOut(BaseModel):
    id: UUID
    name: str
    sku: str
    category: Optional[str]
    sub_category: Optional[str]
    min_stock: int
    price: Decimal
    created_at: datetime
    updated_at: datetime
    stocks: List[StockEntry] = []

    model_config = {"from_attributes": True}


# ── Stock ─────────────────────────────────────────────────────────────────────

class StockUpdateRequest(BaseModel):
    item_id: UUID
    warehouse_id: UUID
    quantity: int


class StockReceiveRequest(BaseModel):
    item_id: UUID
    warehouse_id: UUID
    quantity: int
    bol_number: Optional[str] = None
    bol_document_url: Optional[str] = None


class StockTransferRequest(BaseModel):
    item_id: UUID
    from_warehouse_id: UUID
    to_warehouse_id: UUID
    quantity: int


class StockDelta(BaseModel):
    item_id: UUID
    warehouse_id: UUID
    delta: int


class ApplyDeltasRequest(BaseModel):
    changes: List[StockDelta]


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionOut(BaseModel):
    id: UUID
    item_id: UUID
    warehouse_id: UUID
    quantity: int
    bol_number: Optional[str]
    bol_document_url: Optional[str]
    type: str
    created_at: datetime
    item_name: Optional[str] = None
    warehouse_name: Optional[str] = None

    model_config = {"from_attributes": True}


class ReceivingUpdateItem(BaseModel):
    item_id: UUID
    warehouse_id: UUID
    quantity: int


class ReceivingUpdateRequest(BaseModel):
    bol_number: str
    new_bol_number: Optional[str] = None
    bol_document_url: Optional[str] = None
    items: List[ReceivingUpdateItem]


# ── Orders ────────────────────────────────────────────────────────────────────

class OrderItemCreate(BaseModel):
    item_id: UUID
    warehouse_id: UUID
    quantity: int
    unit_price: Decimal


class OrderCreate(BaseModel):
    shop_name: str
    shipping_fee: Decimal = Decimal("0")
    items: List[OrderItemCreate]


class OrderItemOut(BaseModel):
    id: UUID
    item_id: UUID
    warehouse_id: UUID
    quantity: int
    unit_price: Decimal
    created_at: datetime
    item_name: Optional[str] = None
    warehouse_name: Optional[str] = None

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: UUID
    shop_name: str
    status: str
    shipping_fee: Decimal
    cancelled_at: Optional[datetime]
    cancelled_reason: Optional[str]
    created_at: datetime
    items: List[OrderItemOut] = []

    model_config = {"from_attributes": True}


class OrderUpdate(BaseModel):
    shop_name: Optional[str] = None
    shipping_fee: Optional[Decimal] = None
    items: Optional[List[OrderItemCreate]] = None


class CancelRequest(BaseModel):
    reason: Optional[str] = None


# ── Wholesalers ───────────────────────────────────────────────────────────────

class WholesalerCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class WholesalerUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class WholesalerOut(BaseModel):
    id: UUID
    name: str
    contact_person: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Payments ──────────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    order_id: UUID
    amount: Decimal
    payment_date: datetime
    method: Optional[str] = None
    note: Optional[str] = None


class PaymentOut(BaseModel):
    id: UUID
    order_id: UUID
    amount: Decimal
    payment_date: datetime
    method: Optional[str]
    note: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: UUID
    item_id: UUID
    warehouse_id: UUID
    old_quantity: Optional[int]
    new_quantity: Optional[int]
    delta: Optional[int]
    changed_at: datetime

    model_config = {"from_attributes": True}
