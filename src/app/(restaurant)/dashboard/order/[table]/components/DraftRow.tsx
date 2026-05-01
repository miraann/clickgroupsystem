'use client'
import { Minus, Plus, X, Pencil } from 'lucide-react'
import type { DbMenuItem, DraftEntry } from '../types'

interface Props {
  item:        DbMenuItem
  entry:       DraftEntry
  onQty:       (delta: number) => void
  onRemove:    () => void
  onEdit:      () => void
  formatPrice: (n: number) => string
}

export function DraftRow({ item, entry, onQty, onRemove, onEdit, formatPrice }: Props) {
  const modPrice  = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
  const lineTotal = (Number(item.price) + modPrice) * entry.qty
  const hasExtras = entry.selectedOptions.length > 0 || entry.customNote || entry.selectedNoteIds.length > 0

  return (
    <div className="rounded-xl border bg-white/4 border-white/8 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={onEdit} className="flex-1 min-w-0 text-left touch-manipulation group">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-white/85 truncate leading-tight">{item.name}</p>
            <Pencil className="w-3 h-3 text-white/20 group-hover:text-amber-400/60 transition-colors shrink-0" />
          </div>
          <p className="text-xs text-amber-400/80 tabular-nums mt-0.5">
            {formatPrice(lineTotal)}
            {modPrice > 0 && <span className="text-white/30 ml-1">(+{formatPrice(modPrice * entry.qty)} mods)</span>}
          </p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onRemove} className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400/60 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <X className="w-3 h-3" />
          </button>
          <button onClick={() => onQty(-1)} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/45 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center text-sm font-bold text-white tabular-nums">{entry.qty}</span>
          <button onClick={() => onQty(1)} className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {hasExtras ? (
        <button onClick={onEdit} className="w-full px-3 pb-2.5 space-y-1.5 text-left touch-manipulation">
          {entry.selectedOptions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.selectedOptions.map(o => (
                <span key={o.option_id} className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/15 text-amber-400/70">
                  {o.option_name}{o.price > 0 ? ` +${formatPrice(o.price)}` : ''}
                </span>
              ))}
            </div>
          )}
          {(entry.selectedNoteIds.length > 0 || entry.customNote) && (
            <p className="text-[11px] text-cyan-400/60 italic leading-tight">
              📝 {[...entry.selectedNoteIds.map(() => '•'), entry.customNote].filter(Boolean).join(' ')}
            </p>
          )}
        </button>
      ) : (
        <button onClick={onEdit} className="w-full px-3 pb-2 text-left touch-manipulation">
          <p className="text-[10px] text-white/20 hover:text-amber-400/50 transition-colors">Tap to add notes & modifiers…</p>
        </button>
      )}
    </div>
  )
}
