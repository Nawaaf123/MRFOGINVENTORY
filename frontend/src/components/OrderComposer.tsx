import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Minus, Plus, Store, Trash2 } from 'lucide-react'
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
  const [mobileTab, setMobileTab] = useState<'browse' | 'cart'>('browse')
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
    setMobileTab('cart')
    scanRef.current?.focus()
  }

  const updateLine = (itemId: string, patch: Partial<OrderLineDraft>) => {
    onChange(lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)))
  }

  const bumpQty = (itemId: string, delta: number) => {
    const line = lines.find((l) => l.itemId === itemId)
    if (!line) return
    const next = Math.max(1, (Number(line.quantity) || 0) + delta)
    updateLine(itemId, { quantity: String(next) })
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

  const filters = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={shopName || undefined} onValueChange={onShopNameChange}>
        <SelectTrigger className="h-12 flex-1 min-w-0 text-base sm:h-10 sm:text-sm sm:min-w-[180px]">
          <SelectValue placeholder="Select shop / wholesaler" />
        </SelectTrigger>
        <SelectContent>
          {sortedWholesalers.map((w) => (
            <SelectItem key={w.id} value={w.name} className="text-base sm:text-sm py-3 sm:py-1.5">
              {w.name}
              {w.contactPerson ? ` · ${w.contactPerson}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={category || 'all'} onValueChange={handleCategoryChange}>
        <SelectTrigger className="h-12 w-full text-base sm:h-10 sm:w-40 sm:text-sm">
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
        <SelectTrigger className="h-12 w-full text-base sm:h-10 sm:w-48 sm:text-sm">
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
  )

  const scanRow = (
    <div className="flex gap-2">
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
        placeholder="Scan / type SKU or name"
        className="h-12 flex-1 text-base sm:h-10 sm:text-sm"
        inputMode="search"
        enterKeyHint="done"
      />
      <Input
        type="number"
        min={1}
        value={scanQty}
        onChange={(e) => setScanQty(e.target.value)}
        className="h-12 w-16 text-center text-base sm:h-10 sm:w-20 sm:text-sm"
        title="Quantity"
      />
      <Button
        type="button"
        className="h-12 w-12 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground sm:h-10 sm:w-10"
        onClick={addFromScan}
        aria-label="Add scanned product"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  )

  const productButton = (item: InventoryItem) => {
    const selected = lines.some((l) => l.itemId === item.id)
    const stock = totalStock(item)
    const out = stock <= 0
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => addOrToggleItem(item)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-3.5 text-left transition-colors active:bg-accent sm:py-2 sm:gap-2 sm:text-sm',
          'hover:bg-accent border-b last:border-b-0',
          selected && 'bg-primary/5',
          out && 'opacity-50'
        )}
      >
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md border-2 shrink-0 sm:h-4 sm:w-4 sm:rounded-sm sm:border',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40'
          )}
        >
          {selected && <Check className="h-4 w-4 sm:h-3 sm:w-3" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-mono text-xs text-muted-foreground">{item.sku}</span>
          <span className="block font-medium text-base leading-snug truncate sm:text-sm">{item.name}</span>
        </span>
        <span className={cn('tabular-nums text-sm shrink-0 sm:text-xs', out ? 'text-muted-foreground' : 'font-semibold')}>
          {stock}
        </span>
      </button>
    )
  }

  const mobileBrowse = (
    <div className="flex flex-col min-h-0 flex-1 rounded-lg border overflow-hidden bg-background">
      <div className="p-2 border-b shrink-0">
        <Input
          value={browseSearch}
          onChange={(e) => setBrowseSearch(e.target.value)}
          placeholder="Search SKU or name..."
          className="h-12 text-base"
          inputMode="search"
        />
      </div>
      <div className="flex-1 overflow-auto overscroll-contain">
        {browseItems.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">No products</p>
        )}
        {browseItems.map(productButton)}
      </div>
    </div>
  )

  const desktopBrowsePopover = (
    <Popover open={browseOpen} onOpenChange={setBrowseOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-10 shrink-0 gap-1">
          Browse products
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0" align="end">
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
          {browseItems.map(productButton)}
        </div>
      </PopoverContent>
    </Popover>
  )

  const qtyStepper = (line: OrderLineDraft) => (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-11 p-0 shrink-0 sm:h-8 sm:w-8"
        onClick={() => bumpQty(line.itemId, -1)}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        min={1}
        value={line.quantity}
        onChange={(e) => updateLine(line.itemId, { quantity: e.target.value })}
        className="h-11 w-16 text-center text-base tabular-nums sm:h-8 sm:w-14 sm:text-sm"
      />
      <Button
        type="button"
        variant="outline"
        className="h-11 w-11 p-0 shrink-0 sm:h-8 sm:w-8"
        onClick={() => bumpQty(line.itemId, 1)}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )

  const mobileCartCards = (
    <div className="flex-1 min-h-0 overflow-auto overscroll-contain space-y-3">
      {lines.length === 0 && (
        <div className="rounded-lg border border-dashed py-12 px-4 text-center text-muted-foreground text-sm">
          No products yet — switch to Browse and tap flavors to add
        </div>
      )}
      {lines.map((line) => {
        const item = items.find((i) => i.id === line.itemId)
        const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
        return (
          <div key={line.itemId} className="rounded-xl border bg-background p-3 space-y-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{line.itemSku}</p>
                <p className="font-semibold text-base leading-snug">{line.itemName}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 p-0 shrink-0 text-destructive"
                onClick={() => removeLine(line.itemId)}
                aria-label="Remove product"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Warehouse</Label>
              <Select
                value={line.warehouseId}
                onValueChange={(id) => updateLine(line.itemId, { warehouseId: id })}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {sortedWarehouses.map((w) => {
                    const qty = availableAt(line.itemId, w.id)
                    return (
                      <SelectItem
                        key={w.id}
                        value={w.id}
                        className={cn('text-base py-3', qty <= 0 && 'text-muted-foreground')}
                      >
                        {w.name} ({qty})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {!item && (
                <p className="text-[10px] text-muted-foreground">Item missing from catalog</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Qty</Label>
                {qtyStepper(line)}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(line.itemId, { unitPrice: e.target.value })}
                  className="h-11 w-28 text-right text-base"
                />
              </div>
              <div className="text-right ml-auto">
                <p className="text-xs text-muted-foreground">Line</p>
                <p className="font-semibold tabular-nums text-base">{formatCurrency(lineTotal)}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const desktopTable = (
    <div className="rounded-md border overflow-auto max-h-[40vh]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="w-[180px]">Warehouse</TableHead>
            <TableHead className="w-[120px] text-center">Qty</TableHead>
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
                <TableCell>
                  <div className="flex justify-center">{qtyStepper(line)}</div>
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
  )

  const totals = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground text-base">{cases}</span> cases ·{' '}
        <span className="font-semibold text-foreground text-base">{lines.length}</span> lines
      </div>
      <div className="space-y-2 text-sm min-w-[200px]">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums font-medium">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-muted-foreground font-normal">Shipping fee</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={shippingFee}
            onChange={(e) => onShippingFeeChange(e.target.value)}
            className="h-11 w-28 text-right text-base sm:h-8 sm:w-24 sm:text-sm"
          />
        </div>
        <div className="flex justify-between gap-6 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      {filters}

      {/* Phone / tablet: Browse | Cart tabs (desktop table from lg up) */}
      <div className="flex flex-col gap-3 min-h-0 flex-1 lg:hidden">
        {scanRow}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('browse')}
            className={cn(
              'h-11 rounded-lg text-sm font-semibold transition-colors',
              mobileTab === 'browse'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            Browse
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className={cn(
              'h-11 rounded-lg text-sm font-semibold transition-colors',
              mobileTab === 'cart'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            Cart{lines.length > 0 ? ` (${lines.length})` : ''}
          </button>
        </div>
        {mobileTab === 'browse' ? mobileBrowse : (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            {mobileCartCards}
            {totals}
          </div>
        )}
        {mobileTab === 'browse' && lines.length > 0 && (
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className="shrink-0 rounded-xl border bg-primary/5 px-4 py-3 text-left active:bg-primary/10"
          >
            <p className="text-sm font-semibold text-primary">
              {lines.length} product{lines.length === 1 ? '' : 's'} · {cases} cases
            </p>
            <p className="text-xs text-muted-foreground">Tap to review cart & quantities</p>
          </button>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex lg:flex-col lg:gap-3">
        <div className="flex gap-2">
          {scanRow}
          {desktopBrowsePopover}
        </div>
        {desktopTable}
        {totals}
      </div>

      {sortedWholesalers.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          Add wholesalers on the Wholesalers page before creating orders.
        </p>
      )}

      <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
        <Store className="h-3.5 w-3.5" />
        Warehouse letter on the order sheet comes from each line’s warehouse (B/G/Y/A).
      </div>
    </div>
  )
}
