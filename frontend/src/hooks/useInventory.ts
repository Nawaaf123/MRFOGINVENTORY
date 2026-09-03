import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/lib/api'
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
          apiGet<InventoryItem[]>('/api/inventory'),
          apiGet<Warehouse[]>('/api/warehouses'),
          apiGet<Order[]>('/api/orders'),
          apiGet<InventoryTransaction[]>('/api/transactions'),
          apiGet<Payment[]>('/api/payments'),
          apiGet<Wholesaler[]>('/api/wholesalers'),
          apiGet<Category[]>('/api/categories'),
        ])
      setAllItems(itemsRes)
      setWarehouses(warehousesRes)
      setOrders(ordersRes)
      setTransactions(txRes)
      setPayments(paymentsRes)
      setWholesalers(wholesalersRes)
      setCategories(catsRes)
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
      const q = searchQuery.toLowerCase()
      if (q && !item.name.toLowerCase().includes(q) && !item.sku.toLowerCase().includes(q))
        return false
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
  const addItem = async (data: Omit<InventoryItem, 'id' | 'lastUpdated'>) => {
    await apiPost('/api/inventory', data)
    await fetchAll()
  }

  const updateItem = async (id: string, data: Partial<InventoryItem>) => {
    await apiPut(`/api/inventory/${id}`, data)
    await fetchAll()
  }

  const deleteItem = async (id: string) => {
    await apiDelete(`/api/inventory/${id}`)
    await fetchAll()
  }

  const receiveStock = async (data: {
    itemId: string
    warehouseId: string
    quantity: number
    bolNumber: string
    bolDocumentUrl?: string
  }) => {
    await apiPost('/api/transactions/receive', data)
    await fetchAll()
  }

  const updateStock = async (itemId: string, warehouseId: string, quantity: number) => {
    await apiPatch(`/api/inventory/${itemId}/stock`, { warehouseId, quantity })
    await fetchAll()
  }

  const transferStock = async (data: {
    itemId: string
    fromWarehouseId: string
    toWarehouseId: string
    quantity: number
  }) => {
    await apiPost('/api/transactions/transfer', data)
    await fetchAll()
  }

  const createOrder = async (data: Omit<Order, 'id'>) => {
    await apiPost('/api/orders', data)
    await fetchAll()
  }

  const updateOrder = async (id: string, data: Partial<Order>) => {
    await apiPut(`/api/orders/${id}`, data)
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
    await apiPost('/api/payments', data)
    await fetchAll()
  }

  const deletePayment = async (id: string) => {
    await apiDelete(`/api/payments/${id}`)
    await fetchAll()
  }

  const updateWarehouse = async (id: string, data: Partial<Warehouse>) => {
    await apiPut(`/api/warehouses/${id}`, data)
    await fetchAll()
  }

  const reorderWarehouse = async (id: string, sortOrder: number) => {
    await apiPatch(`/api/warehouses/${id}/order`, { sortOrder })
    await fetchAll()
  }

  const updateReceiving = async (
    transactionId: string,
    data: { bolNumber?: string; quantity?: number }
  ) => {
    await apiPut(`/api/transactions/${transactionId}`, data)
    await fetchAll()
  }

  const deleteReceiving = async (transactionId: string) => {
    await apiDelete(`/api/transactions/${transactionId}`)
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
    deleteOrder,
    addWholesaler,
    updateWholesaler,
    deleteWholesaler,
    addPayment,
    deletePayment,
    updateWarehouse,
    reorderWarehouse,
    updateReceiving,
    deleteReceiving,
    refresh: fetchAll,
  }
}
