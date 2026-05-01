'use client'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DbOrderItem } from '../types'

interface Props {
  item:        DbOrderItem
  onAction:    () => void
  formatPrice: (n: number) => string
}

export function SentRow({ item, onAction, formatPrice }: Props) {
  const statusCfg = item.status === 'ready'
    ? { bg: 'bg-emerald-500/8',  border: 'border-emerald-500/25', badge: 'bg-emerald-500/20 text-emerald-400', label: 'Ready'   }
    : item.status === 'cooking'
    ? { bg: 'bg-blue-500/8',     border: 'border-blue-500/20',    badge: 'bg-blue-500/20 text-blue-400',       label: 'Cooking' }
    : { bg: 'bg-white/4',        border: 'border-white/8',        badge: 'bg-white/8 text-white/35',           label: 'Sent'    }

  return (
    <button
      onClick={onAction}
      className={cn('w-full rounded-xl border overflow-hidden text-left transition-all active:scale-[0.99] touch-manipulation', statusCfg.bg, statusCfg.border)}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/85 truncate leading-tight">{item.item_name}</p>
          <p className="text-xs text-white/40 tabular-nums mt-0.5">{formatPrice(item.item_price * item.qty)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-white/40 tabular-nums">×{item.qty}</span>
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md', statusCfg.badge)}>{statusCfg.label}</span>
          <ChevronRight className="w-3.5 h-3.5 text-white/20" />
        </div>
      </div>
      {item.note && (
        <p className="px-3 pb-2 text-[11px] text-cyan-400/60 italic leading-tight">📝 {item.note}</p>
      )}
    </button>
  )
}
