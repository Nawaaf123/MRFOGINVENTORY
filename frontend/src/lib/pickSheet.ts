import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Order, InventoryItem } from '@/types/inventory'
import { formatDate } from './utils'

function buildDoc(order: Order, _items: InventoryItem[]): jsPDF {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.setTextColor(20, 130, 110)
  doc.text('MR FOG — Pick Sheet', 14, 20)

  doc.setFontSize(9)
  doc.setTextColor(0)
  doc.text(`Order #: ${order.id.slice(0, 8).toUpperCase()}`, 14, 30)
  doc.text(`Shop: ${order.shopName}`, 14, 36)
  doc.text(`Date: ${formatDate(order.date)}`, 14, 42)

  const rows = order.items.map((item) => [
    item.itemName,
    item.itemSku,
    item.warehouseName,
    item.quantity.toString(),
    '',
  ])

  autoTable(doc, {
    startY: 50,
    head: [['Product', 'SKU', 'Warehouse', 'Qty', 'Picked ✓']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [20, 130, 110] },
  })

  return doc
}

export function downloadPickSheet(order: Order, items: InventoryItem[]) {
  const doc = buildDoc(order, items)
  doc.save(`pick-sheet-${order.id.slice(0, 8)}.pdf`)
}

export function previewPickSheet(order: Order, items: InventoryItem[]): string {
  const doc = buildDoc(order, items)
  const blob = doc.output('blob')
  return URL.createObjectURL(blob)
}
