import { useState } from 'react'
import { format } from 'date-fns'
import { Search, Plus, FileText, Eye, Check } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { downloadInvoice } from '@/lib/invoice'
import { downloadPickSheet, previewPickSheet } from '@/lib/pickSheet'
import { toast } from 'sonner'
import type { Order } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

function OrderCard({ order, onCancel, onComplete, onDownload, onPreview }: {
  order: Order
  onCancel: (o: Order) => void
  onComplete: (o: Order) => void
  onDownload: (o: Order) => void
  onPreview: (o: Order) => void
}) {
  const total = order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) + order.shippingFee
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="font-semibold">{order.shopName}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(order.date), 'MMM d, yyyy')}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order.status]}`}>
            {order.status}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-2">{order.items.length} items · {formatCurrency(total)}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => onPreview(order)}><Eye className="h-3 w-3" /></Button>
          <Button variant="ghost" size="sm" onClick={() => onDownload(order)}><FileText className="h-3 w-3" /></Button>
          {order.status === 'pending' && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onComplete(order)}><Check className="h-3 w-3" /></Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onCancel(order)}>Cancel</Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface Props { inv: Inv }

export function OrdersView({ inv }: Props) {
  const { orders, allItems, warehouses, createOrder, completeOrder, deleteOrder, loading } = inv
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [shopName, setShopName] = useState('')
  const [shippingFee, setShippingFee] = useState('0')
  const [lines, setLines] = useState([{ itemId: '', warehouseId: '', quantity: '1', unitPrice: '0' }])

  const filtered = orders.filter((o) =>
    o.shopName.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce<Record<string, Order[]>>((acc, o) => {
    const key = format(new Date(o.date), 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  const byShop = orders.reduce<Record<string, Order[]>>((acc, o) => {
    if (!acc[o.shopName]) acc[o.shopName] = []
    acc[o.shopName].push(o)
    return acc
  }, {})

  const handleComplete = async (order: Order) => {
    try {
      await completeOrder(order.id)
      toast.success('Order completed')
    } catch {
      toast.error('Failed to complete order')
    }
  }

  const handleCreate = async () => {
    const items = lines
      .filter((l) => l.itemId && l.warehouseId && Number(l.quantity) > 0)
      .map((l) => ({
        itemId: l.itemId,
        warehouseId: l.warehouseId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
      }))
    if (!shopName.trim() || items.length === 0) {
      toast.error('Shop name and at least one item are required')
      return
    }
    try {
      await createOrder({
        shopName: shopName.trim(),
        shippingFee: Number(shippingFee) || 0,
        items,
      })
      toast.success('Order created')
      setOpen(false)
      setShopName('')
      setShippingFee('0')
      setLines([{ itemId: '', warehouseId: warehouses[0]?.id ?? '', quantity: '1', unitPrice: '0' }])
    } catch {
      toast.error('Failed to create order')
    }
  }

  const handleCancel = async (order: Order) => {
    if (!confirm('Cancel this order?')) return
    try {
      await deleteOrder(order.id, 'Cancelled by user')
      toast.success('Order cancelled')
    } catch {
      toast.error('Failed to cancel order')
    }
  }

  const handleDownload = (order: Order) => {
    downloadPickSheet(order, allItems)
    toast.success('Pick sheet downloaded')
  }

  const handleInvoice = (order: Order) => {
    downloadInvoice(order)
    toast.success('Invoice downloaded')
  }

  const handlePreview = (order: Order) => {
    const url = previewPickSheet(order, allItems)
    window.open(url, '_blank')
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading orders...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Orders</h1>
          <Button size="sm" onClick={() => {
            setLines([{ itemId: '', warehouseId: warehouses[0]?.id ?? '', quantity: '1', unitPrice: '0' }])
            setOpen(true)
          }}><Plus className="h-4 w-4 mr-1" />New Order</Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by shop..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Tabs defaultValue="list" className="flex-1 overflow-hidden flex flex-col">
        <TabsList className="mx-6 mt-4 w-fit">
          <TabsTrigger value="list">Orders</TabsTrigger>
          <TabsTrigger value="by-shop">By Shop</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="flex-1 overflow-auto p-6 mt-0">
          {Object.keys(grouped).sort().reverse().map((date) => (
            <div key={date} className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                {format(new Date(date), 'EEEE, MMMM d, yyyy')}
              </h3>
              <div className="space-y-2">
                {grouped[date].map((order) => (
                  <OrderCard key={order.id} order={order} onCancel={handleCancel} onComplete={handleComplete} onDownload={handleDownload} onPreview={handlePreview} />
                ))}
              </div>
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No orders found</div>
          )}
        </TabsContent>

        <TabsContent value="by-shop" className="flex-1 overflow-auto p-6 mt-0">
          {Object.entries(byShop).map(([shop, shopOrders]) => {
            const total = shopOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0) + o.shippingFee, 0)
            return (
              <Card key={shop} className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex justify-between">
                    <span>{shop}</span>
                    <span className="text-muted-foreground font-normal text-sm">{formatCurrency(total)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shopOrders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>{format(new Date(o.date), 'MMM d')}</TableCell>
                          <TableCell>{o.items.length}</TableCell>
                          <TableCell>{formatCurrency(o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) + o.shippingFee)}</TableCell>
                          <TableCell><Badge variant="secondary">{o.status}</Badge></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleInvoice(o)}>Invoice</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Shop name</Label>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Shipping fee</Label>
                <Input type="number" min="0" step="0.01" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} className="mt-1" />
              </div>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <Label>Item</Label>
                  <Select
                    value={line.itemId}
                    onValueChange={(v) => {
                      const item = allItems.find((i) => i.id === v)
                      setLines((prev) => prev.map((l, i) => i === idx ? {
                        ...l,
                        itemId: v,
                        unitPrice: String(item?.price ?? 0),
                        warehouseId: l.warehouseId || warehouses[0]?.id || '',
                      } : l))
                    }}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent>
                      {allItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Label>Warehouse</Label>
                  <Select
                    value={line.warehouseId}
                    onValueChange={(v) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, warehouseId: v } : l))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Warehouse" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Qty</Label>
                  <Input type="number" min="1" value={line.quantity} className="mt-1" onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: e.target.value } : l))} />
                </div>
                <div className="col-span-2">
                  <Label>Price</Label>
                  <Input type="number" min="0" step="0.01" value={line.unitPrice} className="mt-1" onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, unitPrice: e.target.value } : l))} />
                </div>
                <div className="col-span-1">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setLines((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))}>
                    ×
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, { itemId: '', warehouseId: warehouses[0]?.id ?? '', quantity: '1', unitPrice: '0' }])}
            >
              Add line
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
