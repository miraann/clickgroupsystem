'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  Table2,
  BarChart3,
  Settings,
  LogOut,
  ChefHat,
  ChevronRight,
  Bell,
  Package,
  MonitorCheck,
} from 'lucide-react'

const navItems = [
  { label: 'Overview',    icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Orders',      icon: ShoppingBag,     href: '/dashboard/orders' },
  { label: 'Kitchen',     icon: MonitorCheck,    href: '/dashboard/kds' },
  { label: 'Menu',        icon: Package,         href: '/dashboard/menu' },
  { label: 'Tables',      icon: Table2,          href: '/dashboard/tables' },
  { label: 'Staff',       icon: Users,           href: '/dashboard/staff' },
  { label: 'Reports',     icon: BarChart3,       href: '/dashboard/reports' },
  { label: 'Notifications', icon: Bell,          href: '/dashboard/notifications' },
  { label: 'Settings',    icon: Settings,        href: '/dashboard/settings' },
]

interface RestaurantSidebarProps {
  restaurantName?: string
  userRole?: string
}

export function RestaurantSidebar({ restaurantName = 'My Restaurant', userRole = 'Owner' }: RestaurantSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl border-r border-white/10" />

      <div className="relative flex flex-col h-full p-4">
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-4 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{restaurantName}</p>
            <p className="text-xs text-amber-400 font-medium">Restaurant Panel</p>
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
                    ? 'bg-amber-500/20 text-white border border-amber-500/30 shadow-lg shadow-amber-500/10'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon className={cn(
                  'transition-colors',
                  active ? 'text-amber-400' : 'text-white/40 group-hover:text-white/70'
                )} size={18} />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 text-amber-400/60" />}
              </Link>
            )
          })}
        </nav>

        {/* Bottom user info */}
        <div className="border-t border-white/10 pt-4 mt-4">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white">
              R
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">Restaurant Owner</p>
              <p className="text-xs text-white/40 truncate">{userRole}</p>
            </div>
            <LogOut className="w-4 h-4 text-white/30 group-hover:text-rose-400 transition-colors" />
          </div>
        </div>
      </div>
    </aside>
  )
}
