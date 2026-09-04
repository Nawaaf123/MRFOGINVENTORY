import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { format } from 'date-fns'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { apiGet } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

interface LedgerEntry {
  id: string
  type: string
  quantity: number
  signedQuantity: number
  remainingAfter: number
  date: string
  warehouseId?: string | null
  warehouseName?: string | null
  source?: string | null
  bolNumber?: string | null
}

interface WarehouseBreakdown {
  warehouseId: string
  warehouseName: string
  received: number
  sold: number
  returned: number
  remaining: number
}

interface SummaryItem {
  itemId: string
  itemName: string
  itemSku: string
  category?: string | null
  subCategory?: string | null
  currentStock: number
  received: number
  sold: number
  returned: number
  remaining: number
  impliedOpening: number
  warehouseBreakdown: WarehouseBreakdown[]
  ledger: LedgerEntry[]
}

interface SummaryResponse {
  warehouseId?: string | null
  items: SummaryItem[]
}

const typeLabels: Record<string, string> = {
  receive: 'Receive',
  sale: 'Sale',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  opening_balance: 'Opening balance',
  implied_opening: 'Implied opening',
  manual_adjust: 'Manual adjust',
  adjust: 'Adjust',
  order_cancelled: 'Returned',
}

const typeColors: Record<string, string> = {
  receive: 'bg-green-100 text-green-800',
  sale: 'bg-blue-100 text-blue-800',
  transfer_in: 'bg-teal-100 text-teal-800',
  transfer_out: 'bg-orange-100 text-orange-800',
  opening_balance: 'bg-purple-100 text-purple-800',
  implied_opening: 'bg-violet-100 text-violet-800',
  manual_adjust: 'bg-gray-100 text-gray-800',
  adjust: 'bg-gray-100 text-gray-800',
  order_cancelled: 'bg-red-100 text-red-800',
}

export function StockSummaryView({ inv }: Props) {
  const { warehouses, loading: invLoading } = inv
  const [warehouseId, setWarehouseId] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [items, setItems] = useState<SummaryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [warehouses]
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setExpanded(null)
    try {
      const params = new URLSearchParams()
      params.set('include_ledger', 'false')
      if (warehouseId !== 'all') params.set('warehouse_id', warehouseId)
      if (debouncedSearch) params.set('q', debouncedSearch)
      const data = await apiGet<SummaryResponse>(`/api/stock/summary?${params.toString()}`)
      setItems((data.items ?? []).map((i) => ({ ...i, ledger: i.ledger ?? [] })))
    } catch (err) {
      console.error(err)
      toast.error('Failed to load stock summary')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [warehouseId, debouncedSearch])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const loadLedger = useCallback(async (itemId: string) => {
    setLedgerLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('item_id', itemId)
      if (warehouseId !== 'all') params.set('warehouse_id', warehouseId)
      const data = await apiGet<SummaryResponse>(`/api/stock/summary?${params.toString()}`)
      const detail = data.items?.[0]
      if (detail) {
        setItems((prev) =>
          prev.map((i) =>
            i.itemId === itemId
              ? {
                  ...i,
                  ledger: detail.ledger ?? [],
                  warehouseBreakdown: detail.warehouseBreakdown ?? i.warehouseBreakdown,
                  impliedOpening: detail.impliedOpening,
                }
              : i
          )
        )
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to load ledger')
    } finally {
      setLedgerLoading(false)
    }
  }, [warehouseId])

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, i) => ({
          received: acc.received + i.received,
          sold: acc.sold + i.sold,
          returned: acc.returned + (i.returned ?? 0),
          remaining: acc.remaining + i.remaining,
        }),
        { received: 0, sold: 0, returned: 0, remaining: 0 }
      ),
    [items]
  )

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = prev === id ? null : id
      if (next) {
        const row = items.find((i) => i.itemId === next)
        if (!row?.ledger?.length) void loadLedger(next)
      }
      return next
    })
  }

  if (invLoading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Stock Summary</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Forward ledger that closes at live warehouse stock
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {sortedWarehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void loadSummary()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Received</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-700">{totals.received}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sold</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-700">{totals.sold}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Returned</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-700">{totals.returned}</p>
              <p className="text-xs text-muted-foreground mt-1">Cancelled orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals.remaining}</p>
              <p className="text-xs text-muted-foreground mt-1">Live warehouse stock</p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="text-muted-foreground py-8 text-center">Building ledger...</div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No products found
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((item) => {
                    const open = expanded === item.itemId
                    return (
                      <Fragment key={item.itemId}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => toggle(item.itemId)}
                        >
                          <TableCell>
                            {open ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.itemSku}</TableCell>
                          <TableCell>
                            <p className="font-medium">{item.itemName}</p>
                            {(item.category || item.subCategory) && (
                              <p className="text-xs text-muted-foreground">
                                {[item.category, item.subCategory].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-green-700 font-medium">{item.received}</TableCell>
                          <TableCell className="text-right text-blue-700 font-medium">{item.sold}</TableCell>
                          <TableCell className="text-right text-amber-700 font-medium">{item.returned ?? 0}</TableCell>
                          <TableCell className="text-right font-semibold">{item.remaining}</TableCell>
                        </TableRow>
                        {open && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
                              <div className="space-y-4">
                                {warehouseId === 'all' && item.warehouseBreakdown.length > 0 && (
                                  <div>
                                    <p className="text-sm font-medium mb-2">Per warehouse</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                      {item.warehouseBreakdown.map((w) => (
                                        <div key={w.warehouseId} className="rounded-md border bg-background p-3 text-sm">
                                          <p className="font-medium">{w.warehouseName}</p>
                                          <p className="text-muted-foreground text-xs mt-1">
                                            Rec {w.received} · Sold {w.sold} · Ret {w.returned ?? 0} · Rem {w.remaining}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium mb-2">
                                    Ledger (newest first)
                                    {item.impliedOpening !== 0 && (
                                      <span className="text-muted-foreground font-normal">
                                        {' '}· implied opening {item.impliedOpening}
                                      </span>
                                    )}
                                  </p>
                                  {ledgerLoading && expanded === item.itemId && !(item.ledger?.length) ? (
                                    <p className="text-sm text-muted-foreground">Loading ledger...</p>
                                  ) : (item.ledger?.length ?? 0) === 0 ? (
                                    <p className="text-sm text-muted-foreground">No movements recorded</p>
                                  ) : (
                                    <div className="rounded-md border overflow-hidden">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Source</TableHead>
                                            <TableHead>Warehouse</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Remaining</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {item.ledger.map((row) => (
                                            <TableRow key={row.id}>
                                              <TableCell className="text-sm whitespace-nowrap">
                                                {row.date ? format(new Date(row.date), 'MMM d, yyyy') : '—'}
                                              </TableCell>
                                              <TableCell>
                                                <Badge
                                                  variant="secondary"
                                                  className={typeColors[row.type] ?? ''}
                                                >
                                                  {typeLabels[row.type] ?? row.type}
                                                </Badge>
                                              </TableCell>
                                              <TableCell className="text-sm max-w-[180px] truncate">
                                                {row.source || row.bolNumber || '—'}
                                              </TableCell>
                                              <TableCell className="text-sm">{row.warehouseName || '—'}</TableCell>
                                              <TableCell
                                                className={`text-right font-medium ${
                                                  row.signedQuantity > 0
                                                    ? 'text-green-700'
                                                    : row.signedQuantity < 0
                                                      ? 'text-destructive'
                                                      : ''
                                                }`}
                                              >
                                                {row.signedQuantity > 0 ? '+' : ''}
                                                {row.signedQuantity}
                                              </TableCell>
                                              <TableCell className="text-right font-semibold">
                                                {row.remainingAfter}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
