'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Store, UtensilsCrossed, Coffee, Truck, ShoppingBag,
  Wine, CalendarDays, Monitor, SlidersHorizontal, Settings2,
  Receipt, BarChart3, Database, Users, UserCircle,
  CreditCard, ChefHat, ArrowLeft, ChevronRight,
  DollarSign, Star, Ban, ActivitySquare, Package, MessageCircle,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { TranslationKey } from '@/lib/i18n/translations'
import type { LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSettingsModuleKey, isModuleEnabled } from '@/lib/modules'
import { UpgradeWall, moduleLabel } from '@/components/ModuleGate'

let _modCache: { restaurantId: string; modules: Record<string, boolean>; at: number } | null = null
const CACHE_TTL = 30_000

interface NavItem  { labelKey: TranslationKey; href: string; icon: LucideIcon; permKey?: string }
interface NavGroup { labelKey: TranslationKey; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'sg_general',
    items: [
      { labelKey: 'si_restaurant_info', href: '/dashboard/settings/restaurant-info', icon: Store,             permKey: 'settings.restaurant_info' },
      { labelKey: 'si_preference',      href: '/dashboard/settings/preference',      icon: SlidersHorizontal, permKey: 'settings.preference' },
      { labelKey: 'si_device',          href: '/dashboard/settings/device',          icon: Monitor,           permKey: 'settings.device' },
    ],
  },
  {
    labelKey: 'sg_operations',
    items: [
      { labelKey: 'si_menu',        href: '/dashboard/settings/menu',        icon: UtensilsCrossed, permKey: 'menu' },
      { labelKey: 'si_dine_in',     href: '/dashboard/settings/dine-in',     icon: Coffee,          permKey: 'settings.dine_in' },
      { labelKey: 'si_delivery',    href: '/dashboard/settings/delivery',    icon: Truck,           permKey: 'settings.delivery' },
      { labelKey: 'si_takeout',     href: '/dashboard/settings/takeout',     icon: ShoppingBag,     permKey: 'settings.takeout' },
      { labelKey: 'si_coffee_bar',  href: '/dashboard/settings/bar',         icon: Wine,            permKey: 'settings.bar' },
      { labelKey: 'si_reservation', href: '/dashboard/settings/reservation', icon: CalendarDays,    permKey: 'settings.reservation' },
      { labelKey: 'si_kds_monitor', href: '/dashboard/settings/kds-monitor', icon: ActivitySquare,  permKey: 'settings.kds_monitor' },
      { labelKey: 'si_inventory',   href: '/dashboard/settings/inventory',   icon: Package,         permKey: 'settings.inventory' },
    ],
  },
  {
    labelKey: 'sg_finance',
    items: [
      { labelKey: 'si_finance',    href: '/dashboard/settings/finance',    icon: BarChart3,  permKey: 'finance.report' },
      { labelKey: 'si_expense',    href: '/dashboard/settings/expense',    icon: DollarSign, permKey: 'finance.expense' },
      { labelKey: 'si_pay_later',  href: '/dashboard/settings/pay-later',  icon: CreditCard, permKey: 'finance.pay_later' },
      { labelKey: 'si_receipt',    href: '/dashboard/settings/receipt',    icon: Receipt,    permKey: 'finance.receipt' },
      { labelKey: 'si_void_items', href: '/dashboard/settings/void-items', icon: Ban,        permKey: 'settings.void_items' },
    ],
  },
  {
    labelKey: 'sg_people',
    items: [
      { labelKey: 'si_users',    href: '/dashboard/settings/users',    icon: Users,      permKey: 'settings.users' },
      { labelKey: 'si_member',   href: '/dashboard/settings/member',   icon: Star,       permKey: 'settings.member' },
      { labelKey: 'si_customer', href: '/dashboard/settings/customer', icon: UserCircle, permKey: 'settings.customer' },
    ],
  },
  {
    labelKey: 'sg_system',
    items: [
      { labelKey: 'si_advanced', href: '/dashboard/settings/advanced', icon: Settings2 },
      { labelKey: 'si_database', href: '/dashboard/settings/database', icon: Database  },
    ],
  },
  {
    labelKey: 'sg_marketing',
    items: [
      { labelKey: 'si_whatsapp', href: '/dashboard/settings/whatsapp', icon: MessageCircle, permKey: 'settings.whatsapp' },
    ],
  },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { t, isRTL } = useLanguage()
  const supabase = createClient()

  const isHome      = pathname === '/dashboard/settings'
  const currentItem = NAV_GROUPS.flatMap(g => g.items).find(i => i.href === pathname || pathname.startsWith(i.href + '/'))


const [moduleEnabled,  setModuleEnabled]  = useState<boolean | null>(null)
  const [activeModuleKey, setActiveModuleKey] = useState<string | null>(null)

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
    <div className="min-h-screen bg-[#022658] flex flex-col">

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#022658]/80 backdrop-blur-2xl">
        <div className={cn('flex items-center gap-3 px-5 py-4', isRTL && 'flex-row-reverse')}>
          {/* Back: home → dashboard, sub-page → settings home */}
          <button
            onClick={() => router.push(isHome ? '/dashboard' : '/dashboard/settings')}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <ArrowLeft className={cn('w-4 h-4', isRTL && 'rotate-180')} />
          </button>

          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <ChefHat className="w-4 h-4 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className={cn('flex items-center gap-1.5 text-xs', isRTL && 'flex-row-reverse')}>
              {isHome ? (
                <span className="text-white/60 font-medium">{t.nav_settings}</span>
              ) : (
                <>
                  <button
                    onClick={() => router.push('/dashboard/settings')}
                    className="text-white/30 hover:text-white/60 transition-colors"
                  >
                    {t.nav_settings}
                  </button>
                  {currentItem && (
                    <>
                      <ChevronRight className={cn('w-3 h-3 text-white/30', isRTL && 'rotate-180')} />
                      <span className="text-white/60 font-medium">{t[currentItem.labelKey]}</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Page content — no sidebar anywhere */}
      <main className="flex-1 overflow-y-auto">
        {isHome ? (
          children
        ) : pathname.startsWith('/dashboard/settings/menu/') ? (
          /* Menu sub-pages: no settings-level animation; menu layout owns transitions */
          <div className="p-4 sm:p-6 min-h-[calc(100vh-120px)]">
            <div className="max-w-2xl mx-auto">
              {moduleEnabled === false && activeModuleKey
                ? <UpgradeWall moduleName={moduleLabel(activeModuleKey)} />
                : children}
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 min-h-[calc(100vh-120px)]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={pathname}
                className="max-w-2xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.22, ease: 'circOut' }}
              >
                {moduleEnabled === false && activeModuleKey
                  ? <UpgradeWall moduleName={moduleLabel(activeModuleKey)} />
                  : children}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}
