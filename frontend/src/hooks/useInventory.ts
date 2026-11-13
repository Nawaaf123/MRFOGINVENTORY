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
  PageResult,
} from '@/types/inventory'
import { getTotalQuantity } from '@/lib/utils'

export interface InventoryStats {
  totalItems: number
  totalValue: number
  lowStockCount: number
  warehouseCounts: Record<string, number>
}

export type OrdersQuery = {
  limit?: number
  offset?: number
  q?: string
  days?: number | null
  includeCancelled?: boolean
  includeItems?: boolean
  shop?: string
}

export type TransactionsQuery = {
  limit?: number
  offset?: number
  q?: string
  type?: string
  types?: string
  warehouseId?: string
  days?: number | null
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    if (v === true) {
      sp.set(k, 'true')
      continue
    }
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export function useInventory() {
  const [allItems, setAllItems] = useState<InventoryItem[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [transactionsTotal, setTransactionsTotal] = useState(0)
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

  /** Boot: catalog only — keeps first paint fast even with huge history */
  const fetchCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, warehousesRes, wholesalersRes, catsRes] = await Promise.all([
        apiGet<Record<string, unknown>[]>('/api/items'),
        apiGet<Record<string, unknown>[]>('/api/warehouses'),
        apiGet<Record<string, unknown>[]>('/api/wholesalers'),
        apiGet<Record<string, unknown>[]>('/api/categories'),
      ])
      setAllItems(itemsRes.map(mapItem))
      setWarehouses(warehousesRes.map(mapWarehouse))
      setWholesalers(wholesalersRes.map(mapWholesaler))
      setCategories(catsRes.map(mapCategory))
    } catch (err) {
      console.error('Failed to fetch catalog', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshItems = useCallback(async () => {
    try {
      const itemsRes = await apiGet<Record<string, unknown>[]>('/api/items')
      setAllItems(itemsRes.map(mapItem))
    } catch (err) {
      console.error('Failed to refresh items', err)
    }
  }, [])

  const loadOrders = useCallback(async (query: OrdersQuery = {}) => {
    const qs = buildQuery({
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      q: query.q || undefined,
      days: query.days ?? undefined,
      include_cancelled: query.includeCancelled ? true : undefined,
      include_items: query.includeItems ? true : undefined,
      shop: query.shop || undefined,
    })
    const page = await apiGet<PageResult<Record<string, unknown>>>(`/api/orders${qs}`)
    const mapped = (page.items ?? []).map(mapOrder)
    setOrders(mapped)
    setOrdersTotal(page.total ?? mapped.length)
    return { items: mapped, total: page.total ?? mapped.length, limit: page.limit, offset: page.offset }
  }, [])

  const loadMoreOrders = useCallback(async (query: OrdersQuery = {}) => {
    const qs = buildQuery({
      limit: query.limit ?? 50,
      offset: query.offset ?? orders.length,
      q: query.q || undefined,
      days: query.days ?? undefined,
      include_cancelled: query.includeCancelled ? true : undefined,
      include_items: query.includeItems ? true : undefined,
      shop: query.shop || undefined,
    })
    const page = await apiGet<PageResult<Record<string, unknown>>>(`/api/orders${qs}`)
    const mapped = (page.items ?? []).map(mapOrder)
    setOrders((prev) => {
      const seen = new Set(prev.map((o) => o.id))
      return [...prev, ...mapped.filter((o) => !seen.has(o.id))]
    })
    setOrdersTotal(page.total ?? 0)
    return { items: mapped, total: page.total ?? 0, limit: page.limit, offset: page.offset }
  }, [orders.length])

  const getOrder = useCallback(async (id: string) => {
    const raw = await apiGet<Record<string, unknown>>(`/api/orders/${id}`)
    const order = mapOrder(raw)
    setOrders((prev) => prev.map((o) => (o.id === id ? order : o)))
    return order
  }, [])

  const loadTransactions = useCallback(async (query: TransactionsQuery = {}) => {
    const qs = buildQuery({
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
      q: query.q || undefined,
      type: query.type && query.type !== 'all' ? query.type : undefined,
      types: query.types || undefined,
      warehouse_id: query.warehouseId || undefined,
      days: query.days ?? undefined,
    })
    const page = await apiGet<PageResult<Record<string, unknown>>>(`/api/transactions${qs}`)
    const mapped = (page.items ?? []).map(mapTransaction)
    setTransactions(mapped)
    setTransactionsTotal(page.total ?? mapped.length)
    return { items: mapped, total: page.total ?? mapped.length, limit: page.limit, offset: page.offset }
  }, [])

  const loadMoreTransactions = useCallback(async (query: TransactionsQuery = {}) => {
    const qs = buildQuery({
      limit: query.limit ?? 100,
      offset: query.offset ?? transactions.length,
      q: query.q || undefined,
      type: query.type && query.type !== 'all' ? query.type : undefined,
      types: query.types || undefined,
      warehouse_id: query.warehouseId || undefined,
      days: query.days ?? undefined,
    })
    const page = await apiGet<PageResult<Record<string, unknown>>>(`/api/transactions${qs}`)
    const mapped = (page.items ?? []).map(mapTransaction)
    setTransactions((prev) => {
      const seen = new Set(prev.map((t) => t.id))
      return [...prev, ...mapped.filter((t) => !seen.has(t.id))]
    })
    setTransactionsTotal(page.total ?? 0)
    return { items: mapped, total: page.total ?? 0, limit: page.limit, offset: page.offset }
  }, [transactions.length])

  const loadPayments = useCallback(async () => {
    const paymentsRes = await apiGet<Record<string, unknown>[]>('/api/payments')
    const mapped = paymentsRes.map(mapPayment)
    setPayments(mapped)
    return mapped
  }, [])

  /** After stock/order mutations — refresh catalog stock only */
  const refreshStock = useCallback(async () => {
    await refreshItems()
  }, [refreshItems])

  useEffect(() => {
    fetchCatalog()
  }, [fetchCatalog])

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
    await refreshItems()
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
    await refreshItems()
  }

  const deleteItem = async (id: string) => {
    await apiDelete(`/api/items/${id}`)
    await refreshItems()
  }

  const receiveStock = async (
    data: {
      itemId: string
      warehouseId: string
      quantity: number
      bolNumber: string
      bolDocumentUrl?: string
    },
    options?: { refresh?: boolean }
  ) => {
    await apiPost('/api/stock/receive', data)
    if (options?.refresh !== false) await refreshStock()
  }

  const receiveStockBatch = async (data: {
    warehouseId: string
    bolNumber: string
    bolDocumentUrl?: string
    items: { itemId: string; quantity: number }[]
  }) => {
    await apiPost('/api/stock/receive-batch', data)
    await refreshStock()
  }

  const updateStock = async (
    itemId: string,
    warehouseId: string,
    quantity: number,
    options?: { refresh?: boolean }
  ) => {
    await apiPut('/api/stock/update', { itemId, warehouseId, quantity })
    if (options?.refresh !== false) await refreshStock()
  }

  const adjustStockBatch = async (data: {
    warehouseId: string
    items: { itemId: string; quantity: number }[]
  }) => {
    await apiPost('/api/stock/adjust-batch', data)
    await refreshStock()
  }

  const transferStock = async (
    data: {
      itemId: string
      fromWarehouseId: string
      toWarehouseId: string
      quantity: number
    },
    options?: { refresh?: boolean }
  ) => {
    await apiPost('/api/stock/transfer', data)
    if (options?.refresh !== false) await refreshStock()
  }

  const transferStockBatch = async (data: {
    fromWarehouseId: string
    toWarehouseId: string
    items: { itemId: string; quantity: number }[]
  }) => {
    await apiPost('/api/stock/transfer-batch', data)
    await refreshStock()
  }

  const createOrder = async (data: {
    shopName: string
    shippingFee?: number
    items: { itemId: string; warehouseId: string; quantity: number; unitPrice: number }[]
  }) => {
    await apiPost('/api/orders', data)
    await refreshStock()
  }

  const updateOrder = async (id: string, data: Partial<Order> & {
    items?: { itemId: string; warehouseId: string; quantity: number; unitPrice: number }[]
    shopName?: string
    shippingFee?: number
  }) => {
    await apiPut(`/api/orders/${id}`, data)
    await refreshStock()
  }

  const completeOrder = async (id: string) => {
    await apiPost(`/api/orders/${id}/complete`)
    await refreshStock()
  }

  const deleteOrder = async (id: string, reason?: string) => {
    await apiPost(`/api/orders/${id}/cancel`, { reason })
    await refreshStock()
  }

  const addWholesaler = async (data: Omit<Wholesaler, 'id'>) => {
    await apiPost('/api/wholesalers', data)
    const wholesalersRes = await apiGet<Record<string, unknown>[]>('/api/wholesalers')
    setWholesalers(wholesalersRes.map(mapWholesaler))
  }

  const updateWholesaler = async (id: string, data: Partial<Wholesaler>) => {
    await apiPut(`/api/wholesalers/${id}`, data)
    const wholesalersRes = await apiGet<Record<string, unknown>[]>('/api/wholesalers')
    setWholesalers(wholesalersRes.map(mapWholesaler))
  }

  const deleteWholesaler = async (id: string) => {
    await apiDelete(`/api/wholesalers/${id}`)
    const wholesalersRes = await apiGet<Record<string, unknown>[]>('/api/wholesalers')
    setWholesalers(wholesalersRes.map(mapWholesaler))
  }

  const addPayment = async (data: Omit<Payment, 'id'>) => {
    await apiPost('/api/payments', {
      ...data,
      paymentDate: data.paymentDate instanceof Date ? data.paymentDate.toISOString() : data.paymentDate,
    })
    await loadPayments()
  }

  const deletePayment = async (id: string) => {
    await apiDelete(`/api/payments/${id}`)
    await loadPayments()
  }

  const addWarehouse = async (data: { name: string; location?: string; color?: string }) => {
    await apiPost('/api/warehouses', data)
    await fetchCatalog()
  }

  const updateWarehouse = async (id: string, data: Partial<Warehouse>) => {
    await apiPut(`/api/warehouses/${id}`, data)
    await fetchCatalog()
  }

  const reorderWarehouse = async (id: string, sortOrder: number) => {
    await apiPut('/api/warehouses/reorder', { items: [{ id, sortOrder }] })
    await fetchCatalog()
  }

  const updateReceiving = async (
    bolNumber: string,
    data: { newBolNumber?: string; quantity?: number; items?: { itemId: string; warehouseId: string; quantity: number }[] }
  ) => {
    await apiPut('/api/transactions/receiving', { bolNumber, ...data })
    await refreshStock()
  }

  const deleteReceiving = async (bolNumber: string) => {
    await apiDelete(`/api/transactions/receiving/${encodeURIComponent(bolNumber)}`)
    await refreshStock()
  }

  return {
    items,
    allItems,
    warehouses,
    orders,
    ordersTotal,
    transactions,
    transactionsTotal,
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
    receiveStockBatch,
    updateStock,
    adjustStockBatch,
    transferStock,
    transferStockBatch,
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
    refresh: fetchCatalog,
    refreshStock,
    loadOrders,
    loadMoreOrders,
    getOrder,
    loadTransactions,
    loadMoreTransactions,
    loadPayments,
  }
}
