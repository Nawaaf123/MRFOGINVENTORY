import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { InventoryItem } from '@/types/inventory'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTotalQuantity(item: InventoryItem): number {
  return item.stock.reduce((sum, s) => sum + s.quantity, 0)
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
