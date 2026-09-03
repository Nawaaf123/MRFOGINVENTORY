import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Order, Wholesaler } from '@/types/inventory'
import { formatCurrency, formatDate } from './utils'

export function downloadInvoice(order: Order, wholesaler?: Wholesaler) {
  const doc = new jsPDF()

  doc.setFontSize(20)
  doc.setTextColor(20, 130, 110)
  doc.text('MR FOG', 14, 22)

  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text('INVOICE', 14, 30)

  doc.setFontSize(9)
  doc.setTextColor(0)
  doc.text(`Invoice #: ${order.id.slice(0, 8).toUpperCase()}`, 14, 40)
  doc.text(`Date: ${formatDate(order.date)}`, 14, 46)
  doc.text(`Shop: ${order.shopName}`, 14, 52)

  if (wholesaler) {
    doc.text(`Bill To: ${wholesaler.name}`, 110, 40)
    doc.text(`Contact: ${wholesaler.contactPerson}`, 110, 46)
    doc.text(`Phone: ${wholesaler.phone}`, 110, 52)
  }

  const rows = order.items.map((item) => [
    item.itemName,
    item.itemSku,
    item.warehouseName,
    item.quantity.toString(),
    formatCurrency(item.unitPrice),
    formatCurrency(item.quantity * item.unitPrice),
  ])

  autoTable(doc, {
    startY: 62,
    head: [['Product', 'SKU', 'Warehouse', 'Qty', 'Unit Price', 'Total']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [20, 130, 110] },
  })

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 100
  const subtotal = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const total = subtotal + order.shippingFee

  doc.setFontSize(9)
  doc.text(`Subtotal: ${formatCurrency(subtotal)}`, 140, finalY + 10)
  doc.text(`Shipping: ${formatCurrency(order.shippingFee)}`, 140, finalY + 16)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total: ${formatCurrency(total)}`, 140, finalY + 24)

  doc.save(`invoice-${order.id.slice(0, 8)}.pdf`)
}
