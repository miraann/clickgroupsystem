'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  Layers, LayoutGrid, Tag, UtensilsCrossed, Sliders, ChefHat,
  XCircle, Percent, Gift, Plus, CreditCard, CalendarDays,
} from 'lucide-react'

import TableGroupPage    from './table-group/page'
import TablePage         from './table/page'
import CategoryPage      from './category/page'
import ItemPage          from './item/page'
import ModifierPage      from './modifier/page'
import KitchenNotePage   from './kitchen-note/page'
import VoidReasonPage    from './void-reason/page'
import EventOfferPage    from './event-offer/page'
import DiscountPage      from './discount/page'
import ComboDiscountPage from './combo-discount/page'
import SurchargePage     from './surcharge/page'
import PaymentMethodPage from './payment-method/page'
type TabKey =
  | 'table-group' | 'table' | 'category' | 'item' | 'modifier'
  | 'kitchen-note' | 'void-reason' | 'event-offer' | 'discount'
  | 'combo-discount' | 'surcharge' | 'payment-method'

const TABS: { key: TabKey; labelKey: string; icon: React.ElementType; color: string; activeColor: string }[] = [
  { key: 'table-group',    labelKey: 'menu_tab_table_group',    icon: Layers,          color: 'bg-violet-500/70 text-white',  activeColor: 'bg-violet-500 text-white shadow-lg shadow-violet-500/30' },
  { key: 'table',          labelKey: 'menu_tab_table',          icon: LayoutGrid,      color: 'bg-blue-500/70 text-white',    activeColor: 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' },
  { key: 'category',       labelKey: 'menu_tab_category',       icon: Tag,             color: 'bg-cyan-500/70 text-white',    activeColor: 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' },
  { key: 'item',           labelKey: 'menu_tab_item',           icon: UtensilsCrossed, color: 'bg-amber-500/70 text-white',   activeColor: 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' },
  { key: 'modifier',       labelKey: 'menu_tab_modifier',       icon: Sliders,         color: 'bg-orange-500/70 text-white',  activeColor: 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' },
  { key: 'kitchen-note',   labelKey: 'menu_tab_kitchen_note',   icon: ChefHat,         color: 'bg-rose-500/70 text-white',    activeColor: 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' },
  { key: 'void-reason',    labelKey: 'menu_tab_void_reason',    icon: XCircle,         color: 'bg-red-500/70 text-white',     activeColor: 'bg-red-500 text-white shadow-lg shadow-red-500/30' },
  { key: 'event-offer',    labelKey: 'menu_tab_event_offer',    icon: CalendarDays,    color: 'bg-pink-500/70 text-white',    activeColor: 'bg-pink-500 text-white shadow-lg shadow-pink-500/30' },
  { key: 'discount',       labelKey: 'menu_tab_discount',       icon: Percent,         color: 'bg-emerald-500/70 text-white', activeColor: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' },
  { key: 'combo-discount', labelKey: 'menu_tab_combo_discount', icon: Gift,            color: 'bg-teal-500/70 text-white',    activeColor: 'bg-teal-500 text-white shadow-lg shadow-teal-500/30' },
  { key: 'surcharge',      labelKey: 'menu_tab_surcharge',      icon: Plus,            color: 'bg-lime-600/70 text-white',    activeColor: 'bg-lime-600 text-white shadow-lg shadow-lime-500/30' },
  { key: 'payment-method', labelKey: 'menu_tab_payment_method', icon: CreditCard,      color: 'bg-indigo-500/70 text-white',  activeColor: 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' },
]

export default function MenuSettingsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [tab, setTab] = useState<TabKey>('table-group')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tab') as TabKey | null
    if (p && TABS.some(t => t.key === p)) setTab(p)
  }, [])

  const switchTab = (key: TabKey) => {
    setTab(key)
    const url = new URL(window.location.href)
    if (key === 'table-group') url.searchParams.delete('tab')
    else url.searchParams.set('tab', key)
    router.replace(url.pathname + url.search)
  }

  return (
    <div className="flex flex-col h-full -m-6">

      {/* Tab bar */}
      <div className="shrink-0 sticky top-0 z-20 backdrop-blur-xl border-b border-white/8 w-full" style={{ background: 'var(--app-anchor-90, rgba(2,38,88,0.9))' }}>
        <div className="overflow-x-auto scrollbar-touch">
          <div className="flex gap-1 px-6 md:px-12 2xl:px-24 3xl:px-44 pt-4 pb-0 min-w-max">
            {TABS.map(({ key, labelKey, icon: Icon, color, activeColor }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-150 active:scale-95 touch-manipulation',
                  tab === key ? activeColor : color
                )}
              >
                <Icon size={15} className="shrink-0" />
                <span className="hidden sm:inline">{t(labelKey as any)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 relative overflow-y-auto">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="px-6 md:px-12 2xl:px-24 3xl:px-44 pb-10 2xl:pb-12 3xl:pb-16" style={{ paddingTop: '70px' }}
          >
            {tab === 'table-group'    && <TableGroupPage />}
            {tab === 'table'          && <TablePage />}
            {tab === 'category'       && <CategoryPage />}
            {tab === 'item'           && <ItemPage />}
            {tab === 'modifier'       && <ModifierPage />}
            {tab === 'kitchen-note'   && <KitchenNotePage />}
            {tab === 'void-reason'    && <VoidReasonPage />}
            {tab === 'event-offer'    && <EventOfferPage />}
            {tab === 'discount'       && <DiscountPage />}
            {tab === 'combo-discount' && <ComboDiscountPage />}
            {tab === 'surcharge'      && <SurchargePage />}
            {tab === 'payment-method' && <PaymentMethodPage />}
          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  )
}
