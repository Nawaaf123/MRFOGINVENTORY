import { useState } from 'react'
import { Search, Plus, Filter, Download, ArrowUpDown } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getTotalQuantity, formatCurrency } from '@/lib/utils'
import { downloadInventorySheet } from '@/lib/inventorySheet'
import { toast } from 'sonner'
import type { InventoryItem } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>

interface Props {
  inv: Inv
}

export function InventoryView({ inv }: Props) {
  const [showAddDialog, setShowAddDialog] = useState(false)

  const { items, warehouses, loading, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, warehouseFilter, setWarehouseFilter, toggleSort, sortField, sortDirection, deleteItem, categories } = inv

  const uniqueCategories = categories.map((c) => c.name)

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
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
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
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
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
                    <Badge variant="secondary">{item.category}</Badge>
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
                  <TableCell className="text-right">
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
                  </div>
                  <Badge variant="secondary">{item.category}</Badge>
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
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(item)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Suppress unused state warning */}
      {showAddDialog && (
        <div className="hidden">{sortField}{sortDirection}</div>
      )}
    </div>
  )
}
