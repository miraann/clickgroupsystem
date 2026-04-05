'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Store, UtensilsCrossed, Coffee, Truck, ShoppingBag,
  Wine, CalendarDays, Monitor, SlidersHorizontal, Settings2,
  Receipt, BarChart3, Database, Users, UserCircle,
  CreditCard, ChefHat, ArrowLeft, ChevronRight,
  DollarSign, Star, Ban, ActivitySquare,
} from 'lucide-react'

const NAV_GROUPS = [
  {
    label: 'General',
    items: [
      { label: 'Restaurant Info', href: '/dashboard/settings/restaurant-info', icon: Store },
      { label: 'Preference', href: '/dashboard/settings/preference', icon: SlidersHorizontal },
      { label: 'Device', href: '/dashboard/settings/device', icon: Monitor },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Menu', href: '/dashboard/settings/menu', icon: UtensilsCrossed },
      { label: 'Dine In', href: '/dashboard/settings/dine-in', icon: Coffee },
      { label: 'Delivery', href: '/dashboard/settings/delivery', icon: Truck },
      { label: 'Takeout', href: '/dashboard/settings/takeout', icon: ShoppingBag },
      { label: 'Bar', href: '/dashboard/settings/bar', icon: Wine },
      { label: 'Reservation', href: '/dashboard/settings/reservation', icon: CalendarDays },
      { label: 'KDS Monitor', href: '/dashboard/settings/kds-monitor', icon: ActivitySquare },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Sales', href: '/dashboard/settings/sales', icon: ActivitySquare },
      { label: 'Expense', href: '/dashboard/settings/expense', icon: DollarSign },
      { label: 'Pay Later', href: '/dashboard/settings/pay-later', icon: CreditCard },
      { label: 'Receipt', href: '/dashboard/settings/receipt', icon: Receipt },
      { label: 'Void Items', href: '/dashboard/settings/void-items', icon: Ban },
      { label: 'Report', href: '/dashboard/settings/report', icon: BarChart3 },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Users', href: '/dashboard/settings/users', icon: Users },
      { label: 'Member', href: '/dashboard/settings/member', icon: Star },
      { label: 'Customer', href: '/dashboard/settings/customer', icon: UserCircle },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Advanced', href: '/dashboard/settings/advanced', icon: Settings2 },
      { label: 'Database', href: '/dashboard/settings/database', icon: Database },
    ],
  },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const currentItem = NAV_GROUPS.flatMap(g => g.items).find(i => i.href === pathname)

  return (
    <div className="min-h-screen bg-[#060810] flex flex-col">

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#060810]/80 backdrop-blur-2xl">
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-white/30">
              <span>Settings</span>
              {currentItem && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-white/60">{currentItem.label}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r border-white/8 bg-black/20 backdrop-blur-xl overflow-y-auto">
          <nav className="p-3 space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-3 mb-1.5 text-[10px] font-bold text-white/25 uppercase tracking-widest">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                          active
                            ? 'bg-amber-500/15 text-white border border-amber-500/25'
                            : 'text-white/45 hover:text-white/80 hover:bg-white/5'
                        )}
                      >
                        <item.icon
                          size={16}
                          className={cn(
                            'shrink-0 transition-colors',
                            active ? 'text-amber-400' : 'text-white/30 group-hover:text-white/60'
                          )}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {active && <ChevronRight className="w-3 h-3 text-amber-400/50 shrink-0" />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
