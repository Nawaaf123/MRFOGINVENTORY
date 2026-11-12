import jsPDF from 'jspdf'
import type { Order, InventoryItem } from '@/types/inventory'
import { format } from 'date-fns'

type SheetLine = {
  sku: string
  name: string
  quantity: number
  section: string
}

function sectionLabel(item: InventoryItem | undefined, fallbackSku: string): string {
  if (!item) return 'OTHER'
  const sub = (item.subCategory || '').trim()
  if (sub) return sub.toUpperCase()
  const cat = (item.category || '').trim()
  if (cat) return cat.toUpperCase()
  return fallbackSku.split('-')[0] || 'OTHER'
}

function buildLines(order: Order, catalog: InventoryItem[]): SheetLine[] {
  const byId = new Map(catalog.map((i) => [i.id, i]))
  return order.items
    .filter((i) => i.quantity > 0)
    .map((i) => {
      const item = byId.get(i.itemId)
      return {
        sku: i.itemSku,
        name: i.itemName,
        quantity: i.quantity,
        section: sectionLabel(item, i.itemSku),
      }
    })
}

function drawCheckbox(doc: jsPDF, x: number, y: number, label: string, checked = false) {
  const size = 3.2
  doc.setDrawColor(40)
  doc.setFillColor(255, 255, 255)
  doc.setLineWidth(0.35)
  doc.rect(x, y - size + 0.6, size, size, 'FD')
  if (checked) {
    doc.setTextColor(20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text('X', x + 0.7, y)
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(20)
  doc.text(label, x + size + 1.8, y)
}

function orderDateLabel(date: Date | string | null | undefined): string {
  if (date == null || date === '') return format(new Date(), 'M/d/yy')
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return format(new Date(), 'M/d/yy')
  return format(d, 'M/d/yy')
}

function drawWaveLogo(doc: jsPDF, cx: number, y: number) {
  doc.setDrawColor(200, 30, 45)
  doc.setLineWidth(1.4)
  const w = 18
  doc.line(cx - w, y, cx - w / 2, y - 4)
  doc.line(cx - w / 2, y - 4, cx, y + 1)
  doc.line(cx, y + 1, cx + w / 2, y - 3.5)
  doc.line(cx + w / 2, y - 3.5, cx + w, y + 0.5)
  doc.setLineWidth(0.9)
  doc.line(cx - w + 1, y + 2.2, cx - w / 2 + 1, y - 1.5)
  doc.line(cx - w / 2 + 1, y - 1.5, cx + 1, y + 3)
  doc.line(cx + 1, y + 3, cx + w / 2 + 1, y - 0.8)
  doc.line(cx + w / 2 + 1, y - 0.8, cx + w - 1, y + 2.5)
}

function ensureSpace(doc: jsPDF, y: number, needed: number, marginBottom = 18): number {
  const pageH = doc.internal.pageSize.getHeight()
  if (y + needed <= pageH - marginBottom) return y
  doc.addPage()
  return 16
}

function drawSectionHeader(doc: jsPDF, title: string, y: number, left: number, right: number): number {
  y = ensureSpace(doc, y, 10)
  const h = 7
  doc.setFillColor(180, 180, 180)
  doc.rect(left, y, right - left, h, 'F')
  doc.setDrawColor(90)
  doc.setLineWidth(0.25)
  doc.rect(left, y, right - left, h)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(20)
  doc.text(title, left + 2, y + 4.8)
  return y + h
}

function drawSectionTotal(doc: jsPDF, total: number, y: number, left: number, right: number): number {
  y = ensureSpace(doc, y, 9)
  const h = 6.5
  doc.setFillColor(180, 180, 180)
  doc.rect(left, y, right - left, h, 'F')
  doc.setDrawColor(90)
  doc.setLineWidth(0.25)
  doc.rect(left, y, right - left, h)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(20)
  doc.text(`TOTAL CASES: ${total}`, left + 2, y + 4.5)
  return y + h + 3
}

/** One product cell: SKU | name | yellow qty */
function drawProductCell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  line: SheetLine | null
) {
  const skuW = 28
  const qtyW = 14
  const nameW = w - skuW - qtyW

  doc.setDrawColor(90)
  doc.setLineWidth(0.25)
  doc.rect(x, y, skuW, h)
  doc.rect(x + skuW, y, nameW, h)
  doc.setFillColor(255, 250, 200)
  doc.rect(x + skuW + nameW, y, qtyW, h, 'FD')

  if (!line) return

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(20)
  doc.text(line.sku, x + 1.2, y + h / 2 + 1.1, { maxWidth: skuW - 2 })

  const name = doc.splitTextToSize(line.name, nameW - 2.4)
  doc.text(name.slice(0, 2), x + skuW + 1.2, y + (name.length > 1 ? 3.2 : h / 2 + 1.1))

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  const qty = String(line.quantity)
  const qw = doc.getTextWidth(qty)
  doc.text(qty, x + skuW + nameW + (qtyW - qw) / 2, y + h / 2 + 1.2)
}

function buildDoc(order: Order, catalog: InventoryItem[]): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const left = 12
  const right = pageW - 12
  const gap = 2
  const colW = (right - left - gap) / 2
  const rowH = 7.2

  const lines = buildLines(order, catalog)
  const sections = new Map<string, SheetLine[]>()
  for (const line of lines) {
    const list = sections.get(line.section) ?? []
    list.push(line)
    sections.set(line.section, list)
  }

  const sectionNames = [...sections.keys()].sort((a, b) => a.localeCompare(b))

  // Header
  drawWaveLogo(doc, pageW / 2, 12)
  let y = 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(20)
  doc.text(`Company Name: ${order.shopName}`, left, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(20)
  doc.text(`Date: ${orderDateLabel(order.date)}`, left, y)
  y += 8

  drawCheckbox(doc, left, y, 'Shipping')
  drawCheckbox(doc, left + 32, y, 'Delivery')
  drawCheckbox(doc, left + 64, y, 'Pickup')
  y += 8

  let grandTotal = 0

  for (const section of sectionNames) {
    const items = sections.get(section) ?? []
    items.sort((a, b) => a.sku.localeCompare(b.sku))
    const sectionTotal = items.reduce((s, i) => s + i.quantity, 0)
    grandTotal += sectionTotal

    y = drawSectionHeader(doc, section, y, left, right)

    for (let i = 0; i < items.length; i += 2) {
      y = ensureSpace(doc, y, rowH + 1)
      drawProductCell(doc, left, y, colW, rowH, items[i])
      if (items[i + 1]) {
        drawProductCell(doc, left + colW + gap, y, colW, rowH, items[i + 1])
      }
      y += rowH
    }

    y = drawSectionTotal(doc, sectionTotal, y, left, right)
  }

  y = ensureSpace(doc, y, 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(20)
  doc.text(`Total Cases: ${grandTotal}`, left, y + 4)
  y += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Checked by: ___________________________', left, y)
  doc.text('Date: ______________', left + 95, y)

  return doc
}

export function downloadPickSheet(order: Order, items: InventoryItem[]) {
  const doc = buildDoc(order, items)
  const safeName = order.shopName.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'order'
  doc.save(`order-sheet-${safeName}-${order.id.slice(0, 8)}.pdf`)
}

export function previewPickSheet(order: Order, items: InventoryItem[]): string {
  const doc = buildDoc(order, items)
  const blob = doc.output('blob')
  return URL.createObjectURL(blob)
}
