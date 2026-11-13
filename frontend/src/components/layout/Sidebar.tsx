import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  const sidebarInner = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border pr-14">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          MF
        </div>
        <div>
          <p className="font-bold text-sm tracking-wide text-sidebar-foreground">Mr. Fog</p>
          <p className="text-xs text-sidebar-foreground/60">Inventory System</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain py-4 px-3" aria-label="Main">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-3 min-h-11 text-sm font-medium transition-colors mb-0.5',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
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
          className="w-full justify-start min-h-11 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  )

  const mobileUi =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              data-mobile-nav-toggle="true"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              className="lg:hidden fixed top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-[100] flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md touch-manipulation"
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {mobileOpen && (
              <div
                className="lg:hidden fixed inset-0 z-[90] bg-black/60"
                aria-hidden="true"
                onClick={() => setMobileOpen(false)}
              />
            )}

            <aside
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal={mobileOpen}
              aria-label="Navigation"
              aria-hidden={!mobileOpen}
              className={cn(
                'lg:hidden fixed inset-y-0 left-0 z-[95] w-[min(18rem,85vw)] bg-sidebar shadow-xl transition-transform duration-300 ease-out',
                mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
              )}
            >
              {sidebarInner}
            </aside>
          </>,
          document.body
        )
      : null

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 h-dvh sticky top-0 z-30">
        {sidebarInner}
      </aside>
      {mobileUi}
    </>
  )
}
