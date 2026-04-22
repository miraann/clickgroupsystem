'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Store, UtensilsCrossed, Coffee, Truck, ShoppingBag,
  Wine, CalendarDays, Monitor, SlidersHorizontal, Settings2,
  Receipt, BarChart3, Database, Users, UserCircle,
  CreditCard, ChefHat, ArrowLeft, ChevronRight, Menu as MenuIcon, X as XIcon,
  DollarSign, Star, Ban, ActivitySquare, Package, MessageCircle,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { TranslationKey } from '@/lib/i18n/translations'
import type { LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSettingsModuleKey, isModuleEnabled } from '@/lib/modules'
import { UpgradeWall, moduleLabel } from '@/components/ModuleGate'
import { usePermissions } from '@/lib/permissions/PermissionsContext'

let _modCache: { restaurantId: string; modules: Record<string, boolean>; at: number } | null = null
const CACHE_TTL = 30_000

interface NavItem  { labelKey: TranslationKey; href: string; icon: LucideIcon; permKey?: string; ownerOnly?: boolean }
interface NavGroup { labelKey: TranslationKey; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'sg_general',
    items: [
      { labelKey: 'si_restaurant_info', href: '/dashboard/settings/restaurant-info', icon: Store,           permKey: 'settings.restaurant_info' },
      { labelKey: 'si_preference',      href: '/dashboard/settings/preference',      icon: SlidersHorizontal },
      { labelKey: 'si_device',          href: '/dashboard/settings/device',          icon: Monitor,         permKey: 'settings.device' },
    ],
  },
  {
    labelKey: 'sg_operations',
    items: [
      { labelKey: 'si_menu',        href: '/dashboard/settings/menu',        icon: UtensilsCrossed, permKey: 'menu' },
      { labelKey: 'si_dine_in',     href: '/dashboard/settings/dine-in',     icon: Coffee,          permKey: 'settings.dine_in' },
      { labelKey: 'si_delivery',    href: '/dashboard/settings/delivery',    icon: Truck,           permKey: 'settings.delivery' },
      { labelKey: 'si_takeout',     href: '/dashboard/settings/takeout',     icon: ShoppingBag },
      { labelKey: 'si_coffee_bar',  href: '/dashboard/settings/bar',         icon: Wine },
      { labelKey: 'si_reservation', href: '/dashboard/settings/reservation', icon: CalendarDays },
      { labelKey: 'si_kds_monitor', href: '/dashboard/settings/kds-monitor', icon: ActivitySquare,  permKey: 'settings.kds_monitor' },
      { labelKey: 'si_inventory',   href: '/dashboard/settings/inventory',   icon: Package,         permKey: 'settings.inventory' },
    ],
  },
  {
    labelKey: 'sg_finance',
    items: [
      { labelKey: 'si_sales',      href: '/dashboard/settings/sales',      icon: ActivitySquare, permKey: 'finance.sales' },
      { labelKey: 'si_expense',    href: '/dashboard/settings/expense',    icon: DollarSign,     permKey: 'finance.expense' },
      { labelKey: 'si_pay_later',  href: '/dashboard/settings/pay-later',  icon: CreditCard,     permKey: 'finance.pay_later' },
      { labelKey: 'si_receipt',    href: '/dashboard/settings/receipt',    icon: Receipt,        permKey: 'finance.receipt' },
      { labelKey: 'si_void_items', href: '/dashboard/settings/void-items', icon: Ban },
      { labelKey: 'si_report',     href: '/dashboard/settings/report',     icon: BarChart3,      permKey: 'finance.report' },
    ],
  },
  {
    labelKey: 'sg_people',
    items: [
      { labelKey: 'si_users',    href: '/dashboard/settings/users',    icon: Users,       permKey: 'settings.users' },
      { labelKey: 'si_member',   href: '/dashboard/settings/member',   icon: Star,        permKey: 'settings.member' },
      { labelKey: 'si_customer', href: '/dashboard/settings/customer', icon: UserCircle,  permKey: 'settings.customer' },
    ],
  },
  {
    labelKey: 'sg_system',
    items: [
      { labelKey: 'si_advanced', href: '/dashboard/settings/advanced', icon: Settings2, ownerOnly: true },
      { labelKey: 'si_database', href: '/dashboard/settings/database', icon: Database,  ownerOnly: true },
    ],
  },
  {
    labelKey: 'sg_marketing',
    items: [
      { labelKey: 'si_whatsapp', href: '/dashboard/settings/whatsapp', icon: MessageCircle },
    ],
  },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { t, isRTL } = useLanguage()
  const supabase = createClient()

  const currentItem = NAV_GROUPS.flatMap(g => g.items).find(i => i.href === pathname)

  const { can, isOwner } = usePermissions()
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null)
  const [activeModuleKey, setActiveModuleKey] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const key = getSettingsModuleKey(pathname)
    setActiveModuleKey(key)
    if (!key) { setModuleEnabled(null); return }

    const restaurantId = localStorage.getItem('restaurant_id')
    if (!restaurantId) { setModuleEnabled(null); return }

    if (_modCache && _modCache.restaurantId === restaurantId && Date.now() - _modCache.at < CACHE_TTL) {
      setModuleEnabled(isModuleEnabled(_modCache.modules, key))
      return
    }

    supabase.from('restaurants')
      .select('settings')
      .eq('id', restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        const modules = ((data?.settings as Record<string, unknown>)?.modules ?? {}) as Record<string, boolean>
        _modCache = { restaurantId, modules, at: Date.now() }
        setModuleEnabled(isModuleEnabled(modules, key))
      })
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#060810] flex flex-col">

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#060810]/80 backdrop-blur-2xl">
        <div className={cn('flex items-center gap-3 px-5 py-4', isRTL && 'flex-row-reverse')}>
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="sm:hidden w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            {sidebarOpen ? <XIcon className="w-4 h-4" /> : <MenuIcon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <ArrowLeft className={cn('w-4 h-4', isRTL && 'rotate-180')} />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className={cn('flex items-center gap-1.5 text-xs text-white/30', isRTL && 'flex-row-reverse')}>
              <span>{t.nav_settings}</span>
              {currentItem && (
                <>
                  <ChevronRight className={cn('w-3 h-3', isRTL && 'rotate-180')} />
                  <span className="text-white/60">{t[currentItem.labelKey]}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="sm:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          'shrink-0 border-white/8 bg-black/20 backdrop-blur-xl overflow-y-auto transition-all duration-300',
          isRTL ? 'border-l' : 'border-r',
          // Desktop: always visible at fixed width
          'hidden sm:block sm:w-60',
          // Mobile: fixed drawer that slides in
          sidebarOpen && 'fixed inset-y-0 left-0 z-40 w-64 flex flex-col !block top-[57px]',
        )}>
          <nav className="p-3 space-y-5">
            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter(item => {
                if (item.ownerOnly && !isOwner) return false
                if (item.permKey && !can(item.permKey)) return false
                return true
              })
              if (visibleItems.length === 0) return null
              return (
              <div key={group.labelKey}>
                <p className={cn(
                  'px-3 mb-1.5 text-[10px] font-bold text-white/25 uppercase tracking-widest',
                  isRTL && 'text-right',
                )}>
                  {t[group.labelKey]}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                          isRTL && 'flex-row-reverse',
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
                        <span className="flex-1 truncate">{t[item.labelKey]}</span>
                        {active && <ChevronRight className={cn('w-3 h-3 text-amber-400/50 shrink-0', isRTL && 'rotate-180')} />}
                      </Link>
                    )
                  })}
                </div>
              </div>
              )
            })}
          </nav>
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {moduleEnabled === false && activeModuleKey
            ? <UpgradeWall moduleName={moduleLabel(activeModuleKey)} />
            : children}
        </main>
      </div>
    </div>
  )
}
