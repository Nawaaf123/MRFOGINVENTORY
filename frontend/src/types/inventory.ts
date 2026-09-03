export interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  subCategory: string;
  stock: WarehouseStock[];
  minStock: number;
  price: number;
  lastUpdated: Date;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  color: string;
  sortOrder: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export type SortField = 'name' | 'quantity' | 'price' | 'lastUpdated';
export type SortDirection = 'asc' | 'desc';

export interface InventoryTransaction {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  bolNumber: string;
  bolDocumentUrl?: string | null;
  date: Date;
  type: 'receive' | 'adjust' | 'transfer_in' | 'transfer_out' | 'opening_balance' | 'manual_adjust' | 'order_cancelled';
}

export interface OrderItem {
  itemId: string;
  itemName: string;
  itemSku: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  shopName: string;
  items: OrderItem[];
  date: Date;
  status: 'pending' | 'completed' | 'cancelled';
  shippingFee: number;
  cancelledAt?: Date | null;
  cancelledReason?: string | null;
}

export interface Wholesaler {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  paymentDate: Date;
  method: string;
  note: string;
}
