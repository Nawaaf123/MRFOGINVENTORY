import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Plus, Store, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatCurrency } from '@/lib/utils'
import type { InventoryItem, Warehouse, Wholesaler } from '@/types/inventory'

export interface OrderLineDraft {
  itemId: string
  itemName: string
  itemSku: string
  warehouseId: string
  quantity: string
  unitPrice: string
}

interface OrderComposerProps {
  wholesalers: Wholesaler[]
  warehouses: Warehouse[]
  items: InventoryItem[]
  shopName: string
  onShopNameChange: (name: string) => void
  shippingFee: string
  onShippingFeeChange: (fee: string) => void
  lines: OrderLineDraft[]
  onChange: (lines: OrderLineDraft[]) => void
  /** When editing, qty already on this order at a warehouse is still "available" */
  reservedQty?: (itemId: string, warehouseId: string) => number
}

function compareSku(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function totalStock(item: InventoryItem): number {
  return item.stock.reduce((s, w) => s + (w.quantity || 0), 0)
}

function stockAt(item: InventoryItem | undefined, warehouseId: string): number {
  if (!item) return 0
  return item.stock.find((s) => s.warehouseId === warehouseId)?.quantity ?? 0
}

function preferredWarehouseId(item: InventoryItem, warehouses: Warehouse[]): string {
  const bensenville = warehouses.find((w) => /bensenville/i.test(w.name))
  if (bensenville && stockAt(item, bensenville.id) > 0) return bensenville.id
  const withStock = warehouses
    .map((w) => ({ id: w.id, qty: stockAt(item, w.id) }))
    .filter((w) => w.qty > 0)
    .sort((a, b) => b.qty - a.qty)
  if (withStock[0]) return withStock[0].id
  return bensenville?.id || warehouses[0]?.id || ''
}

export function OrderComposer({
  wholesalers,
  warehouses,
  items,
  shopName,
  onShopNameChange,
  shippingFee,
  onShippingFeeChange,
  lines,
  onChange,
  reservedQty,
}: OrderComposerProps) {
  const [category, setCategory] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [scan, setScan] = useState('')
  const [scanQty, setScanQty] = useState('1')
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  const sortedWholesalers = useMemo(
    () => [...wholesalers].sort((a, b) => a.name.localeCompare(b.name)),
    [wholesalers]
  )
  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [warehouses]
  )

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

  const browseItems = useMemo(() => {
    const q = browseSearch.trim().toLowerCase()
    return items
      .filter((item) => {
        if (category && item.category !== category) return false
        if (subCategory && item.subCategory !== subCategory) return false
        if (!q) return true
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => compareSku(a.sku, b.sku))
  }, [items, category, subCategory, browseSearch])

  const handleCategoryChange = (value: string) => {
    const next = value === 'all' ? '' : value
    setCategory(next)
    if (next && subCategory) {
      const ok = items.some((i) => i.category === next && i.subCategory === subCategory)
      if (!ok) setSubCategory('')
    }
  }

  const availableAt = (itemId: string, warehouseId: string) => {
    const item = items.find((i) => i.id === itemId)
    const onHand = stockAt(item, warehouseId)
    const reserved = reservedQty?.(itemId, warehouseId) ?? 0
    return onHand + reserved
  }

  const addOrToggleItem = (item: InventoryItem, qty = 1) => {
    const existing = lines.find((l) => l.itemId === item.id)
    if (existing) {
      onChange(lines.filter((l) => l.itemId !== item.id))
      return
    }
    const warehouseId = preferredWarehouseId(item, sortedWarehouses)
    onChange([
      ...lines,
      {
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        warehouseId,
        quantity: String(Math.max(1, qty)),
        unitPrice: String(item.price ?? 0),
      },
    ])
  }

  const addFromScan = () => {
    const q = scan.trim().toLowerCase()
    if (!q) return
    const qty = Math.max(1, Number(scanQty) || 1)
    const match =
      items.find((i) => i.sku.toLowerCase() === q) ||
      items.find((i) => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
    if (!match) return
    if (category && match.category !== category) return
    if (subCategory && match.subCategory !== subCategory) return

    const existing = lines.find((l) => l.itemId === match.id)
    if (existing) {
      onChange(
        lines.map((l) =>
          l.itemId === match.id
            ? { ...l, quantity: String(Number(l.quantity || 0) + qty) }
            : l
        )
      )
    } else {
      const warehouseId = preferredWarehouseId(match, sortedWarehouses)
      onChange([
        ...lines,
        {
          itemId: match.id,
          itemName: match.name,
          itemSku: match.sku,
          warehouseId,
          quantity: String(qty),
          unitPrice: String(match.price ?? 0),
        },
      ])
    }
    setScan('')
    setScanQty('1')
    scanRef.current?.focus()
  }

  const updateLine = (itemId: string, patch: Partial<OrderLineDraft>) => {
    onChange(lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)))
  }

  const removeLine = (itemId: string) => {
    onChange(lines.filter((l) => l.itemId !== itemId))
  }

  const cases = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0
  )
  const total = subtotal + (Number(shippingFee) || 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={shopName || undefined} onValueChange={onShopNameChange}>
          <SelectTrigger className="flex-1 min-w-[180px]">
            <SelectValue placeholder="Select shop / wholesaler" />
          </SelectTrigger>
          <SelectContent>
            {sortedWholesalers.map((w) => (
              <SelectItem key={w.id} value={w.name}>
                {w.name}
                {w.contactPerson ? ` · ${w.contactPerson}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category || 'all'} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subCategory || 'all'}
          onValueChange={(v) => setSubCategory(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Subcategory" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subcategories</SelectItem>
            {subCategories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          ref={scanRef}
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addFromScan()
            }
          }}
          placeholder="Scan / type SKU or name, press Enter"
          className="flex-1"
        />
        <Input
          type="number"
          min={1}
          value={scanQty}
          onChange={(e) => setScanQty(e.target.value)}
          className="w-20"
          title="Quantity"
        />
        <Button
          type="button"
          className="bg-rose-600 hover:bg-rose-700 text-white shrink-0 px-3"
          onClick={addFromScan}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Popover open={browseOpen} onOpenChange={setBrowseOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="shrink-0 gap-1">
              Browse products
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="end">
            <div className="p-2 border-b">
              <Input
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                placeholder="Search product by SKU or name..."
                className="h-9"
              />
            </div>
            <div className="max-h-72 overflow-auto py-1">
              {browseItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No products</p>
              )}
              {browseItems.map((item) => {
                const selected = lines.some((l) => l.itemId === item.id)
                const stock = totalStock(item)
                const out = stock <= 0
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addOrToggleItem(item)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors',
                      selected && 'bg-rose-50',
                      out && 'opacity-50'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-sm border shrink-0',
                        selected
                          ? 'border-rose-600 bg-rose-600 text-white'
                          : 'border-muted-foreground/40'
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground mr-1.5">{item.sku}</span>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className={cn('tabular-nums text-xs shrink-0', out ? 'text-muted-foreground' : 'font-medium')}>
                      {stock}
                    </span>
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="rounded-md border overflow-auto max-h-[40vh]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="w-[180px]">Warehouse</TableHead>
              <TableHead className="w-[72px] text-right">Qty</TableHead>
              <TableHead className="w-[88px] text-right">Price</TableHead>
              <TableHead className="w-[88px] text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No products yet — browse or scan to add
                </TableCell>
              </TableRow>
            )}
            {lines.map((line) => {
              const item = items.find((i) => i.id === line.itemId)
              const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
              return (
                <TableRow key={line.itemId}>
                  <TableCell>
                    <p className="font-mono text-xs text-muted-foreground">{line.itemSku}</p>
                    <p className="text-sm font-medium">{line.itemName}</p>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={line.warehouseId}
                      onValueChange={(id) => updateLine(line.itemId, { warehouseId: id })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedWarehouses.map((w) => {
                          const qty = availableAt(line.itemId, w.id)
                          return (
                            <SelectItem
                              key={w.id}
                              value={w.id}
                              className={qty <= 0 ? 'text-muted-foreground' : undefined}
                            >
                              {w.name} ({qty})
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {!item && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Item missing from catalog</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.itemId, { quantity: e.target.value })}
                      className="h-8 w-16 ml-auto text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.itemId, { unitPrice: e.target.value })}
                      className="h-8 w-20 ml-auto text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatCurrency(lineTotal)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={() => removeLine(line.itemId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{cases}</span> cases ·{' '}
          <span className="font-medium text-foreground">{lines.length}</span> lines
        </div>
        <div className="space-y-1.5 text-sm min-w-[200px]">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-muted-foreground font-normal">Shipping fee</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={shippingFee}
              onChange={(e) => onShippingFeeChange(e.target.value)}
              className="h-8 w-24 text-right"
            />
          </div>
          <div className="flex justify-between gap-6 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {sortedWholesalers.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          Add wholesalers on the Wholesalers page before creating orders.
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Store className="h-3.5 w-3.5" />
        Warehouse letter on the order sheet comes from each line’s warehouse (B/G/Y/A).
      </div>
    </div>
  )
}
