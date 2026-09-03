import type { useInventory } from '@/hooks/useInventory'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getTotalQuantity } from '@/lib/utils'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function StockSummaryView({ inv }: Props) {
  const { allItems, warehouses, loading } = inv

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Stock Summary</h1>
        <p className="text-muted-foreground text-sm mt-1">All stock across warehouses</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {warehouses.map((w) => {
            const total = allItems.reduce(
              (sum, i) => sum + (i.stock.find((s) => s.warehouseId === w.id)?.quantity ?? 0),
              0
            )
            return (
              <Card key={w.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{w.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" style={{ color: w.color }}>{total}</p>
                  <p className="text-xs text-muted-foreground">units</p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  {warehouses.map((w) => <TableHead key={w.id}>{w.name}</TableHead>)}
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{item.sku}</TableCell>
                    {warehouses.map((w) => {
                      const qty = item.stock.find((s) => s.warehouseId === w.id)?.quantity ?? 0
                      return (
                        <TableCell key={w.id} className={qty === 0 ? 'text-muted-foreground' : ''}>
                          {qty}
                        </TableCell>
                      )
                    })}
                    <TableCell className="font-semibold">{getTotalQuantity(item)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
