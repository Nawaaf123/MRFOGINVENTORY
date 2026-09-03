import { useState } from 'react'
import { format } from 'date-fns'
import { ExternalLink, Trash2 } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { openBolDocument } from '@/lib/bolDocs'
import { toast } from 'sonner'
import type { InventoryTransaction } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function ReceivingsView({ inv }: Props) {
  const { transactions, deleteReceiving, loading } = inv
  const [_deleting, setDeleting] = useState<string | null>(null)

  const receivings = transactions.filter((t) =>
    ['receive', 'opening_balance'].includes(t.type)
  )

  const grouped = receivings.reduce<Record<string, InventoryTransaction[]>>((acc, t) => {
    const key = `${t.bolNumber}__${format(new Date(t.date), 'yyyy-MM-dd')}`
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  const handleDelete = async (t: InventoryTransaction) => {
    if (!confirm('Delete this receiving entry?')) return
    setDeleting(t.id)
    try {
      await deleteReceiving(t.id)
      toast.success('Receiving deleted')
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Receivings</h1>
        <p className="text-muted-foreground text-sm mt-1">Stock received, grouped by BOL</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No receivings found</div>
        )}
        {Object.entries(grouped).map(([key, txs]) => {
          const [bolNumber, date] = key.split('__')
          const firstTx = txs[0]
          return (
            <div key={key}>
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="outline" className="font-mono">{bolNumber}</Badge>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                </span>
                {firstTx.bolDocumentUrl && (
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => openBolDocument(firstTx.bolDocumentUrl!)}>
                    <ExternalLink className="h-3 w-3 mr-1" />BOL Doc
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {txs.map((t) => (
                  <Card key={t.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{t.itemName}</p>
                        <p className="text-xs text-muted-foreground">{t.itemSku} · {t.warehouseName}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-primary">+{t.quantity}</span>
                        <Button variant="ghost" size="sm" className="text-destructive h-8 w-8 p-0" onClick={() => handleDelete(t)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
