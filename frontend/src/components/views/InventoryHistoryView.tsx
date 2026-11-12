import { useState } from 'react'
import { format } from 'date-fns'
import { ExternalLink } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { openBolDocument } from '@/lib/bolDocs'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

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

export function InventoryHistoryView({ inv }: Props) {
  const { transactions, loading } = inv
  const [search, setSearch] = useState('')

  const filtered = transactions.filter((t) => {
    const q = search.toLowerCase()
    return (
      t.itemName.toLowerCase().includes(q) ||
      t.bolNumber.toLowerCase().includes(q) ||
      (t.note || '').toLowerCase().includes(q) ||
      t.warehouseName.toLowerCase().includes(q)
    )
  })

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Inventory History</h1>
        <div className="mt-3">
          <Input placeholder="Search by item, BOL, or warehouse..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No transactions found</TableCell>
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
