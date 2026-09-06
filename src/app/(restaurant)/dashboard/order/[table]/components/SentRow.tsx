'use client'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { DbOrderItem } from '../types'

interface Props {
  item:        DbOrderItem
  onAction:    () => void
  formatPrice: (n: number) => string
}

export function SentRow({ item, onAction, formatPrice }: Props) {
  const { t: tr } = useLanguage()
  const statusCfg = item.status === 'ready'
    ? { bg: 'bg-emerald-500/8',  border: 'border-emerald-500/25', badge: 'bg-emerald-500 text-white', label: tr.ord_status_ready   }
    : item.status === 'cooking'
    ? { bg: 'bg-blue-500/8',     border: 'border-blue-500/20',    badge: 'bg-blue-500 text-white',    label: tr.ord_status_cooking }
    : item.status === 'queued'
    ? { bg: 'bg-amber-500/6',    border: 'border-amber-500/20',   badge: 'bg-amber-500 text-white',   label: tr.ord_status_queued  }
    : { bg: 'bg-white/4',        border: 'border-white/8',        badge: 'bg-slate-600 text-white',   label: tr.ord_status_sent    }

  return (
    <button
      onClick={onAction}
      className={cn('w-full rounded-xl sm:rounded-2xl border overflow-hidden text-start transition-all active:scale-[0.99] touch-manipulation', statusCfg.bg, statusCfg.border)}
    >
      <div className="flex items-center gap-2.5 sm:gap-3 px-3 py-2.5 sm:px-4 sm:py-3.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-lg font-semibold text-white/90 truncate leading-tight">{item.item_name}</p>
          <p className="text-base sm:text-lg font-bold text-amber-400 tabular-nums mt-0.5 sm:mt-1">{formatPrice(item.item_price * item.qty)}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <span className="text-sm sm:text-base font-bold text-white/60 tabular-nums">×{item.qty}</span>
          <span className={cn('text-xs sm:text-sm font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg', statusCfg.badge)}>{statusCfg.label}</span>
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-white/25" />
        </div>
      </div>
      {item.note && (
        <p className="px-3 pb-2 sm:px-4 sm:pb-3 text-[11px] sm:text-xs text-cyan-400/70 italic leading-snug">📝 {item.note}</p>
      )}
    </button>
  )
}
