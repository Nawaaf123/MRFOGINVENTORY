import { useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { Download, Search } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader, TableScroll, mobileActionClass } from '@/components/layout/PageShell'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

type DateFilter = 'all' | '7' | '30' | '90'

export function PaymentHistoryView({ inv }: Props) {
  const { payments, orders, loadOrders, loadPayments } = inv
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setPageLoading(true)
      try {
        await Promise.all([
          loadPayments(),
          loadOrders({ limit: 500, includeCancelled: true, includeItems: false }),
        ])
      } catch {
        toast.error('Failed to load payment history')
      } finally {
        if (!cancelled) setPageLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadPayments, loadOrders])

  const enriched = useMemo(
    () =>
      payments.map((p) => {
        const order = orders.find((o) => o.id === p.orderId)
        return { ...p, shopName: order?.shopName ?? 'Unknown' }
      }),
    [payments, orders]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const since =
      dateFilter === 'all' ? null : subDays(new Date(), Number(dateFilter))

    return enriched.filter((p) => {
      if (methodFilter !== 'all' && p.method !== methodFilter) return false
      if (since && new Date(p.paymentDate) < since) return false
      if (!q) return true
      return (
        p.shopName.toLowerCase().includes(q) ||
        p.method.toLowerCase().includes(q) ||
        (p.note || '').toLowerCase().includes(q)
      )
    })
  }, [enriched, search, dateFilter, methodFilter])

  const handleExport = () => {
    try {
      const rows = [
        ['Date', 'Shop', 'Amount', 'Method', 'Note'],
        ...filtered.map((p) => [
          format(new Date(p.paymentDate), 'yyyy-MM-dd'),
          p.shopName,
          p.amount.toString(),
          p.method,
          p.note,
        ]),
      ]
      const csv = rows.map((r) => r.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'payment-history.csv'
      a.click()
      toast.success('Exported')
    } catch {
      toast.error('Export failed')
    }
  }

  if (pageLoading) return <div className="py-4 pr-4 pl-16 sm:py-6 sm:pr-6 lg:pl-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader className="space-y-3">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Payment History</h1>
          <Button variant="outline" className={mobileActionClass} onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by shop, method, or note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="check">Check</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="ach">ACH / Wire</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
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
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto min-h-0">
        {/* Mobile cards */}
        <div className="md:hidden p-4 space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {payments.length ? 'No payments match these filters' : 'No payments found'}
            </div>
          )}
          {filtered.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-1">
                <div className="flex justify-between gap-2">
                  <p className="font-semibold">{p.shopName}</p>
                  <p className="font-semibold text-green-600 tabular-nums">{formatCurrency(p.amount)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(p.paymentDate), 'MMM d, yyyy')} · {p.method}
                </p>
                {p.note && <p className="text-sm text-muted-foreground">{p.note}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      {payments.length ? 'No payments match these filters' : 'No payments found'}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{format(new Date(p.paymentDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="font-medium">{p.shopName}</TableCell>
                    <TableCell className="font-semibold text-green-600">{formatCurrency(p.amount)}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="text-muted-foreground">{p.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </div>
      </div>
    </div>
  )
}
