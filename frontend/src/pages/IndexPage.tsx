import { useState } from 'react'
import { Sidebar, type ViewName } from '@/components/layout/Sidebar'
import { useInventory } from '@/hooks/useInventory'

import { InventoryView } from '@/components/views/InventoryView'
import { OrdersView } from '@/components/views/OrdersView'
import { ReceivingsView } from '@/components/views/ReceivingsView'
import { StockSummaryView } from '@/components/views/StockSummaryView'
import { PaymentsView } from '@/components/views/PaymentsView'
import { PaymentHistoryView } from '@/components/views/PaymentHistoryView'
import { WholesalersView } from '@/components/views/WholesalersView'
import { InventoryHistoryView } from '@/components/views/InventoryHistoryView'
import { WarehousesView } from '@/components/views/WarehousesView'
import { ReportsView } from '@/components/views/ReportsView'
import { UsersView } from '@/components/views/UsersView'
import { DriftMonitorView } from '@/components/views/DriftMonitorView'

export function IndexPage() {
  const [activeView, setActiveView] = useState<ViewName>('inventory')
  const inv = useInventory()

  const renderView = () => {
    switch (activeView) {
      case 'inventory': return <InventoryView inv={inv} />
      case 'orders': return <OrdersView inv={inv} />
      case 'receivings': return <ReceivingsView inv={inv} />
      case 'stock-summary': return <StockSummaryView inv={inv} />
      case 'payments': return <PaymentsView inv={inv} />
      case 'payment-history': return <PaymentHistoryView inv={inv} />
      case 'wholesalers': return <WholesalersView inv={inv} />
      case 'inventory-history': return <InventoryHistoryView inv={inv} />
      case 'warehouses': return <WarehousesView inv={inv} />
      case 'reports': return <ReportsView inv={inv} />
      case 'users': return <UsersView />
      case 'drift-monitor': return <DriftMonitorView inv={inv} />
      default: return null
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-hidden flex flex-col">
        {renderView()}
      </main>
    </div>
  )
}
