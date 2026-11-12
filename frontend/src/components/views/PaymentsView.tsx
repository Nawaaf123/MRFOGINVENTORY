import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight, Store, DollarSign, FileText } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatCurrency } from '@/lib/utils'
import { downloadInvoice } from '@/lib/invoice'
import { toast } from 'sonner'
import type { Order, Payment } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

function getOrderTotal(order: Order): number {
  return order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) + (order.shippingFee || 0)
}

function invoiceNumber(order: Order): string {
  return `INV-${order.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

function paidForOrder(orderId: string, payments: Payment[]): number {
  return payments.filter((p) => p.orderId === orderId).reduce((s, p) => s + p.amount, 0)
}

type InvoiceRow = {
  order: Order
  invoiceNo: string
  amount: number
  paid: number
  pending: number
  status: 'paid' | 'partial' | 'unpaid'
}

type ShopGroup = {
  shop: string
  invoices: InvoiceRow[]
  total: number
  pending: number
  openCount: number
}

export function PaymentsView({ inv }: Props) {
  const { orders, payments, wholesalers, addPayment, loading } = inv
  const [expanded, setExpanded] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [payShop, setPayShop] = useState<string | null>(null)
  const [payOrderId, setPayOrderId] = useState<string>('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payNote, setPayNote] = useState('')
  const [saving, setSaving] = useState(false)

  const groups = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== 'cancelled')
    const map: Record<string, ShopGroup> = {}

    for (const order of activeOrders) {
      const amount = getOrderTotal(order)
      const paid = paidForOrder(order.id, payments)
      const pending = Math.max(0, amount - paid)
      const status: InvoiceRow['status'] =
        pending <= 0.001 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'

      if (!map[order.shopName]) {
        map[order.shopName] = {
          shop: order.shopName,
          invoices: [],
          total: 0,
          pending: 0,
          openCount: 0,
        }
      }
      map[order.shopName].invoices.push({
        order,
        invoiceNo: invoiceNumber(order),
        amount,
        paid,
        pending,
        status,
      })
      map[order.shopName].total += amount
      map[order.shopName].pending += pending
      if (pending > 0.001) map[order.shopName].openCount += 1
    }

    for (const g of Object.values(map)) {
      g.invoices.sort((a, b) => new Date(b.order.date).getTime() - new Date(a.order.date).getTime())
    }

    return Object.values(map).sort((a, b) => {
      if (b.pending !== a.pending) return b.pending - a.pending
      return a.shop.localeCompare(b.shop)
    })
  }, [orders, payments])

  const openPayForShop = (shop: string) => {
    const group = groups.find((g) => g.shop === shop)
    if (!group) return
    const firstOpen = group.invoices.find((i) => i.pending > 0)
    setPayShop(shop)
    setPayOrderId(firstOpen?.order.id ?? group.invoices[0]?.order.id ?? '')
    setPayAmount(firstOpen ? String(firstOpen.pending) : '')
    setPayMethod('cash')
    setPayNote('')
    setPayOpen(true)
  }

  const openPayForInvoice = (shop: string, invoice: InvoiceRow) => {
    setPayShop(shop)
    setPayOrderId(invoice.order.id)
    setPayAmount(invoice.pending > 0 ? String(invoice.pending) : '')
    setPayMethod('cash')
    setPayNote('')
    setPayOpen(true)
  }

  const selectedInvoice = useMemo(() => {
    if (!payShop || !payOrderId) return null
    return groups.find((g) => g.shop === payShop)?.invoices.find((i) => i.order.id === payOrderId) ?? null
  }, [groups, payShop, payOrderId])

  const handlePay = async () => {
    const amount = parseFloat(payAmount)
    if (!payOrderId || !amount || isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }
    if (selectedInvoice && amount > selectedInvoice.pending + 0.001) {
      toast.error(`Amount exceeds pending balance (${formatCurrency(selectedInvoice.pending)})`)
      return
    }
    setSaving(true)
    try {
      await addPayment({
        orderId: payOrderId,
        amount,
        paymentDate: new Date(),
        method: payMethod,
        note: payNote.trim(),
      })
      toast.success('Payment recorded')
      setPayOpen(false)
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Invoices and balances by wholesaler
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-3 bg-muted/30">
        {groups.map((group) => {
          const isOpen = expanded === group.shop
          return (
            <Card key={group.shop} className="overflow-hidden shadow-sm">
              <div
                role="button"
                tabIndex={0}
                className="p-4 flex flex-wrap items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setExpanded((s) => (s === group.shop ? null : group.shop))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpanded((s) => (s === group.shop ? null : group.shop))
                  }
                }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-[200px] text-left">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <Store className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{group.shop}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <Badge variant="secondary" className="font-normal">
                        {group.invoices.length} invoice(s)
                      </Badge>
                      {group.openCount > 0 && (
                        <Badge className="font-normal bg-orange-100 text-orange-700 hover:bg-orange-100">
                          {group.openCount} open
                        </Badge>
                      )}
                      {group.openCount === 0 && group.invoices.length > 0 && (
                        <Badge className="font-normal bg-green-100 text-green-700 hover:bg-green-100">
                          All paid
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 ml-auto">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-bold tabular-nums">{formatCurrency(group.total)}</p>
                  </div>
                  <div className="text-right min-w-[88px]">
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className={cn(
                      'text-lg font-bold tabular-nums',
                      group.pending > 0 ? 'text-orange-600' : 'text-green-600'
                    )}>
                      {formatCurrency(group.pending)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    disabled={group.pending <= 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      openPayForShop(group.shop)
                    }}
                  >
                    <DollarSign className="h-3.5 w-3.5 mr-0.5" />
                    Pay
                  </Button>
                </div>
              </div>

              {isOpen && (
                <CardContent className="pt-0 pb-4 px-4">
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.invoices.map((invRow) => (
                          <TableRow key={invRow.order.id}>
                            <TableCell className="font-mono text-sm">{invRow.invoiceNo}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(invRow.order.date), 'd MMM yyyy')}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(invRow.amount)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-green-600 font-medium">
                              {formatCurrency(invRow.paid)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-orange-600 font-medium">
                              {formatCurrency(invRow.pending)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  'capitalize font-medium',
                                  invRow.status === 'paid' && 'bg-green-100 text-green-700 hover:bg-green-100',
                                  invRow.status === 'partial' && 'bg-amber-100 text-amber-800 hover:bg-amber-100',
                                  invRow.status === 'unpaid' && 'bg-rose-600 text-white hover:bg-rose-600'
                                )}
                              >
                                {invRow.status === 'partial' ? 'Partial' : invRow.status === 'paid' ? 'Paid' : 'Unpaid'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-rose-600"
                                  disabled={invRow.pending <= 0}
                                  title="Record payment"
                                  onClick={() => openPayForInvoice(group.shop, invRow)}
                                >
                                  <DollarSign className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title="Download invoice"
                                  onClick={() => {
                                    const wholesaler = wholesalers.find(
                                      (w) => w.name.toLowerCase() === group.shop.toLowerCase()
                                    )
                                    downloadInvoice(invRow.order, wholesaler)
                                    toast.success('Invoice downloaded')
                                  }}
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}

        {groups.length === 0 && (
          <div className="text-center py-16 text-muted-foreground bg-background rounded-lg border">
            No invoices yet — create orders first
          </div>
        )}
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment{payShop ? ` · ${payShop}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Invoice</Label>
              <Select value={payOrderId} onValueChange={(id) => {
                setPayOrderId(id)
                const invRow = groups.find((g) => g.shop === payShop)?.invoices.find((i) => i.order.id === id)
                if (invRow) setPayAmount(invRow.pending > 0 ? String(invRow.pending) : '')
              }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {(groups.find((g) => g.shop === payShop)?.invoices ?? []).map((invRow) => (
                    <SelectItem key={invRow.order.id} value={invRow.order.id}>
                      {invRow.invoiceNo} · pending {formatCurrency(invRow.pending)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="ach">ACH / Wire</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Optional"
                className="mt-1"
              />
            </div>
            {selectedInvoice && (
              <p className="text-xs text-muted-foreground">
                Invoice total {formatCurrency(selectedInvoice.amount)} · already paid{' '}
                {formatCurrency(selectedInvoice.paid)} · pending{' '}
                <span className="text-orange-600 font-medium">{formatCurrency(selectedInvoice.pending)}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={handlePay} disabled={saving}>
              {saving ? 'Saving...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
