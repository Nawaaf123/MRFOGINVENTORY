import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { ExternalLink, Search } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { openBolDocument } from '@/lib/bolDocs'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

type DateFilter = 'all' | '7' | '30' | '90'

const typeColors: Record<string, string> = {
  receive: 'bg-green-100 text-green-800',
  adjust: 'bg-blue-100 text-blue-800',
  transfer_in: 'bg-teal-100 text-teal-800',
  transfer_out: 'bg-orange-100 text-orange-800',
  opening_balance: 'bg-purple-100 text-purple-800',
  manual_adjust: 'bg-gray-100 text-gray-800',
  order_cancelled: 'bg-red-100 text-red-800',
  sale: 'bg-blue-100 text-blue-800',
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'sale', label: 'Sale' },
  { value: 'receive', label: 'Receive' },
  { value: 'transfer_in', label: 'Transfer in' },
  { value: 'transfer_out', label: 'Transfer out' },
  { value: 'opening_balance', label: 'Opening balance' },
  { value: 'manual_adjust', label: 'Manual adjust' },
  { value: 'adjust', label: 'Adjust' },
  { value: 'order_cancelled', label: 'Order cancelled' },
]

export function InventoryHistoryView({ inv }: Props) {
  const { transactions, warehouses, loading } = inv
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [warehouses]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const since =
      dateFilter === 'all' ? null : subDays(new Date(), Number(dateFilter))

    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (warehouseFilter !== 'all' && t.warehouseId !== warehouseFilter) return false
      if (since && new Date(t.date) < since) return false
      if (!q) return true
      return (
        t.itemName.toLowerCase().includes(q) ||
        t.itemSku.toLowerCase().includes(q) ||
        t.bolNumber.toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q) ||
        t.warehouseName.toLowerCase().includes(q)
      )
    })
  }, [transactions, search, typeFilter, warehouseFilter, dateFilter])

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10 space-y-3">
        <h1 className="text-2xl font-bold">Inventory History</h1>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by item, BOL, or warehouse..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {sortedWarehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
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
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Source / BOL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {transactions.length ? 'No transactions match these filters' : 'No transactions found'}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-sm">{format(new Date(t.date), 'MMM d, yyyy')}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[t.type] ?? ''}`}>
                    {t.type === 'sale'
                      ? (t.quantity > 0 ? 'sale void' : 'sale')
                      : t.type.replace(/_/g, ' ')}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="font-medium text-sm">{t.itemName}</p>
                  <p className="text-xs text-muted-foreground">{t.itemSku}</p>
                </TableCell>
                <TableCell className="text-sm">{t.warehouseName}</TableCell>
                <TableCell className={`font-semibold ${t.quantity > 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {t.quantity > 0 ? '+' : ''}{t.quantity}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(t.note || t.bolNumber) ? (
                      <Badge variant="outline" className="font-mono text-xs max-w-[220px] truncate">
                        {t.note || t.bolNumber}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                    {t.bolDocumentUrl && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openBolDocument(t.bolDocumentUrl!)}>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
