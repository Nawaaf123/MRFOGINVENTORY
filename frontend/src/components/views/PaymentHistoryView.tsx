import { useState } from 'react'
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function PaymentHistoryView({ inv }: Props) {
  const { payments, orders, loading } = inv
  const [search, setSearch] = useState('')

  const enriched = payments.map((p) => {
    const order = orders.find((o) => o.id === p.orderId)
    return { ...p, shopName: order?.shopName ?? 'Unknown' }
  })

  const filtered = enriched.filter((p) =>
    p.shopName.toLowerCase().includes(search.toLowerCase()) ||
    p.method.toLowerCase().includes(search.toLowerCase())
  )

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

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Payment History</h1>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
        </div>
        <Input
          placeholder="Search by shop or method..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-auto">
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
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No payments found</TableCell>
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
      </div>
    </div>
  )
}
