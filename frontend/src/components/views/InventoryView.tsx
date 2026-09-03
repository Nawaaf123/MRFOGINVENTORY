import { useState } from 'react'
import { Search, Plus, Filter, Download, ArrowUpDown, Pencil } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { getTotalQuantity, formatCurrency } from '@/lib/utils'
import { downloadInventorySheet } from '@/lib/inventorySheet'
import { toast } from 'sonner'
import type { InventoryItem, Warehouse } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>

interface Props {
  inv: Inv
}

export function InventoryView({ inv }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    subCategory: '',
    minStock: '0',
    price: '0',
    warehouseId: '',
    quantity: '0',
  })

  const {
    items,
    allItems,
    warehouses,
    loading,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    subCategoryFilter,
    setSubCategoryFilter,
    warehouseFilter,
    setWarehouseFilter,
    toggleSort,
    addItem,
    updateItem,
    deleteItem,
  } = inv

  const uniqueCategories = Array.from(
    new Set(allItems.map((i) => i.category).filter((c): c is string => Boolean(c?.trim())))
  ).sort((a, b) => a.localeCompare(b))

  const uniqueSubCategories = Array.from(
    new Set(
      allItems
        .filter((i) => !categoryFilter || i.category === categoryFilter)
        .map((i) => i.subCategory)
        .filter((c): c is string => Boolean(c?.trim()))
    )
  ).sort((a, b) => a.localeCompare(b))

  const handleCategoryChange = (value: string) => {
    const next = value === 'all' ? '' : value
    setCategoryFilter(next)
    if (next && subCategoryFilter) {
      const stillValid = allItems.some(
        (i) => i.category === next && i.subCategory === subCategoryFilter
      )
      if (!stillValid) setSubCategoryFilter('')
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: '',
      sku: '',
      category: '',
      subCategory: '',
      minStock: '0',
      price: '0',
      warehouseId: warehouses[0]?.id ?? '',
      quantity: '0',
    })
    setDialogOpen(true)
  }

  const openEdit = (item: InventoryItem) => {
    setEditing(item)
    setForm({
      name: item.name,
      sku: item.sku,
      category: item.category,
      subCategory: item.subCategory,
      minStock: String(item.minStock),
      price: String(item.price),
      warehouseId: warehouses[0]?.id ?? '',
      quantity: '0',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.sku.trim()) {
      toast.error('Name and SKU are required')
      return
    }
    try {
      if (editing) {
        await updateItem(editing.id, {
          name: form.name.trim(),
          sku: form.sku.trim(),
          category: form.category.trim(),
          subCategory: form.subCategory.trim(),
          minStock: Number(form.minStock) || 0,
          price: Number(form.price) || 0,
        })
        toast.success('Item updated')
      } else {
        const qty = Number(form.quantity) || 0
        await addItem({
          name: form.name.trim(),
          sku: form.sku.trim(),
          category: form.category.trim() || undefined,
          subCategory: form.subCategory.trim() || undefined,
          minStock: Number(form.minStock) || 0,
          price: Number(form.price) || 0,
          initialStock:
            form.warehouseId && qty > 0
              ? [{ warehouseId: form.warehouseId, quantity: qty }]
              : undefined,
        })
        toast.success('Item added')
      }
      setDialogOpen(false)
    } catch {
      toast.error(editing ? 'Failed to update item' : 'Failed to add item')
    }
  }

  const handleDelete = async (item: InventoryItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return
    try {
      await deleteItem(item.id)
      toast.success('Item deleted')
    } catch {
      toast.error('Failed to delete item')
    }
  }

  const handleDownload = () => {
    downloadInventorySheet(items)
    toast.success('Inventory PDF downloaded')
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Inventory</h1>
            <p className="text-muted-foreground text-sm">{items.length} items</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, SKU, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter || 'all'} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-full sm:w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {uniqueCategories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={subCategoryFilter || 'all'}
            onValueChange={(v) => setSubCategoryFilter(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Subcategory" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subcategories</SelectItem>
              {uniqueSubCategories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={warehouseFilter || 'all'} onValueChange={(v) => setWarehouseFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground">
                  Name <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Subcategory</TableHead>
              <TableHead>
                <button onClick={() => toggleSort('quantity')} className="flex items-center gap-1 hover:text-foreground">
                  Stock <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('price')} className="flex items-center gap-1 hover:text-foreground">
                  Price <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Warehouses</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No items found
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => {
              const total = getTotalQuantity(item)
              const low = total <= item.minStock
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{item.sku}</TableCell>
                  <TableCell>
                    {item.category ? <Badge variant="secondary">{item.category}</Badge> : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.subCategory || '—'}
                  </TableCell>
                  <TableCell>
                    <span className={low ? 'text-destructive font-semibold' : ''}>{total}</span>
                    {low && <span className="ml-1 text-xs text-destructive">(low)</span>}
                  </TableCell>
                  <TableCell>{formatCurrency(item.price)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.stock.filter((s) => s.quantity > 0).map((s) => (
                        <Badge key={s.warehouseId} variant="outline" className="text-xs">
                          {s.warehouseName}: {s.quantity}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex-1 overflow-auto p-4 space-y-3">
        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No items found</div>
        )}
        {items.map((item) => {
          const total = getTotalQuantity(item)
          const low = total <= item.minStock
          return (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    {item.subCategory && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.subCategory}</p>
                    )}
                  </div>
                  {item.category ? <Badge variant="secondary">{item.category}</Badge> : null}
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className={low ? 'text-destructive font-bold' : 'font-medium'}>
                    Stock: {total}{low && ' ⚠'}
                  </span>
                  <span className="text-muted-foreground">{formatCurrency(item.price)}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.stock.filter((s) => s.quantity > 0).map((s) => (
                    <Badge key={s.warehouseId} variant="outline" className="text-xs">
                      {s.warehouseName}: {s.quantity}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(item)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="mt-1" list="inv-categories" />
                <datalist id="inv-categories">
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Subcategory</Label>
                <Input value={form.subCategory} onChange={(e) => setForm((p) => ({ ...p, subCategory: e.target.value }))} className="mt-1" list="inv-subcategories" />
                <datalist id="inv-subcategories">
                  {uniqueSubCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price</Label>
                <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Min stock</Label>
                <Input type="number" min="0" value={form.minStock} onChange={(e) => setForm((p) => ({ ...p, minStock: e.target.value }))} className="mt-1" />
              </div>
            </div>
            {!editing && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Opening warehouse</Label>
                  <Select value={form.warehouseId} onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: v }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w: Warehouse) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Opening qty</Label>
                  <Input type="number" min="0" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} className="mt-1" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? 'Save' : 'Add Item'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
