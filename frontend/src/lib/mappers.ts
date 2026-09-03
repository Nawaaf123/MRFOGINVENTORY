import type {
  Category,
  InventoryItem,
  InventoryTransaction,
  Order,
  Payment,
  Warehouse,
  Wholesaler,
} from '@/types/inventory'

type Raw = Record<string, unknown>

export function mapUser(raw: Raw) {
  return {
    id: String(raw.id),
    email: String(raw.email ?? ''),
    name: String(raw.fullName ?? raw.name ?? ''),
    role: String(raw.role ?? 'user'),
  }
}

export function mapWarehouse(raw: Raw): Warehouse {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    location: String(raw.location ?? ''),
    color: String(raw.color ?? '#14b8a6'),
    sortOrder: Number(raw.sortOrder ?? 0),
  }
}

export function mapCategory(raw: Raw): Category {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    color: String(raw.color ?? ''),
  }
}

export function mapItem(raw: Raw): InventoryItem {
  const stocks = (raw.stock ?? raw.stocks ?? []) as Raw[]
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    sku: String(raw.sku ?? ''),
    category: String(raw.category ?? ''),
    subCategory: String(raw.subCategory ?? ''),
    minStock: Number(raw.minStock ?? 0),
    price: Number(raw.price ?? 0),
    lastUpdated: new Date(String(raw.lastUpdated ?? raw.updatedAt ?? Date.now())),
    stock: stocks.map((s) => ({
      warehouseId: String(s.warehouseId),
      warehouseName: String(s.warehouseName ?? ''),
      quantity: Number(s.quantity ?? 0),
    })),
  }
}

export function mapTransaction(raw: Raw): InventoryTransaction {
  return {
    id: String(raw.id),
    itemId: String(raw.itemId),
    itemName: String(raw.itemName ?? ''),
    itemSku: String(raw.itemSku ?? ''),
    warehouseId: String(raw.warehouseId),
    warehouseName: String(raw.warehouseName ?? ''),
    quantity: Number(raw.quantity ?? 0),
    bolNumber: String(raw.bolNumber ?? ''),
    bolDocumentUrl: (raw.bolDocumentUrl as string | null) ?? null,
    date: new Date(String(raw.date ?? raw.createdAt ?? Date.now())),
    type: raw.type as InventoryTransaction['type'],
  }
}

export function mapOrder(raw: Raw): Order {
  const items = (raw.items ?? []) as Raw[]
  return {
    id: String(raw.id),
    shopName: String(raw.shopName ?? ''),
    date: new Date(String(raw.date ?? raw.createdAt ?? Date.now())),
    status: (raw.status as Order['status']) ?? 'pending',
    shippingFee: Number(raw.shippingFee ?? 0),
    cancelledAt: raw.cancelledAt ? new Date(String(raw.cancelledAt)) : null,
    cancelledReason: (raw.cancelledReason as string | null) ?? null,
    items: items.map((item) => ({
      itemId: String(item.itemId),
      itemName: String(item.itemName ?? ''),
      itemSku: String(item.itemSku ?? ''),
      warehouseId: String(item.warehouseId),
      warehouseName: String(item.warehouseName ?? ''),
      quantity: Number(item.quantity ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
    })),
  }
}

export function mapWholesaler(raw: Raw): Wholesaler {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    contactPerson: String(raw.contactPerson ?? ''),
    phone: String(raw.phone ?? ''),
    email: String(raw.email ?? ''),
    address: String(raw.address ?? ''),
  }
}

export function mapPayment(raw: Raw): Payment {
  return {
    id: String(raw.id),
    orderId: String(raw.orderId),
    amount: Number(raw.amount ?? 0),
    paymentDate: new Date(String(raw.paymentDate ?? Date.now())),
    method: String(raw.method ?? ''),
    note: String(raw.note ?? ''),
  }
}
