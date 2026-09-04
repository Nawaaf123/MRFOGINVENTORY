import { useMemo, useState } from 'react'
import { ArrowLeftRight, Pencil } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { Warehouse } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function WarehousesView({ inv }: Props) {
  const { warehouses, allItems, updateWarehouse, transferStock, loading, refresh } = inv
  const [editOpen, setEditOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [form, setForm] = useState({ name: '', location: '', color: '#14b8a6' })
  const [transfer, setTransfer] = useState({
    itemId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: '1',
  })
  const [saving, setSaving] = useState(false)

  const sorted = [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder)

  const getWarehouseTotal = (warehouseId: string) =>
    allItems.reduce(
      (sum, i) => sum + (i.stock.find((s) => s.warehouseId === warehouseId)?.quantity ?? 0),
      0
    )

  const selectedItem = allItems.find((i) => i.id === transfer.itemId)
  const availableFrom = useMemo(() => {
    if (!selectedItem || !transfer.fromWarehouseId) return 0
    return selectedItem.stock.find((s) => s.warehouseId === transfer.fromWarehouseId)?.quantity ?? 0
  }, [selectedItem, transfer.fromWarehouseId])

  const handleEdit = (w: Warehouse) => {
    setEditing(w)
    setForm({ name: w.name, location: w.location, color: w.color || '#14b8a6' })
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!editing) return
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    try {
      await updateWarehouse(editing.id, form)
      toast.success('Warehouse updated')
      setEditOpen(false)
    } catch {
      toast.error('Failed to update')
    }
  }

  const openTransfer = () => {
    setTransfer({
      itemId: '',
      fromWarehouseId: sorted[0]?.id ?? '',
      toWarehouseId: sorted[1]?.id ?? '',
      quantity: '1',
    })
    setTransferOpen(true)
  }

  const handleTransfer = async () => {
    const qty = Number(transfer.quantity)
    if (!transfer.itemId || !transfer.fromWarehouseId || !transfer.toWarehouseId) {
      toast.error('Select product and both warehouses')
      return
    }
    if (transfer.fromWarehouseId === transfer.toWarehouseId) {
      toast.error('Choose two different warehouses')
      return
    }
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity')
      return
    }
    if (qty > availableFrom) {
      toast.error(`Only ${availableFrom} available in source warehouse`)
      return
    }
    setSaving(true)
    try {
      await transferStock({
        itemId: transfer.itemId,
        fromWarehouseId: transfer.fromWarehouseId,
        toWarehouseId: transfer.toWarehouseId,
        quantity: qty,
      })
      toast.success('Stock transferred')
      setTransferOpen(false)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Warehouses</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Glendale, York, Bensenville, Addison — each holds its own stock
            </p>
          </div>
          <Button size="sm" onClick={openTransfer}>
            <ArrowLeftRight className="h-4 w-4 mr-1" />
            Transfer Stock
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-3">
        {sorted.map((w) => {
          const total = getWarehouseTotal(w.id)
          const itemCount = allItems.filter((i) =>
            i.stock.some((s) => s.warehouseId === w.id && s.quantity > 0)
          ).length

          return (
            <Card key={w.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div
                  className="h-4 w-4 rounded-full shrink-0"
                  style={{ backgroundColor: w.color || '#14b8a6' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{w.name}</p>
                  <p className="text-sm text-muted-foreground">{w.location}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{total}</p>
                  <p className="text-xs text-muted-foreground">{itemCount} SKUs in stock</p>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(w)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          )
        })}
        {sorted.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No warehouses found</div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Warehouse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-1">
                <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} className="h-10 w-16 rounded cursor-pointer" />
                <Input value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Product</Label>
              <Select
                value={transfer.itemId}
                onValueChange={(v) => setTransfer((p) => ({ ...p, itemId: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {allItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From warehouse</Label>
              <Select
                value={transfer.fromWarehouseId}
                onValueChange={(v) => setTransfer((p) => ({ ...p, fromWarehouseId: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transfer.itemId && transfer.fromWarehouseId && (
                <p className="text-xs text-muted-foreground mt-1">Available: {availableFrom}</p>
              )}
            </div>
            <div>
              <Label>To warehouse</Label>
              <Select
                value={transfer.toWarehouseId}
                onValueChange={(v) => setTransfer((p) => ({ ...p, toWarehouseId: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Destination" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={transfer.quantity}
                onChange={(e) => setTransfer((p) => ({ ...p, quantity: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={saving}>
              {saving ? 'Transferring...' : 'Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
