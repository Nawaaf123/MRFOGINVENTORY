import { useMemo } from 'react'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getTotalQuantity } from '@/lib/utils'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function DriftMonitorView({ inv }: Props) {
  const { allItems, transactions, warehouses, loading } = inv

  const drifts = useMemo(() => {
    return allItems.map((item) => {
      const results = warehouses.map((w) => {
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
  }, [allItems, transactions, warehouses])

  const driftCount = drifts.filter((d) => d.hasDrift).length

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Drift Monitor</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Compare current stock vs transaction log sums
        </p>
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

        {drifts.filter((d) => d.hasDrift).length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="font-medium">All stock values match transaction logs</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Drift Detected</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>TX Sum</TableHead>
                    <TableHead>Drift</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drifts.filter((d) => d.hasDrift).map(({ item, results }) =>
                    results.filter((r) => r.drift !== 0).map((r) => (
                      <TableRow key={`${item.id}-${r.warehouseId}`}>
                        <TableCell>
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.sku}</p>
                        </TableCell>
                        <TableCell className="text-sm">{r.warehouseName}</TableCell>
                        <TableCell>{r.currentStock}</TableCell>
                        <TableCell>{r.txSum}</TableCell>
                        <TableCell>
                          <Badge variant={r.drift > 0 ? 'secondary' : 'destructive'}>
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
