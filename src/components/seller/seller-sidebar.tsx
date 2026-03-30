'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Store,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Zap,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/seller' },
  { label: 'Restaurants', icon: Store, href: '/seller/restaurants' },
  { label: 'Subscriptions', icon: CreditCard, href: '/seller/subscriptions' },
  { label: 'Analytics', icon: BarChart3, href: '/seller/analytics' },
  { label: 'Users', icon: Users, href: '/seller/users' },
  { label: 'Settings', icon: Settings, href: '/seller/settings' },
]

export function SellerSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 z-50 flex flex-col">
      {/* Glass background */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl border-r border-white/10" />

      <div className="relative flex flex-col h-full p-4">
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-4 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">ClickGroup</p>
            <p className="text-xs text-indigo-400 font-medium">Seller Console</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                  active
                    ? 'bg-indigo-500/20 text-white border border-indigo-500/30 shadow-lg shadow-indigo-500/10'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon className={cn(
                  'w-4.5 h-4.5 transition-colors',
                  active ? 'text-indigo-400' : 'text-white/40 group-hover:text-white/70'
                )} size={18} />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 text-indigo-400/60" />}
              </Link>
            )
          })}
        </nav>

        {/* Bottom user info */}
        <div className="border-t border-white/10 pt-4 mt-4">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-xs font-bold text-white">
              S
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">Seller Admin</p>
              <p className="text-xs text-white/40 truncate">System Owner</p>
            </div>
            <LogOut className="w-4 h-4 text-white/30 group-hover:text-rose-400 transition-colors" />
          </div>
        </div>
      </div>
    </aside>
  )
}
