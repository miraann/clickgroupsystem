'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Layers,
  LayoutGrid,
  Tag,
  UtensilsCrossed,
  Sliders,
  ChefHat,
  XCircle,
  Percent,
  Gift,
  Plus,
  CreditCard,
  CalendarDays,
} from 'lucide-react'

const TABS = [
  { label: 'Table Group', href: '/dashboard/settings/menu/table-group', icon: Layers },
  { label: 'Table', href: '/dashboard/settings/menu/table', icon: LayoutGrid },
  { label: 'Category', href: '/dashboard/settings/menu/category', icon: Tag },
  { label: 'Item', href: '/dashboard/settings/menu/item', icon: UtensilsCrossed },
  { label: 'Modifier', href: '/dashboard/settings/menu/modifier', icon: Sliders },
  { label: 'Kitchen Note', href: '/dashboard/settings/menu/kitchen-note', icon: ChefHat },
  { label: 'Void Reason', href: '/dashboard/settings/menu/void-reason', icon: XCircle },
  { label: 'Event & Offer', href: '/dashboard/settings/menu/event-offer', icon: CalendarDays },
  { label: 'Discount', href: '/dashboard/settings/menu/discount', icon: Percent },
  { label: 'Combo Discount', href: '/dashboard/settings/menu/combo-discount', icon: Gift },
  { label: 'Surcharge', href: '/dashboard/settings/menu/surcharge', icon: Plus },
  { label: 'Payment Method', href: '/dashboard/settings/menu/payment-method', icon: CreditCard },
]

export default function MenuSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Tab bar */}
      <div className="sticky top-0 z-20 bg-[#060810]/90 backdrop-blur-xl border-b border-white/8">
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex gap-0.5 px-4 pt-3 pb-0 min-w-max">
            {TABS.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium whitespace-nowrap transition-all duration-150 border-b-2 active:scale-95 touch-manipulation',
                    active
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500'
                      : 'text-white/40 border-transparent hover:text-white/70 hover:bg-white/5'
                  )}
                >
                  <tab.icon
                    size={15}
                    className={cn(active ? 'text-amber-400' : 'text-white/30')}
                  />
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  )
}
