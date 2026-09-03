import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api'
import {
  mapCategory,
  mapItem,
  mapOrder,
  mapPayment,
  mapTransaction,
  mapWarehouse,
  mapWholesaler,
} from '@/lib/mappers'
import type {
  InventoryItem,
  Warehouse,
  Order,
  InventoryTransaction,
  Payment,
  Wholesaler,
  Category,
  SortField,
  SortDirection,
} from '@/types/inventory'
import { getTotalQuantity } from '@/lib/utils'

export interface InventoryStats {
  totalItems: number
  totalValue: number
  lowStockCount: number
  warehouseCounts: Record<string, number>
}

export function useInventory() {
  const [allItems, setAllItems] = useState<InventoryItem[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [subCategoryFilter, setSubCategoryFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, warehousesRes, ordersRes, txRes, paymentsRes, wholesalersRes, catsRes] =
        await Promise.all([
          apiGet<Record<string, unknown>[]>('/api/items'),
          apiGet<Record<string, unknown>[]>('/api/warehouses'),
          apiGet<Record<string, unknown>[]>('/api/orders'),
          apiGet<Record<string, unknown>[]>('/api/transactions'),
          apiGet<Record<string, unknown>[]>('/api/payments'),
          apiGet<Record<string, unknown>[]>('/api/wholesalers'),
          apiGet<Record<string, unknown>[]>('/api/categories'),
        ])
      setAllItems(itemsRes.map(mapItem))
      setWarehouses(warehousesRes.map(mapWarehouse))
      setOrders(ordersRes.map(mapOrder))
      setTransactions(txRes.map(mapTransaction))
      setPayments(paymentsRes.map(mapPayment))
      setWholesalers(wholesalersRes.map(mapWholesaler))
      setCategories(catsRes.map(mapCategory))
    } catch (err) {
      console.error('Failed to fetch data', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const items = allItems
    .filter((item) => {
      const q = searchQuery.toLowerCase().trim()
      if (q) {
        const haystack = [item.name, item.sku, item.category, item.subCategory]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (categoryFilter && item.category !== categoryFilter) return false
      if (subCategoryFilter && item.subCategory !== subCategoryFilter) return false
      if (warehouseFilter) {
        const hasStock = item.stock.some((s) => s.warehouseId === warehouseFilter && s.quantity > 0)
        if (!hasStock) return false
      }
      return true
    })
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1
      if (sortField === 'name') return a.name.localeCompare(b.name) * dir
      if (sortField === 'quantity')
        return (getTotalQuantity(a) - getTotalQuantity(b)) * dir
      if (sortField === 'price') return (a.price - b.price) * dir
      if (sortField === 'lastUpdated')
        return (new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime()) * dir
      return 0
    })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const stats: InventoryStats = {
    totalItems: allItems.length,
    totalValue: allItems.reduce((sum, i) => sum + i.price * getTotalQuantity(i), 0),
    lowStockCount: allItems.filter((i) => getTotalQuantity(i) <= i.minStock).length,
    warehouseCounts: warehouses.reduce(
      (acc, w) => {
        acc[w.id] = allItems.reduce(
          (sum, i) => sum + (i.stock.find((s) => s.warehouseId === w.id)?.quantity ?? 0),
          0
        )
        return acc
      },
      {} as Record<string, number>
    ),
  }

  // CRUD operations
  const addItem = async (data: {
    name: string
    sku: string
    category?: string
    subCategory?: string
    minStock?: number
    price?: number
    initialStock?: { warehouseId: string; quantity: number }[]
  }) => {
    await apiPost('/api/items', data)
    await fetchAll()
  }

  const updateItem = async (id: string, data: Partial<InventoryItem>) => {
    await apiPut(`/api/items/${id}`, {
      name: data.name,
      sku: data.sku,
      category: data.category,
      subCategory: data.subCategory,
      minStock: data.minStock,
      price: data.price,
    })
    await fetchAll()
  }

  const deleteItem = async (id: string) => {
    await apiDelete(`/api/items/${id}`)
    await fetchAll()
  }

  const receiveStock = async (data: {
    itemId: string
    warehouseId: string
    quantity: number
    bolNumber: string
    bolDocumentUrl?: string
  }) => {
    await apiPost('/api/stock/receive', data)
    await fetchAll()
  }

  const updateStock = async (itemId: string, warehouseId: string, quantity: number) => {
    await apiPut('/api/stock/update', { itemId, warehouseId, quantity })
    await fetchAll()
  }

  const transferStock = async (data: {
    itemId: string
    fromWarehouseId: string
    toWarehouseId: string
    quantity: number
  }) => {
    await apiPost('/api/stock/transfer', data)
    await fetchAll()
  }

  const createOrder = async (data: {
    shopName: string
    shippingFee?: number
    items: { itemId: string; warehouseId: string; quantity: number; unitPrice: number }[]
  }) => {
    await apiPost('/api/orders', data)
    await fetchAll()
  }

  const updateOrder = async (id: string, data: Partial<Order>) => {
    await apiPut(`/api/orders/${id}`, data)
    await fetchAll()
  }

  const completeOrder = async (id: string) => {
    await apiPost(`/api/orders/${id}/complete`)
    await fetchAll()
  }

  const deleteOrder = async (id: string, reason?: string) => {
    await apiPost(`/api/orders/${id}/cancel`, { reason })
    await fetchAll()
  }

  const addWholesaler = async (data: Omit<Wholesaler, 'id'>) => {
    await apiPost('/api/wholesalers', data)
    await fetchAll()
  }

  const updateWholesaler = async (id: string, data: Partial<Wholesaler>) => {
    await apiPut(`/api/wholesalers/${id}`, data)
    await fetchAll()
  }

  const deleteWholesaler = async (id: string) => {
    await apiDelete(`/api/wholesalers/${id}`)
    await fetchAll()
  }

  const addPayment = async (data: Omit<Payment, 'id'>) => {
    await apiPost('/api/payments', {
      ...data,
      paymentDate: data.paymentDate instanceof Date ? data.paymentDate.toISOString() : data.paymentDate,
    })
    await fetchAll()
  }

  const deletePayment = async (id: string) => {
    await apiDelete(`/api/payments/${id}`)
    await fetchAll()
  }

  const addWarehouse = async (data: { name: string; location?: string; color?: string }) => {
    await apiPost('/api/warehouses', data)
    await fetchAll()
  }

  const updateWarehouse = async (id: string, data: Partial<Warehouse>) => {
    await apiPut(`/api/warehouses/${id}`, data)
    await fetchAll()
  }

  const reorderWarehouse = async (id: string, sortOrder: number) => {
    await apiPut('/api/warehouses/reorder', { items: [{ id, sortOrder }] })
    await fetchAll()
  }

  const updateReceiving = async (
    bolNumber: string,
    data: { newBolNumber?: string; quantity?: number; items?: { itemId: string; warehouseId: string; quantity: number }[] }
  ) => {
    await apiPut('/api/transactions/receiving', { bolNumber, ...data })
    await fetchAll()
  }

  const deleteReceiving = async (bolNumber: string) => {
    await apiDelete(`/api/transactions/receiving/${encodeURIComponent(bolNumber)}`)
    await fetchAll()
  }

  return {
    items,
    allItems,
    warehouses,
    orders,
    transactions,
    payments,
    wholesalers,
    categories,
    loading,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    subCategoryFilter,
    setSubCategoryFilter,
    warehouseFilter,
    setWarehouseFilter,
    sortField,
    sortDirection,
    toggleSort,
    stats,
    addItem,
    updateItem,
    deleteItem,
    receiveStock,
    updateStock,
    transferStock,
    createOrder,
    updateOrder,
    completeOrder,
    deleteOrder,
    addWholesaler,
    updateWholesaler,
    deleteWholesaler,
    addPayment,
    deletePayment,
    addWarehouse,
    updateWarehouse,
    reorderWarehouse,
    updateReceiving,
    deleteReceiving,
    refresh: fetchAll,
  }
}
