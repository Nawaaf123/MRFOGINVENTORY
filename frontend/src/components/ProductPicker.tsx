import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { InventoryItem } from '@/types/inventory'

export interface PickedProductLine {
  itemId: string
  itemName: string
  itemSku: string
  quantity: string
  unitPrice?: string
}

interface ProductPickerProps {
  items: InventoryItem[]
  lines: PickedProductLine[]
  onChange: (lines: PickedProductLine[]) => void
  /** Optional available qty shown next to each selected line (e.g. transfer from warehouse) */
  getAvailableQty?: (itemId: string) => number | undefined
  showUnitPrice?: boolean
  listHeightClassName?: string
}

function compareSku(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function ProductPicker({
  items,
  lines,
  onChange,
  getAvailableQty,
  showUnitPrice = false,
  listHeightClassName = 'h-44',
}: ProductPickerProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [subCategory, setSubCategory] = useState('')

  const categories = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c?.trim())))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [items]
  )

  const subCategories = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => !category || i.category === category)
            .map((i) => i.subCategory)
            .filter((c): c is string => Boolean(c?.trim()))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [items, category]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((item) => {
        if (category && item.category !== category) return false
        if (subCategory && item.subCategory !== subCategory) return false
        if (!q) return true
        const hay = [item.name, item.sku, item.category, item.subCategory]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => compareSku(a.sku, b.sku))
      .slice(0, 80)
  }, [items, search, category, subCategory])

  const handleCategoryChange = (value: string) => {
    const next = value === 'all' ? '' : value
    setCategory(next)
    if (next && subCategory) {
      const ok = items.some((i) => i.category === next && i.subCategory === subCategory)
      if (!ok) setSubCategory('')
    }
  }

  const addItem = (item: InventoryItem) => {
    const existing = lines.find((l) => l.itemId === item.id)
    if (existing) {
      onChange(
        lines.map((l) =>
          l.itemId === item.id
            ? { ...l, quantity: String(Math.max(1, Number(l.quantity || 0) + 1)) }
            : l
        )
      )
      return
    }
    onChange([
      ...lines,
      {
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        quantity: '1',
        ...(showUnitPrice ? { unitPrice: String(item.price ?? 0) } : {}),
      },
    ])
  }

  const updateLine = (itemId: string, patch: Partial<PickedProductLine>) => {
    onChange(lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)))
  }

  const removeLine = (itemId: string) => {
    onChange(lines.filter((l) => l.itemId !== itemId))
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Search products</Label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={category || 'all'} onValueChange={handleCategoryChange}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subCategory || 'all'}
          onValueChange={(v) => setSubCategory(v === 'all' ? '' : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Subcategory" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subcategories</SelectItem>
            {subCategories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className={`${listHeightClassName} rounded-md border`}>
        <div className="p-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-3 text-center">No products found</p>
          )}
          {filtered.map((item) => {
            const selected = lines.some((l) => l.itemId === item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item)}
                className="w-full text-left rounded-md px-3 py-2 hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {item.sku}
                      {item.category ? ` · ${item.category}` : ''}
                      {item.subCategory ? ` · ${item.subCategory}` : ''}
                    </p>
                  </div>
                  <Badge variant={selected ? 'default' : 'outline'} className="shrink-0">
                    {selected ? 'Added' : 'Add'}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
      <p className="text-xs text-muted-foreground">
        Click products to add them (sorted by SKU). Then set quantities below.
      </p>

      {lines.length > 0 && (
        <div className="space-y-2">
          <Label>Selected ({lines.length})</Label>
          {lines.map((line) => {
            const available = getAvailableQty?.(line.itemId)
            return (
              <div key={line.itemId} className="flex items-center gap-2 rounded-md border p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{line.itemName}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {line.itemSku}
                    {typeof available === 'number' ? ` · avail ${available}` : ''}
                  </p>
                </div>
                {showUnitPrice && (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice ?? '0'}
                    onChange={(e) => updateLine(line.itemId, { unitPrice: e.target.value })}
                    className="w-24 h-8"
                    title="Unit price"
                  />
                )}
                <Input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.itemId, { quantity: e.target.value })}
                  className="w-24 h-8"
                  title="Quantity"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive"
                  onClick={() => removeLine(line.itemId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
