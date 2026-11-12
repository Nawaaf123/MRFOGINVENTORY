import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { ExternalLink, Trash2, Plus, Search } from 'lucide-react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ProductPicker, type PickedProductLine } from '@/components/ProductPicker'
import { openBolDocument } from '@/lib/bolDocs'
import { toast } from 'sonner'
import type { InventoryTransaction } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

type DateFilter = 'all' | '7' | '30' | '90'

export function ReceivingsView({ inv }: Props) {
  const { transactions, allItems, warehouses, receiveStockBatch, deleteReceiving, loading } = inv
  const [_deleting, setDeleting] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [bolNumber, setBolNumber] = useState('')
  const [lines, setLines] = useState<PickedProductLine[]>([])
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [warehouses]
  )

  const receivings = useMemo(() => {
    const q = search.trim().toLowerCase()
    const since =
      dateFilter === 'all' ? null : subDays(new Date(), Number(dateFilter))

    return transactions.filter((t) => {
      if (!['receive', 'opening_balance'].includes(t.type)) return false
      if (warehouseFilter !== 'all' && t.warehouseId !== warehouseFilter) return false
      if (since && new Date(t.date) < since) return false
      if (!q) return true
      return (
        t.itemName.toLowerCase().includes(q) ||
        t.itemSku.toLowerCase().includes(q) ||
        t.bolNumber.toLowerCase().includes(q) ||
        t.warehouseName.toLowerCase().includes(q)
      )
    })
  }, [transactions, search, warehouseFilter, dateFilter])

  const grouped = receivings.reduce<Record<string, InventoryTransaction[]>>((acc, t) => {
    const key = `${t.bolNumber}__${format(new Date(t.date), 'yyyy-MM-dd')}`
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  const openDialog = () => {
    setWarehouseId(sortedWarehouses[0]?.id || '')
    setBolNumber('')
    setLines([])
    setOpen(true)
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
      await receiveStockBatch({
        warehouseId,
        bolNumber: bolNumber.trim(),
        items: validLines.map((line) => ({
          itemId: line.itemId,
          quantity: Number(line.quantity),
        })),
      })
      toast.success(`Received ${validLines.length} item${validLines.length > 1 ? 's' : ''}`)
      setOpen(false)
      setLines([])
      setBolNumber('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to receive stock')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Receivings</h1>
            <p className="text-muted-foreground text-sm mt-1">Stock received, grouped by BOL</p>
          </div>
          <Button size="sm" onClick={openDialog}>
            <Plus className="h-4 w-4 mr-1" />Receive Stock
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search BOL, item, or warehouse..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {sortedWarehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {transactions.some((t) => ['receive', 'opening_balance'].includes(t.type))
              ? 'No receivings match these filters'
              : 'No receivings found'}
          </div>
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
            <ProductPicker items={allItems} lines={lines} onChange={setLines} />
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
