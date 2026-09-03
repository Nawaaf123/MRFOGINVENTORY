import { useState } from 'react'
import { format } from 'date-fns'
import { ExternalLink, Trash2, Plus } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { openBolDocument } from '@/lib/bolDocs'
import { toast } from 'sonner'
import type { InventoryTransaction } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function ReceivingsView({ inv }: Props) {
  const { transactions, allItems, warehouses, receiveStock, deleteReceiving, loading } = inv
  const [_deleting, setDeleting] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ itemId: '', warehouseId: '', quantity: '1', bolNumber: '' })

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
    if (!confirm('Delete all receiving entries for this BOL?')) return
    setDeleting(t.id)
    try {
      await deleteReceiving(t.bolNumber)
      toast.success('Receiving deleted')
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const handleReceive = async () => {
    if (!form.itemId || !form.warehouseId || !form.bolNumber.trim() || Number(form.quantity) <= 0) {
      toast.error('Item, warehouse, BOL, and quantity are required')
      return
    }
    try {
      await receiveStock({
        itemId: form.itemId,
        warehouseId: form.warehouseId,
        quantity: Number(form.quantity),
        bolNumber: form.bolNumber.trim(),
      })
      toast.success('Stock received')
      setOpen(false)
      setForm({ itemId: '', warehouseId: warehouses[0]?.id ?? '', quantity: '1', bolNumber: '' })
    } catch {
      toast.error('Failed to receive stock')
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Receivings</h1>
            <p className="text-muted-foreground text-sm mt-1">Stock received, grouped by BOL</p>
          </div>
          <Button size="sm" onClick={() => {
            setForm((p) => ({ ...p, warehouseId: p.warehouseId || warehouses[0]?.id || '' }))
            setOpen(true)
          }}>
            <Plus className="h-4 w-4 mr-1" />Receive Stock
          </Button>
        </div>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Item</Label>
              <Select value={form.itemId} onValueChange={(v) => setForm((p) => ({ ...p, itemId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {allItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Warehouse</Label>
              <Select value={form.warehouseId} onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" min="1" value={form.quantity} className="mt-1" onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div>
              <Label>BOL number</Label>
              <Input value={form.bolNumber} className="mt-1" onChange={(e) => setForm((p) => ({ ...p, bolNumber: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleReceive}>Receive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
