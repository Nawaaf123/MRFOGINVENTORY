import { useState, useMemo } from 'react'
import { format, subDays, isAfter, isBefore } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import type { useInventory } from '@/hooks/useInventory'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function ReportsView({ inv }: Props) {
  const { orders, loading } = inv
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const filtered = orders.filter((o) => {
    const d = new Date(o.date)
    return (
      o.status !== 'cancelled' &&
      !isBefore(d, new Date(startDate)) &&
      !isAfter(d, new Date(endDate + 'T23:59:59'))
    )
  })

  const dailySales = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((o) => {
      const key = format(new Date(o.date), 'MMM d')
      const total = o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) + o.shippingFee
      map[key] = (map[key] ?? 0) + total
    })
    return Object.entries(map).map(([date, sales]) => ({ date, sales }))
  }, [filtered])

  const shopSales = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((o) => {
      const total = o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) + o.shippingFee
      map[o.shopName] = (map[o.shopName] ?? 0) + total
    })
    return Object.entries(map)
      .map(([shop, sales]) => ({ shop, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10)
  }, [filtered])

  const totalRevenue = filtered.reduce(
    (s, o) => s + o.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0) + o.shippingFee,
    0
  )
  const totalOrders = filtered.length

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="flex flex-wrap gap-4 mt-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-40" />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'))}>7D</Button>
            <Button size="sm" variant="outline" onClick={() => setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'))}>30D</Button>
            <Button size="sm" variant="outline" onClick={() => setStartDate(format(subDays(new Date(), 90), 'yyyy-MM-dd'))}>90D</Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Revenue</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Orders</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalOrders}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Order</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{formatCurrency(totalOrders ? totalRevenue / totalOrders : 0)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Shops</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{shopSales.length}</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Daily Sales</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="sales" stroke="hsl(172,66%,40%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Shops</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={shopSales} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="shop" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="sales" fill="hsl(172,66%,40%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
