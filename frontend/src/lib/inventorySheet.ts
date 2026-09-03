import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { InventoryItem, Warehouse } from '@/types/inventory'
import { getTotalQuantity, formatCurrency } from './utils'

export function downloadInventorySheet(
  items: InventoryItem[],
  warehouse?: Warehouse,
  emptyMode = false
) {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(18)
  doc.setTextColor(20, 130, 110)
  doc.text('MR FOG — Inventory', 14, 18)

  doc.setFontSize(9)
  doc.setTextColor(0)
  if (warehouse) {
    doc.text(`Warehouse: ${warehouse.name}`, 14, 26)
  } else {
    doc.text('All Warehouses', 14, 26)
  }

  const filteredItems = emptyMode
    ? items.filter((i) => getTotalQuantity(i) === 0)
    : items

  const rows = filteredItems.map((item) => {
    const qty = warehouse
      ? (item.stock.find((s) => s.warehouseId === warehouse.id)?.quantity ?? 0)
      : getTotalQuantity(item)
    return [item.sku, item.name, item.category, qty.toString(), formatCurrency(item.price)]
  })

  autoTable(doc, {
    startY: 32,
    head: [['SKU', 'Name', 'Category', 'Qty', 'Price']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [20, 130, 110] },
  })

  doc.save('inventory.pdf')
}
