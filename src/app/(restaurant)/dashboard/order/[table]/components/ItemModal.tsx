'use client'
import { useState, useEffect } from 'react'
import { X, Minus, Plus, Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { DbMenuItem, KitchenNote, DraftEntry, ModifierGroup } from '../types'

interface Props {
  item:             DbMenuItem
  entry:            DraftEntry
  kitchenNotes:     KitchenNote[]
  supabase:         ReturnType<typeof createClient>
  formatPrice:      (n: number) => string
  sending:          boolean
  onConfirm:        (e: DraftEntry) => void
  onConfirmAndSend: (e: DraftEntry) => void
  onClose:          () => void
}

export function ItemModal({ item, entry, kitchenNotes, supabase, formatPrice, sending, onConfirm, onConfirmAndSend, onClose }: Props) {
  const [local, setLocal]         = useState<DraftEntry>({ ...entry, selectedOptions: [...entry.selectedOptions] })
  const [modGroups, setModGroups] = useState<ModifierGroup[]>([])
  const [loadingMods, setLoadingMods] = useState(true)

  useEffect(() => {
    supabase
      .from('menu_item_modifiers')
      .select('menu_modifiers(id,name,required,min_select,max_select,modifier_options(id,name,price,sort_order))')
      .eq('item_id', item.id)
      .then(({ data }) => {
        if (data) {
          const groups: ModifierGroup[] = (data as any[])
            .map(row => row.menu_modifiers)
            .filter(Boolean)
            .map((mod: any) => ({
              id:         mod.id,
              name:       mod.name,
              required:   mod.required,
              min_select: mod.min_select,
              max_select: mod.max_select,
              options:    [...(mod.modifier_options ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order),
            }))
          setModGroups(groups)
        }
        setLoadingMods(false)
      })
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleNote = (id: string) =>
    setLocal(e => ({
      ...e,
      selectedNoteIds: e.selectedNoteIds.includes(id)
        ? e.selectedNoteIds.filter(n => n !== id)
        : [...e.selectedNoteIds, id],
    }))

  const toggleOption = (group: ModifierGroup, opt: { id: string; name: string; price: number }) =>
    setLocal(e => {
      const already   = e.selectedOptions.find(o => o.option_id === opt.id)
      if (already) return { ...e, selectedOptions: e.selectedOptions.filter(o => o.option_id !== opt.id) }
      const filtered  = group.max_select === 1
        ? e.selectedOptions.filter(o => o.modifier_id !== group.id)
        : [...e.selectedOptions]
      return {
        ...e,
        selectedOptions: [...filtered, { modifier_id: group.id, modifier_name: group.name, option_id: opt.id, option_name: opt.name, price: opt.price }],
      }
    })

  const modPrice       = local.selectedOptions.reduce((s, o) => s + o.price, 0)
  const effectivePrice = Number(item.price) + modPrice

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d1220]/98 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">

        {item.image_url ? (
          <div className="shrink-0 relative h-44 overflow-hidden">
            <img src={item.image_url} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1220]/90 via-[#0d1220]/30 to-transparent" />
            <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all active:scale-95">
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-3 left-5">
              <h2 className="text-lg font-bold text-white drop-shadow-lg">{item.name}</h2>
              <p className="text-sm font-semibold text-amber-400 tabular-nums mt-0.5">{formatPrice(effectivePrice)} each</p>
            </div>
          </div>
        ) : (
          <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
            <div>
              <h2 className="text-base font-semibold text-white">{item.name}</h2>
              <p className="text-sm text-amber-400 tabular-nums mt-0.5">{formatPrice(effectivePrice)} each</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60 font-medium">Quantity</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setLocal(e => ({ ...e, qty: Math.max(1, e.qty - 1) }))}
                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/50 flex items-center justify-center active:scale-90 transition-all">
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-base font-bold text-white tabular-nums">{local.qty}</span>
              <button onClick={() => setLocal(e => ({ ...e, qty: e.qty + 1 }))}
                className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center active:scale-90 transition-all">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {kitchenNotes.length > 0 && (
            <div>
              <p className="text-xs text-white/40 font-semibold mb-2.5 uppercase tracking-wider">Kitchen Notes</p>
              <div className="flex flex-wrap gap-2">
                {kitchenNotes.map(note => (
                  <button key={note.id} onClick={() => toggleNote(note.id)}
                    className={cn('px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 border',
                      local.selectedNoteIds.includes(note.id)
                        ? 'bg-cyan-500/20 border-cyan-500/35 text-cyan-300'
                        : 'bg-white/5 border-white/10 text-white/45 hover:bg-white/8')}>
                    {note.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-white/40 font-semibold mb-2 uppercase tracking-wider">Custom Note</p>
            <input
              value={local.customNote}
              onChange={e => setLocal(en => ({ ...en, customNote: e.target.value }))}
              placeholder="e.g. No onions, well done…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          {loadingMods ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
          ) : modGroups.map(group => (
            <div key={group.id}>
              <div className="flex items-center gap-2 mb-2.5">
                <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">{group.name}</p>
                {group.required && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/20">Required</span>}
                <span className="text-[10px] text-white/25">{group.max_select === 1 ? 'Pick 1' : `Up to ${group.max_select}`}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.options.map(opt => {
                  const selected = local.selectedOptions.some(o => o.option_id === opt.id)
                  return (
                    <button key={opt.id} onClick={() => toggleOption(group, opt)}
                      className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all active:scale-95',
                        selected ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/8')}>
                      <span className="font-medium truncate">{opt.name}</span>
                      {opt.price > 0 && (
                        <span className={cn('text-xs tabular-nums shrink-0 ml-2', selected ? 'text-amber-400' : 'text-white/30')}>
                          +{formatPrice(Number(opt.price))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 px-5 pb-5 pt-4 border-t border-white/8 space-y-2">
          <button onClick={() => onConfirmAndSend(local)} disabled={sending}
            className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send to Kitchen · {formatPrice(effectivePrice * local.qty)}
          </button>
          <button onClick={() => onConfirm(local)}
            className="w-full py-2.5 rounded-2xl bg-white/6 hover:bg-white/10 border border-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
            Save for Later
          </button>
        </div>
      </div>
    </div>
  )
}
