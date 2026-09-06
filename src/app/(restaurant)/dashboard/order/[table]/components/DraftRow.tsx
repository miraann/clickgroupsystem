'use client'
import { Minus, Plus, X, Pencil, MessageSquarePlus } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { DbMenuItem, DraftEntry, KitchenNote } from '../types'

interface Props {
  item:         DbMenuItem
  entry:        DraftEntry
  kitchenNotes: KitchenNote[]
  onQty:        (delta: number) => void
  onRemove:     () => void
  onEdit:       () => void
  formatPrice:  (n: number) => string
}

export function DraftRow({ item, entry, kitchenNotes, onQty, onRemove, onEdit, formatPrice }: Props) {
  const { t: tr } = useLanguage()
  const modPrice  = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
  const lineTotal = (Number(item.price) + modPrice) * entry.qty
  const noteText  = [
    ...entry.selectedNoteIds.map(id => kitchenNotes.find(n => n.id === id)?.text),
    entry.customNote.trim() || null,
  ].filter(Boolean).join(' · ')
  const hasExtras = entry.selectedOptions.length > 0 || noteText.length > 0

  return (
    <div className="rounded-xl sm:rounded-2xl border bg-white/4 border-white/8 overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 sm:px-4 sm:py-3.5">
        <button onClick={onEdit} className="flex-1 min-w-0 text-start touch-manipulation group">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <p className="text-sm sm:text-lg font-semibold text-white/90 truncate leading-tight">{item.name}</p>
            <Pencil className="w-3 h-3 sm:w-4 sm:h-4 text-white/20 group-hover:text-amber-400/60 transition-colors shrink-0" />
          </div>
          <p className="text-base sm:text-lg font-bold text-amber-400 tabular-nums mt-0.5 sm:mt-1">
            {formatPrice(lineTotal)}
            {modPrice > 0 && <span className="text-white/30 ml-1 text-xs sm:text-sm font-normal">(+{formatPrice(modPrice * entry.qty)} {tr.ord_mods})</span>}
          </p>
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button onClick={onRemove} className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-2xl bg-rose-500 text-white hover:bg-rose-600 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button onClick={() => onQty(-1)} className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl bg-slate-600 text-white hover:bg-slate-500 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <span className="w-6 sm:w-9 text-center text-base sm:text-lg font-bold text-white tabular-nums">{entry.qty}</span>
          <button onClick={() => onQty(1)} className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl bg-amber-500 text-white hover:bg-amber-600 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {hasExtras && (
        <button onClick={onEdit} className="w-full px-3 pb-2 sm:px-4 sm:pb-2.5 space-y-1.5 text-start touch-manipulation">
          {entry.selectedOptions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.selectedOptions.map(o => (
                <span key={o.option_id} className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/15 text-amber-400/70">
                  {o.option_name}{o.price > 0 ? ` +${formatPrice(o.price)}` : ''}
                </span>
              ))}
            </div>
          )}
          {noteText && (
            <p className="text-[11px] sm:text-xs text-cyan-400/70 italic leading-snug">
              📝 {noteText}
            </p>
          )}
        </button>
      )}

      <div className="px-3 pb-2.5 sm:px-4 sm:pb-4">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-2xl bg-slate-600 text-white hover:bg-slate-500 text-xs sm:text-sm font-medium active:scale-95 transition-all touch-manipulation"
        >
          <MessageSquarePlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          {tr.ord_add_notes}
        </button>
      </div>
    </div>
  )
}
