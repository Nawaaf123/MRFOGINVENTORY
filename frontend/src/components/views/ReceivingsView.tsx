import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ExternalLink, Trash2, Plus, Search, X } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { openBolDocument } from '@/lib/bolDocs'
import { toast } from 'sonner'
import type { InventoryTransaction } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

interface ReceiveLine {
  itemId: string
  itemName: string
  itemSku: string
  quantity: string
}

export function ReceivingsView({ inv }: Props) {
  const { transactions, allItems, warehouses, receiveStock, deleteReceiving, loading } = inv
  const [_deleting, setDeleting] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [bolNumber, setBolNumber] = useState('')
  const [lines, setLines] = useState<ReceiveLine[]>([])

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [warehouses]
  )

  const receivings = transactions.filter((t) =>
    ['receive', 'opening_balance'].includes(t.type)
  )

  const grouped = receivings.reduce<Record<string, InventoryTransaction[]>>((acc, t) => {
    const key = `${t.bolNumber}__${format(new Date(t.date), 'yyyy-MM-dd')}`
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return allItems.slice(0, 40)
    return allItems
      .filter((item) => {
        const hay = [item.name, item.sku, item.category, item.subCategory]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 50)
  }, [allItems, productSearch])

  const openDialog = () => {
    setProductSearch('')
    setWarehouseId(sortedWarehouses[0]?.id || '')
    setBolNumber('')
    setLines([])
    setOpen(true)
  }

  const addProductLine = (itemId: string) => {
    const item = allItems.find((i) => i.id === itemId)
    if (!item) return
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === itemId)
      if (existing) {
        return prev.map((l) =>
          l.itemId === itemId
            ? { ...l, quantity: String(Math.max(1, Number(l.quantity || 0) + 1)) }
            : l
        )
      }
      return [
        ...prev,
        { itemId: item.id, itemName: item.name, itemSku: item.sku, quantity: '1' },
      ]
    })
    setProductSearch('')
  }

  const updateLineQty = (itemId: string, quantity: string) => {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, quantity } : l)))
  }

  const removeLine = (itemId: string) => {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId))
  }

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
    const validLines = lines.filter((l) => Number(l.quantity) > 0)
    if (!warehouseId || !bolNumber.trim() || validLines.length === 0) {
      toast.error('Warehouse, BOL, and at least one product quantity are required')
      return
    }
    setSaving(true)
    try {
      for (const line of validLines) {
        await receiveStock({
          itemId: line.itemId,
          warehouseId,
          quantity: Number(line.quantity),
          bolNumber: bolNumber.trim(),
        })
      }
      toast.success(`Received ${validLines.length} item${validLines.length > 1 ? 's' : ''}`)
      setOpen(false)
      setLines([])
      setProductSearch('')
      setBolNumber('')
    } catch {
      toast.error('Failed to receive stock')
    } finally {
      setSaving(false)
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
          <Button size="sm" onClick={openDialog}>
            <Plus className="h-4 w-4 mr-1" />Receive Stock
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No receivings found</div>
        )}
        {Object.entries(grouped).map(([key, txs]) => {
          const [bol, date] = key.split('__')
          const firstTx = txs[0]
          return (
            <div key={key}>
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="outline" className="font-mono">{bol}</Badge>
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Warehouse</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Warehouse" /></SelectTrigger>
                  <SelectContent>
                    {sortedWarehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>BOL number</Label>
                <Input
                  value={bolNumber}
                  className="mt-1"
                  onChange={(e) => setBolNumber(e.target.value)}
                  placeholder="BOL-123"
                />
              </div>
            </div>

            <div>
              <Label>Search products</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search by name, SKU, category..."
                  className="pl-9"
                />
              </div>
              <ScrollArea className="mt-2 h-44 rounded-md border">
                <div className="p-1">
                  {filteredProducts.length === 0 && (
                    <p className="text-sm text-muted-foreground p-3 text-center">No products found</p>
                  )}
                  {filteredProducts.map((item) => {
                    const selected = lines.some((l) => l.itemId === item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addProductLine(item.id)}
                        className="w-full text-left rounded-md px-3 py-2 hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {item.sku}
                              {item.category ? ` · ${item.category}` : ''}
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
              {!productSearch.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  Type to search all products. Showing first matches.
                </p>
              )}
            </div>

            {lines.length > 0 && (
              <div className="space-y-2">
                <Label>Quantities to receive ({lines.length})</Label>
                {lines.map((line) => (
                  <div key={line.itemId} className="flex items-center gap-2 rounded-md border p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{line.itemName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{line.itemSku}</p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLineQty(line.itemId, e.target.value)}
                      className="w-24 h-8"
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
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleReceive} disabled={saving || lines.length === 0}>
              {saving ? 'Receiving...' : 'Receive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
