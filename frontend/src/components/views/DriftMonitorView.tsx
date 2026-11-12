import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Search } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function DriftMonitorView({ inv }: Props) {
  const { allItems, transactions, warehouses, loading } = inv
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [showFilter, setShowFilter] = useState<'drift' | 'all'>('drift')

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [warehouses]
  )

  const drifts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allItems
      .filter((item) => {
        if (!q) return true
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q)
        )
      })
      .map((item) => {
        const results = warehouses
          .filter((w) => warehouseFilter === 'all' || w.id === warehouseFilter)
          .map((w) => {
            const currentStock = item.stock.find((s) => s.warehouseId === w.id)?.quantity ?? 0
            const txSum = transactions
              .filter((t) => t.itemId === item.id && t.warehouseId === w.id)
              .reduce((s, t) => s + t.quantity, 0)
            const drift = currentStock - txSum
            return { warehouseId: w.id, warehouseName: w.name, currentStock, txSum, drift }
          })
        const hasDrift = results.some((r) => r.drift !== 0)
        return { item, results, hasDrift }
      })
      .filter((d) => showFilter === 'all' || d.hasDrift)
  }, [allItems, transactions, warehouses, search, warehouseFilter, showFilter])

  const driftCount = useMemo(
    () =>
      allItems.filter((item) =>
        warehouses.some((w) => {
          const currentStock = item.stock.find((s) => s.warehouseId === w.id)?.quantity ?? 0
          const txSum = transactions
            .filter((t) => t.itemId === item.id && t.warehouseId === w.id)
            .reduce((s, t) => s + t.quantity, 0)
          return currentStock - txSum !== 0
        })
      ).length,
    [allItems, transactions, warehouses]
  )

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

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
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{allItems.length - driftCount}</p>
                <p className="text-sm text-muted-foreground">Items in sync</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {drifts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="font-medium">
                {showFilter === 'drift'
                  ? 'All stock values match transaction logs'
                  : 'No items match these filters'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {showFilter === 'drift' ? 'Drift Detected' : 'Stock vs Ledger'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Tx Sum</TableHead>
                    <TableHead>Drift</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drifts.flatMap(({ item, results }) =>
                    results
                      .filter((r) => showFilter === 'all' || r.drift !== 0)
                      .map((r) => (
                        <TableRow key={`${item.id}-${r.warehouseId}`}>
                          <TableCell>
                            <p className="font-medium text-sm">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.sku}</p>
                          </TableCell>
                          <TableCell className="text-sm">{r.warehouseName}</TableCell>
                          <TableCell>{r.currentStock}</TableCell>
                          <TableCell>{r.txSum}</TableCell>
                          <TableCell>
                            <Badge variant={r.drift === 0 ? 'secondary' : 'destructive'}>
                              {r.drift > 0 ? '+' : ''}{r.drift}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
