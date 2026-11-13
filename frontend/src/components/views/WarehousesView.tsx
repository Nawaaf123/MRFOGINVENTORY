import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/layout/PageShell'
import { toast } from 'sonner'
import type { Warehouse } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

export function WarehousesView({ inv }: Props) {
  const { warehouses, allItems, updateWarehouse, loading } = inv
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [form, setForm] = useState({ name: '', location: '', color: '#c41e2a' })

  const sorted = [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder)

  const getWarehouseTotal = (warehouseId: string) =>
    allItems.reduce(
      (sum, i) => sum + (i.stock.find((s) => s.warehouseId === warehouseId)?.quantity ?? 0),
      0
    )

  const handleEdit = (w: Warehouse) => {
    setEditing(w)
    setForm({ name: w.name, location: w.location, color: w.color || '#c41e2a' })
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

  if (loading) return <div className="py-4 pr-4 pl-16 sm:py-6 sm:pr-6 lg:pl-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Warehouses</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Glendale, York, Bensenville, Addison — each holds its own stock. Use Inventory → Transfer Stock to move products.
            </p>
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto min-h-0 p-4 sm:p-6 space-y-3">
        {sorted.map((w) => {
          const total = getWarehouseTotal(w.id)
          const itemCount = allItems.filter((i) =>
            i.stock.some((s) => s.warehouseId === w.id && s.quantity > 0)
          ).length

          return (
            <Card key={w.id}>
              <CardContent className="p-4 flex items-center gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
                <div
                  className="h-4 w-4 rounded-full shrink-0"
                  style={{ backgroundColor: w.color || '#c41e2a' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{w.name}</p>
                  <p className="text-sm text-muted-foreground">{w.location}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{total}</p>
                  <p className="text-xs text-muted-foreground">{itemCount} SKUs in stock</p>
                </div>
                <Button variant="ghost" size="sm" className="h-11 w-11 sm:h-8 sm:w-8 p-0" onClick={() => handleEdit(w)}>
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
    </div>
  )
}
