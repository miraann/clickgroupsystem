'use client'
import { useState, useEffect } from 'react'
import { Search, X, Star, Phone, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type Member = { id: string; name: string; phone: string | null; points: number; tier: string }

interface Props {
  open:         boolean
  restaurantId: string
  selectedId:   string | null
  onSelect:     (m: Member) => void
  onClose:      () => void
}

export function MemberPicker({ open, restaurantId, selectedId, onSelect, onClose }: Props) {
  const [list,   setList]   = useState<Member[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open || list.length > 0) return
    createClient()
      .from('members')
      .select('id,name,phone,points,tier')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => setList((data ?? []) as Member[]))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const filtered = list.filter(m => {
    const q = search.toLowerCase()
    return !q || m.name.toLowerCase().includes(q) || m.phone?.includes(q)
  })

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#0d1220] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h3 className="text-base font-bold text-white">Select Member</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name or phone…" autoFocus
              className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {filtered.map(m => (
            <button key={m.id} onClick={() => { onSelect(m); onClose() }}
              className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-95',
                selectedId === m.id ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-white/4 hover:bg-white/8 border border-transparent')}>
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Star className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 shrink-0">{m.tier}</span>
                </div>
                {m.phone && <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{m.phone}</p>}
                <p className="text-xs text-amber-400/60 mt-0.5">{m.points} pts</p>
              </div>
              {selectedId === m.id && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
            </button>
          ))}
          {list.length === 0 && (
            <p className="text-center text-white/30 text-sm py-8">No active members found</p>
          )}
        </div>
      </div>
    </div>
  )
}
