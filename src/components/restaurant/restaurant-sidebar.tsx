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
  Globe,
  Check,
} from 'lucide-react'
import { useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { Lang, LANG_META } from '@/lib/i18n/translations'

interface RestaurantSidebarProps {
  restaurantName?: string
  userRole?: string
}

export function RestaurantSidebar({ restaurantName = 'My Restaurant', userRole = 'Owner' }: RestaurantSidebarProps) {
  const pathname = usePathname()
  const { t, lang, setLang, isRTL } = useLanguage()
  const [showLangPicker, setShowLangPicker] = useState(false)

  const navItems = [
    { key: 'nav_overview',      icon: LayoutDashboard, href: '/dashboard' },
    { key: 'nav_orders',        icon: ShoppingBag,     href: '/dashboard/orders' },
    { key: 'nav_kitchen',       icon: MonitorCheck,    href: '/dashboard/kds' },
    { key: 'nav_menu',          icon: Package,         href: '/dashboard/menu' },
    { key: 'nav_tables',        icon: Table2,          href: '/dashboard/tables' },
    { key: 'nav_staff',         icon: Users,           href: '/dashboard/staff' },
    { key: 'nav_reports',       icon: BarChart3,       href: '/dashboard/reports' },
    { key: 'nav_notifications', icon: Bell,            href: '/dashboard/notifications' },
    { key: 'nav_settings',      icon: Settings,        href: '/dashboard/settings' },
  ] as const

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl border-r border-white/10" />

      <div className="relative flex flex-col h-full p-4">
        {/* Logo */}
        <div className={cn('flex items-center gap-3 px-3 py-4 mb-6', isRTL && 'flex-row-reverse')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{restaurantName}</p>
            <p className="text-xs text-amber-400 font-medium">{t.dashboard_subtitle}</p>
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
                  isRTL && 'flex-row-reverse',
                  active
                    ? 'bg-amber-500/20 text-white border border-amber-500/30 shadow-lg shadow-amber-500/10'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon className={cn(
                  'transition-colors shrink-0',
                  active ? 'text-amber-400' : 'text-white/40 group-hover:text-white/70'
                )} size={18} />
                <span className="flex-1">{t[item.key]}</span>
                {active && <ChevronRight className={cn('w-3.5 h-3.5 text-amber-400/60 shrink-0', isRTL && 'rotate-180')} />}
              </Link>
            )
          })}
        </nav>

        {/* Language Picker */}
        <div className="mt-3 relative">
          <button
            onClick={() => setShowLangPicker(v => !v)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 text-white/50 hover:text-white',
              isRTL && 'flex-row-reverse',
            )}
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">{LANG_META[lang].nativeLabel}</span>
            <span className="text-[10px] text-white/30 uppercase tracking-wider">{lang.toUpperCase()}</span>
          </button>

          {showLangPicker && (
            <div className="absolute bottom-full mb-1 left-0 right-0 rounded-2xl border border-white/12 bg-[#0d1120] shadow-2xl overflow-hidden z-50">
              <p className="px-4 py-2.5 text-[10px] font-bold text-white/30 uppercase tracking-widest border-b border-white/8">
                {t.choose_language}
              </p>
              {(Object.entries(LANG_META) as [Lang, typeof LANG_META[Lang]][]).map(([code, meta]) => (
                <button
                  key={code}
                  onClick={() => { setLang(code); setShowLangPicker(false) }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                    isRTL && 'flex-row-reverse',
                    lang === code
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'text-white/60 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <span className="text-base">{meta.flag}</span>
                  <span className="flex-1 text-left">{meta.nativeLabel}</span>
                  {lang === code && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom user info */}
        <div className="border-t border-white/10 pt-4 mt-3">
          <div className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group',
            isRTL && 'flex-row-reverse',
          )}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
              R
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">Restaurant Owner</p>
              <p className="text-xs text-white/40 truncate">{userRole}</p>
            </div>
            <LogOut className="w-4 h-4 text-white/30 group-hover:text-rose-400 transition-colors shrink-0" />
          </div>
        </div>
      </div>
    </aside>
  )
}
