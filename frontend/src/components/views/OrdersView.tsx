import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Search,
  Plus,
  FileText,
  Eye,
  Check,
  ChevronDown,
  ChevronRight,
  Calendar,
  Store,
  ClipboardList,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { OrderComposer, type OrderLineDraft } from '@/components/OrderComposer'
import { cn, formatCurrency } from '@/lib/utils'
import { downloadInvoice } from '@/lib/invoice'
import { downloadPickSheet, previewPickSheet } from '@/lib/pickSheet'
import { toast } from 'sonner'
import type { Order } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
type DateFilter = 'all' | '7' | '30' | '90'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  completed: 'bg-rose-600 text-white',
  cancelled: 'bg-slate-200 text-slate-600',
}

function casesCount(order: Order) {
  if (order.items.length) return order.items.reduce((s, i) => s + i.quantity, 0)
  return order.cases ?? 0
}

function productsCount(order: Order) {
  if (order.items.length) return order.items.length
  return order.productCount ?? 0
}

function orderSubtotal(order: Order) {
  if (order.items.length) return order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  return order.subtotal ?? 0
}

function orderTotal(order: Order) {
  return orderSubtotal(order) + (order.shippingFee || 0)
}

function OrderExpandCard({
  order,
  expanded,
  onToggle,
  onCancel,
  onComplete,
  onDownloadSheet,
  onInvoice,
  onPreview,
  onEdit,
}: {
  order: Order
  expanded: boolean
  onToggle: () => void
  onCancel: (o: Order) => void
  onComplete: (o: Order) => void
  onDownloadSheet: (o: Order) => void
  onInvoice: (o: Order) => void
  onPreview: (o: Order) => void
  onEdit: (o: Order) => void
}) {
  const cases = casesCount(order)
  const products = productsCount(order)
  const subtotal = orderSubtotal(order)
  const total = orderTotal(order)
  const canMutate = order.status !== 'cancelled'

  return (
    <Card className={cn('overflow-hidden', expanded && 'shadow-md')}>
      <button
        type="button"
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <Store className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-semibold truncate">{order.shopName}</span>
            <span className="text-sm text-muted-foreground">
              — {cases} case{cases === 1 ? '' : 's'}, {products} product{products === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {format(new Date(order.date), 'h:mm a')}
          </span>
          <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium capitalize', statusColors[order.status])}>
            {order.status}
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-1">
          <div className="divide-y">
            {order.items.map((item, idx) => {
              const lineTotal = item.quantity * item.unitPrice
              return (
                <div
                  key={`${item.itemId}-${item.warehouseId}-${idx}`}
                  className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                >
                  <span className="font-mono text-muted-foreground w-[7.5rem] shrink-0">{item.itemSku}</span>
                  <span className="font-medium flex-1 min-w-[140px]">{item.itemName}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {item.quantity} × {formatCurrency(item.unitPrice)}
                  </span>
                  <span className="text-muted-foreground w-28 truncate text-right sm:text-left">
                    {item.warehouseName || '—'}
                  </span>
                  <span className="font-semibold w-20 text-right tabular-nums">{formatCurrency(lineTotal)}</span>
                </div>
              )
            })}
          </div>

          <div className="mt-3 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal ({cases} case{cases === 1 ? '' : 's'})</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            {order.shippingFee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="tabular-nums">{formatCurrency(order.shippingFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base pt-1">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onPreview(order)}>
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Preview
            </Button>
            <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={() => onDownloadSheet(order)}>
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
              Order Sheet
            </Button>
            <Button variant="outline" size="sm" onClick={() => onInvoice(order)}>
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Invoice
            </Button>
            {canMutate && order.status === 'pending' && (
              <Button variant="outline" size="sm" onClick={() => onComplete(order)}>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Complete
              </Button>
            )}
            {canMutate && (
              <Button variant="outline" size="sm" onClick={() => onEdit(order)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
            {canMutate && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => onCancel(order)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

interface Props { inv: Inv }

export function OrdersView({ inv }: Props) {
  const {
    orders,
    ordersTotal,
    allItems,
    warehouses,
    wholesalers,
    createOrder,
    updateOrder,
    completeOrder,
    deleteOrder,
    loadOrders,
    loadMoreOrders,
    getOrder,
    loading: catalogLoading,
  } = inv

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [showCancelled, setShowCancelled] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [shopName, setShopName] = useState('')
  const [shippingFee, setShippingFee] = useState('0')
  const [lines, setLines] = useState<OrderLineDraft[]>([])
  const [saving, setSaving] = useState(false)

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [warehouses]
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const daysParam = dateFilter === 'all' ? null : Number(dateFilter)

  const reloadList = useCallback(async () => {
    setListLoading(true)
    try {
      await loadOrders({
        limit: 40,
        offset: 0,
        q: debouncedSearch || undefined,
        days: daysParam,
        includeCancelled: showCancelled,
        includeItems: false,
      })
    } catch {
      toast.error('Failed to load orders')
    } finally {
      setListLoading(false)
    }
  }, [loadOrders, debouncedSearch, daysParam, showCancelled])

  useEffect(() => {
    void reloadList()
  }, [reloadList])

  const filtered = orders

  const grouped = useMemo(() => {
    const map: Record<string, Order[]> = {}
    for (const o of filtered) {
      const key = format(new Date(o.date), 'yyyy-MM-dd')
      if (!map[key]) map[key] = []
      map[key].push(o)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }
    return map
  }, [filtered])

  const byShop = useMemo(() => {
    const map: Record<string, Order[]> = {}
    for (const o of filtered) {
      if (!map[o.shopName]) map[o.shopName] = []
      map[o.shopName].push(o)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const byProduct = useMemo(() => {
    const map: Record<
      string,
      { sku: string; name: string; cases: number; orders: number; revenue: number }
    > = {}
    for (const o of filtered) {
      if (o.status === 'cancelled') continue
      const seen = new Set<string>()
      for (const item of o.items) {
        const key = item.itemId
        if (!map[key]) {
          map[key] = { sku: item.itemSku, name: item.itemName, cases: 0, orders: 0, revenue: 0 }
        }
        map[key].cases += item.quantity
        map[key].revenue += item.quantity * item.unitPrice
        seen.add(key)
      }
      for (const key of seen) map[key].orders += 1
    }
    return Object.values(map).sort((a, b) => b.cases - a.cases)
  }, [filtered])

  const reservedQty = (itemId: string, warehouseId: string) => {
    if (!editing) return 0
    return editing.items
      .filter((i) => i.itemId === itemId && i.warehouseId === warehouseId)
      .reduce((s, i) => s + i.quantity, 0)
  }

  const openCreate = () => {
    setEditing(null)
    setShopName('')
    setShippingFee('0')
    setLines([])
    setOpen(true)
  }

  const openEdit = async (order: Order) => {
    try {
      const full = order.items.length ? order : await getOrder(order.id)
      setEditing(full)
      setShopName(full.shopName)
      setShippingFee(String(full.shippingFee || 0))
      setLines(
        full.items.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          itemSku: i.itemSku,
          warehouseId: i.warehouseId || sortedWarehouses[0]?.id || '',
          quantity: String(i.quantity),
          unitPrice: String(i.unitPrice),
        }))
      )
      setOpen(true)
    } catch {
      toast.error('Failed to load order details')
    }
  }

  const handleExpand = async (order: Order) => {
    if (expandedId === order.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(order.id)
    if (!order.items.length) {
      try {
        await getOrder(order.id)
      } catch {
        toast.error('Failed to load order lines')
      }
    }
  }

  const handleLoadMore = async () => {
    setLoadingMore(true)
    try {
      await loadMoreOrders({
        limit: 40,
        offset: orders.length,
        q: debouncedSearch || undefined,
        days: daysParam,
        includeCancelled: showCancelled,
        includeItems: false,
      })
    } catch {
      toast.error('Failed to load more orders')
    } finally {
      setLoadingMore(false)
    }
  }

  const handleSave = async () => {
    const items = lines
      .filter((l) => Number(l.quantity) > 0 && l.warehouseId)
      .map((l) => ({
        itemId: l.itemId,
        warehouseId: l.warehouseId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
      }))
    if (!shopName.trim() || items.length === 0) {
      toast.error('Select wholesaler and at least one product')
      return
    }
    if (!wholesalers.some((w) => w.name === shopName.trim())) {
      toast.error('Choose a wholesaler from the list (add one on the Wholesalers page first)')
      return
    }
    for (const line of items) {
      const item = allItems.find((i) => i.id === line.itemId)
      const onHand = item?.stock.find((s) => s.warehouseId === line.warehouseId)?.quantity ?? 0
      const reserved = reservedQty(line.itemId, line.warehouseId)
      if (line.quantity > onHand + reserved) {
        const picked = lines.find((l) => l.itemId === line.itemId)
        const wh = warehouses.find((w) => w.id === line.warehouseId)?.name ?? 'warehouse'
        toast.error(`${picked?.itemSku ?? 'Item'}: only ${onHand + reserved} available at ${wh}`)
        return
      }
    }
    setSaving(true)
    try {
      if (editing) {
        await updateOrder(editing.id, {
          shopName: shopName.trim(),
          shippingFee: Number(shippingFee) || 0,
          items: items as unknown as Order['items'],
        })
        toast.success('Order updated')
      } else {
        await createOrder({
          shopName: shopName.trim(),
          shippingFee: Number(shippingFee) || 0,
          items,
        })
        toast.success('Order created')
      }
      setOpen(false)
      setEditing(null)
      setShopName('')
      setShippingFee('0')
      setLines([])
      await reloadList()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : editing ? 'Failed to update order' : 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  const ensureFullOrder = async (order: Order) =>
    order.items.length ? order : getOrder(order.id)

  const handleComplete = async (order: Order) => {
    try {
      await completeOrder(order.id)
      toast.success('Order completed')
      await reloadList()
    } catch {
      toast.error('Failed to complete order')
    }
  }

  const handleCancel = async (order: Order) => {
    if (!confirm('Cancel this order? Stock will be returned to the warehouse.')) return
    try {
      await deleteOrder(order.id, 'Cancelled by user')
      toast.success('Order cancelled')
      if (expandedId === order.id) setExpandedId(null)
      await reloadList()
    } catch {
      toast.error('Failed to cancel order')
    }
  }

  const handleDownloadSheet = async (order: Order) => {
    try {
      const full = await ensureFullOrder(order)
      downloadPickSheet(full, allItems)
      toast.success('Order sheet downloaded')
    } catch {
      toast.error('Failed to prepare order sheet')
    }
  }

  const handleInvoice = async (order: Order) => {
    try {
      const full = await ensureFullOrder(order)
      downloadInvoice(full)
      toast.success('Invoice downloaded')
    } catch {
      toast.error('Failed to prepare invoice')
    }
  }

  const handlePreview = async (order: Order) => {
    try {
      const full = await ensureFullOrder(order)
      const url = previewPickSheet(full, allItems)
      window.open(url, '_blank')
    } catch {
      toast.error('Failed to preview order sheet')
    }
  }

  if (catalogLoading && listLoading) {
    return <div className="p-6 text-muted-foreground">Loading orders...</div>
  }

  const sortedDates = Object.keys(grouped).sort().reverse()

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pl-16 lg:pl-6 sm:p-6 border-b bg-background sticky top-0 z-10 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Orders</h1>
          <Button className="h-11 px-4 text-base sm:h-9 sm:text-sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            New Order
          </Button>
        </div>
      </div>

      <Tabs
        defaultValue="list"
        className="flex-1 overflow-hidden flex flex-col"
        onValueChange={(v) => {
          if (v === 'by-product') {
            void loadOrders({
              limit: 200,
              offset: 0,
              q: debouncedSearch || undefined,
              days: daysParam,
              includeCancelled: showCancelled,
              includeItems: true,
            }).catch(() => toast.error('Failed to load product breakdown'))
          }
        }}
      >
        <div className="px-6 pt-4 space-y-3 border-b bg-background">
          <TabsList className="w-fit">
            <TabsTrigger value="list">Orders</TabsTrigger>
            <TabsTrigger value="by-shop">By Shop</TabsTrigger>
            <TabsTrigger value="by-product">By Product</TabsTrigger>
          </TabsList>

          <div className="flex flex-col sm:flex-row gap-3 flex-wrap pb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by shop name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={showCancelled ? 'default' : 'outline'}
              size="default"
              onClick={() => setShowCancelled((v) => !v)}
            >
              {showCancelled ? 'Hide cancelled' : 'Show cancelled'}
            </Button>
          </div>
        </div>

        <TabsContent value="list" className="flex-1 overflow-auto p-6 mt-0">
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">
                    {format(new Date(date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                  </h3>
                  <Badge variant="secondary" className="font-normal">
                    {grouped[date].length} order{grouped[date].length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {grouped[date].map((order) => (
                    <OrderExpandCard
                      key={order.id}
                      order={order}
                      expanded={expandedId === order.id}
                      onToggle={() => void handleExpand(order)}
                      onCancel={handleCancel}
                      onComplete={handleComplete}
                      onDownloadSheet={(o) => void handleDownloadSheet(o)}
                      onInvoice={(o) => void handleInvoice(o)}
                      onPreview={(o) => void handlePreview(o)}
                      onEdit={(o) => void openEdit(o)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {listLoading && (
              <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
            )}
            {!listLoading && sortedDates.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No orders found</div>
            )}
            {!listLoading && orders.length < ordersTotal && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={() => void handleLoadMore()} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : `Load more (${orders.length} of ${ordersTotal})`}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="by-shop" className="flex-1 overflow-auto p-6 mt-0">
          <div className="space-y-4">
            {byShop.map(([shop, shopOrders]) => {
              const total = shopOrders.reduce((s, o) => s + orderTotal(o), 0)
              const cases = shopOrders.reduce((s, o) => s + casesCount(o), 0)
              return (
                <Card key={shop}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex justify-between gap-3 flex-wrap">
                      <span className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-rose-600" />
                        {shop}
                      </span>
                      <span className="text-muted-foreground font-normal text-sm">
                        {shopOrders.length} orders · {cases} cases · {formatCurrency(total)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Cases</TableHead>
                          <TableHead>Products</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shopOrders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell>{format(new Date(o.date), 'MMM d, yyyy')}</TableCell>
                            <TableCell>{casesCount(o)}</TableCell>
                            <TableCell>{productsCount(o)}</TableCell>
                            <TableCell>{formatCurrency(orderTotal(o))}</TableCell>
                            <TableCell>
                              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', statusColors[o.status])}>
                                {o.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => handleInvoice(o)}>
                                Invoice
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )
            })}
            {byShop.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No orders found</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="by-product" className="flex-1 overflow-auto p-6 mt-0">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Cases</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProduct.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No product sales in this filter
                      </TableCell>
                    </TableRow>
                  )}
                  {byProduct.map((p) => (
                    <TableRow key={p.sku}>
                      <TableCell className="font-mono text-sm text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.cases}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.orders}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v)
        if (!v) setEditing(null)
      }}>
        <DialogContent
          className={cn(
            'overflow-hidden !flex flex-col gap-3 p-4 sm:p-6',
            // Phone / tablet: nearly full-screen for finger order entry
            'w-[100dvw] max-w-none h-[100dvh] max-h-[100dvh] rounded-none',
            // Phones stay full-bleed; tablets get a tall sheet; desktop a centered dialog
            'sm:rounded-lg sm:w-[min(100vw-1rem,42rem)] sm:h-[min(96dvh,920px)] sm:max-h-[96dvh]',
            'lg:w-full lg:max-w-3xl lg:h-auto lg:max-h-[92vh]'
          )}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="flex items-center gap-2 text-xl sm:text-lg">
              <Store className="h-5 w-5 text-primary" />
              {editing ? 'Edit Order' : 'Create Order'}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
            <OrderComposer
              wholesalers={wholesalers}
              warehouses={warehouses}
              items={allItems}
              shopName={shopName}
              onShopNameChange={setShopName}
              shippingFee={shippingFee}
              onShippingFeeChange={setShippingFee}
              lines={lines}
              onChange={setLines}
              reservedQty={reservedQty}
            />
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t pt-3 flex-col sm:flex-row sm:border-0 sm:pt-0">
            <Button
              variant="outline"
              className="h-12 w-full text-base sm:h-9 sm:w-auto sm:text-sm order-2 sm:order-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-12 w-full text-base bg-primary hover:bg-primary/90 text-primary-foreground sm:h-9 sm:w-auto sm:text-sm order-1 sm:order-2"
              onClick={handleSave}
              disabled={saving || lines.length === 0}
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
