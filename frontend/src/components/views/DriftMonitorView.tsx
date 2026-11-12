import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Search } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { apiGet } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

type DriftRow = {
  itemId: string
  itemName: string
  itemSku: string
  warehouseId: string
  warehouseName: string
  currentStock: number
  txSum: number
  drift: number
}

export function DriftMonitorView({ inv }: Props) {
  const { warehouses } = inv
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [showFilter, setShowFilter] = useState<'drift' | 'all'>('drift')
  const [rows, setRows] = useState<DriftRow[]>([])
  const [loading, setLoading] = useState(true)

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [warehouses]
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('only_drift', showFilter === 'drift' ? 'true' : 'false')
      if (warehouseFilter !== 'all') params.set('warehouse_id', warehouseFilter)
      if (debouncedSearch) params.set('q', debouncedSearch)
      const data = await apiGet<{ items: DriftRow[] }>(`/api/stock/drift?${params.toString()}`)
      setRows(data.items ?? [])
    } catch {
      toast.error('Failed to load drift report')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [warehouseFilter, showFilter, debouncedSearch])

  useEffect(() => {
    void load()
  }, [load])

  const driftCount = useMemo(
    () => new Set(rows.filter((r) => r.drift !== 0).map((r) => r.itemId)).size,
    [rows]
  )

  const grouped = useMemo(() => {
    const map: Record<string, { itemName: string; itemSku: string; results: DriftRow[]; hasDrift: boolean }> = {}
    for (const r of rows) {
      if (!map[r.itemId]) {
        map[r.itemId] = { itemName: r.itemName, itemSku: r.itemSku, results: [], hasDrift: false }
      }
      map[r.itemId].results.push(r)
      if (r.drift !== 0) map[r.itemId].hasDrift = true
    }
    return Object.entries(map)
  }, [rows])

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10 space-y-3">
        <div>
          <h1 className="text-2xl font-bold">Drift Monitor</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compare current stock vs transaction log sums (includes sales, receives, transfers, cancels, adjusts)
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search item or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
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
          <Select value={showFilter} onValueChange={(v) => setShowFilter(v as 'drift' | 'all')}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="drift">Drift only</SelectItem>
              <SelectItem value="all">All items</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{driftCount}</p>
                <p className="text-sm text-muted-foreground">Items with drift</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{grouped.length}</p>
                <p className="text-sm text-muted-foreground">Items shown</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Calculating drift...</div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No drift found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Tx sum</TableHead>
                <TableHead className="text-right">Drift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([itemId, g]) =>
                g.results.map((r) => (
                  <TableRow key={`${itemId}-${r.warehouseId}`}>
                    <TableCell>
                      <p className="font-medium text-sm">{g.itemName}</p>
                      <p className="text-xs text-muted-foreground">{g.itemSku}</p>
                    </TableCell>
                    <TableCell>{r.warehouseName}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.currentStock}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.txSum}</TableCell>
                    <TableCell className="text-right">
                      {r.drift === 0 ? (
                        <Badge variant="secondary">0</Badge>
                      ) : (
                        <Badge variant="destructive">{r.drift > 0 ? `+${r.drift}` : r.drift}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
