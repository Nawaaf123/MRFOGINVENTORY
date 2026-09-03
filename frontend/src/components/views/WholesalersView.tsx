import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { Wholesaler } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

const emptyForm = { name: '', contactPerson: '', phone: '', email: '', address: '' }

export function WholesalersView({ inv }: Props) {
  const { wholesalers, addWholesaler, updateWholesaler, deleteWholesaler, loading } = inv
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Wholesaler | null>(null)
  const [form, setForm] = useState(emptyForm)

  const filtered = wholesalers.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleOpen = (w?: Wholesaler) => {
    if (w) {
      setEditing(w)
      setForm({ name: w.name, contactPerson: w.contactPerson, phone: w.phone, email: w.email, address: w.address })
    } else {
      setEditing(null)
      setForm(emptyForm)
    }
    setOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editing) {
        await updateWholesaler(editing.id, form)
        toast.success('Wholesaler updated')
      } else {
        await addWholesaler(form)
        toast.success('Wholesaler added')
      }
      setOpen(false)
    } catch {
      toast.error('Failed to save')
    }
  }

  const handleDelete = async (w: Wholesaler) => {
    if (!confirm(`Delete "${w.name}"?`)) return
    try {
      await deleteWholesaler(w.id)
      toast.success('Wholesaler deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Wholesalers</h1>
          <Button size="sm" onClick={() => handleOpen()}>
            <Plus className="h-4 w-4 mr-1" />Add
          </Button>
        </div>
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="flex-1 overflow-auto p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {filtered.map((w) => (
          <Card key={w.id}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold">{w.name}</p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpen(w)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(w)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{w.contactPerson}</p>
              <p className="text-sm">{w.phone}</p>
              <p className="text-sm text-muted-foreground">{w.email}</p>
              <p className="text-xs text-muted-foreground mt-1">{w.address}</p>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">No wholesalers found</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Wholesaler' : 'Add Wholesaler'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(Object.keys(emptyForm) as (keyof typeof emptyForm)[]).map((field) => (
              <div key={field}>
                <Label className="capitalize">{field.replace(/([A-Z])/g, ' $1')}</Label>
                <Input
                  value={form[field]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
