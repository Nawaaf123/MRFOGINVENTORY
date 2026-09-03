import { useState } from 'react'
import {
  Package,
  ShoppingCart,
  PackagePlus,
  BarChart3,
  CreditCard,
  History,
  Users,
  Warehouse,
  TrendingUp,
  UserCog,
  AlertTriangle,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

export type ViewName =
  | 'inventory'
  | 'orders'
  | 'receivings'
  | 'stock-summary'
  | 'payments'
  | 'payment-history'
  | 'wholesalers'
  | 'inventory-history'
  | 'warehouses'
  | 'reports'
  | 'users'
  | 'drift-monitor'

interface NavItem {
  id: ViewName
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'receivings', label: 'Receivings', icon: PackagePlus },
  { id: 'stock-summary', label: 'Stock Summary', icon: BarChart3 },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'payment-history', label: 'Payment History', icon: History },
  { id: 'wholesalers', label: 'Wholesalers', icon: Users },
  { id: 'inventory-history', label: 'Inventory History', icon: History },
  { id: 'warehouses', label: 'Warehouses', icon: Warehouse },
  { id: 'reports', label: 'Reports', icon: TrendingUp },
  { id: 'users', label: 'Users', icon: UserCog },
  { id: 'drift-monitor', label: 'Drift Monitor', icon: AlertTriangle },
]

interface SidebarProps {
  activeView: ViewName
  onViewChange: (view: ViewName) => void
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { signOut, user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleNav = (view: ViewName) => {
    onViewChange(view)
    setMobileOpen(false)
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          MF
        </div>
        <div>
          <p className="font-bold text-sm tracking-wide text-sidebar-foreground">MR FOG</p>
          <p className="text-xs text-sidebar-foreground/60">Inventory System</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mb-0.5',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        {user && (
          <p className="text-xs text-sidebar-foreground/60 mb-3 truncate">{user.email}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          className="absolute top-4 right-4 z-10 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent />
      </aside>
    </>
  )
}
