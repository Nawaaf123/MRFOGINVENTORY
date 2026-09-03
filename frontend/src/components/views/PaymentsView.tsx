import { useState } from 'react'
import type { useInventory } from '@/hooks/useInventory'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import type { Order, Payment } from '@/types/inventory'

type Inv = ReturnType<typeof useInventory>
interface Props { inv: Inv }

function getOrderTotal(order: Order): number {
  return order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) + order.shippingFee
}

export function PaymentsView({ inv }: Props) {
  const { orders, payments, wholesalers, addPayment, loading } = inv
  const [amounts, setAmounts] = useState<Record<string, string>>({})

  const completedOrders = orders.filter((o) => o.status !== 'cancelled')

  const paidForOrder = (orderId: string) =>
    payments.filter((p) => p.orderId === orderId).reduce((s, p) => s + p.amount, 0)

  const handleAddPayment = async (orderId: string) => {
    const amount = parseFloat(amounts[orderId] || '0')
    if (!amount || isNaN(amount)) {
      toast.error('Enter a valid amount')
      return
    }
    try {
      await addPayment({
        orderId,
        amount,
        paymentDate: new Date(),
        method: 'cash',
        note: '',
      })
      setAmounts((prev) => ({ ...prev, [orderId]: '' }))
      toast.success('Payment recorded')
    } catch {
      toast.error('Failed to record payment')
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  // Group by shop
  const byShop: Record<string, { orders: Order[]; payments: Payment[] }> = {}
  completedOrders.forEach((o) => {
    if (!byShop[o.shopName]) byShop[o.shopName] = { orders: [], payments: [] }
    byShop[o.shopName].orders.push(o)
  })
  payments.forEach((p) => {
    const order = completedOrders.find((o) => o.id === p.orderId)
    if (order) {
      if (!byShop[order.shopName]) byShop[order.shopName] = { orders: [], payments: [] }
      byShop[order.shopName].payments.push(p)
    }
  })

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">Track invoices and payments by shop</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {Object.entries(byShop).map(([shop, data]) => {
          const totalOwed = data.orders.reduce((s, o) => s + getOrderTotal(o), 0)
          const totalPaid = data.payments.reduce((s, p) => s + p.amount, 0)
          const balance = totalOwed - totalPaid
          const status = balance <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'

          const wholesaler = wholesalers.find((w) =>
            w.name.toLowerCase() === shop.toLowerCase()
          )

          return (
            <Card key={shop}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex justify-between items-center">
                  <span>{shop}</span>
                  <Badge
                    variant={status === 'paid' ? 'default' : status === 'partial' ? 'secondary' : 'destructive'}
                  >
                    {status}
                  </Badge>
                </CardTitle>
                {wholesaler && (
                  <p className="text-xs text-muted-foreground">{wholesaler.phone}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Owed</p>
                    <p className="font-semibold">{formatCurrency(totalOwed)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Paid</p>
                    <p className="font-semibold text-green-600">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Balance</p>
                    <p className={`font-semibold ${balance > 0 ? 'text-destructive' : 'text-green-600'}`}>
                      {formatCurrency(balance)}
                    </p>
                  </div>
                </div>

                {balance > 0 && (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={amounts[data.orders[0]?.id] || ''}
                      onChange={(e) =>
                        setAmounts((prev) => ({ ...prev, [data.orders[0]?.id]: e.target.value }))
                      }
                      className="h-8 text-sm"
                    />
                    <Button size="sm" onClick={() => handleAddPayment(data.orders[0]?.id)}>
                      Pay
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
        {Object.keys(byShop).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No orders to invoice</div>
        )}
      </div>
    </div>
  )
}
