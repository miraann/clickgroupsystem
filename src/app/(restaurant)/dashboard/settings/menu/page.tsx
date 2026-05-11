'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Layers, LayoutGrid, Tag, UtensilsCrossed, Sliders, ChefHat,
  XCircle, Percent, Gift, Plus, CreditCard, CalendarDays, Globe,
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
import OnlineMenuPage    from './online-menu/page'

type TabKey =
  | 'table-group' | 'table' | 'category' | 'item' | 'modifier'
  | 'kitchen-note' | 'void-reason' | 'event-offer' | 'discount'
  | 'combo-discount' | 'surcharge' | 'payment-method' | 'online-menu'

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'table-group',    label: 'Table Group',    icon: Layers },
  { key: 'table',          label: 'Table',          icon: LayoutGrid },
  { key: 'category',       label: 'Category',       icon: Tag },
  { key: 'item',           label: 'Item',           icon: UtensilsCrossed },
  { key: 'modifier',       label: 'Modifier',       icon: Sliders },
  { key: 'kitchen-note',   label: 'Kitchen Note',   icon: ChefHat },
  { key: 'void-reason',    label: 'Void Reason',    icon: XCircle },
  { key: 'event-offer',    label: 'Event & Offer',  icon: CalendarDays },
  { key: 'discount',       label: 'Discount',       icon: Percent },
  { key: 'combo-discount', label: 'Combo Discount', icon: Gift },
  { key: 'surcharge',      label: 'Surcharge',      icon: Plus },
  { key: 'payment-method', label: 'Payment Method', icon: CreditCard },
  { key: 'online-menu',    label: 'Online Menu',    icon: Globe },
]

export default function MenuSettingsPage() {
  const router = useRouter()
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
    <div className="flex flex-col min-h-screen -m-6">

      {/* Tab bar */}
      <div className="shrink-0 sticky top-0 z-20 bg-[#022658]/90 backdrop-blur-xl border-b border-white/8 w-full">
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex gap-1 px-6 md:px-12 2xl:px-24 3xl:px-44 pt-4 pb-0 min-w-max">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={cn(
                  'flex items-center gap-2.5 px-5 py-3.5 rounded-t-xl text-[15px] font-medium whitespace-nowrap transition-all duration-150 border-b-2 active:scale-95 touch-manipulation',
                  tab === key
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500'
                    : 'text-white/40 border-transparent hover:text-white/70 hover:bg-white/5'
                )}
              >
                <Icon size={17} className={cn(tab === key ? 'text-amber-400' : 'text-white/30')} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="px-6 md:px-12 2xl:px-24 3xl:px-44 py-6 2xl:py-8 3xl:py-12"
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
            {tab === 'online-menu'    && <OnlineMenuPage />}
          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  )
}
