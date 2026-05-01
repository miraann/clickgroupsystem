'use client'
import { Users, Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  table:      string
  guestCount: number
  guestDraft: number
  onKey:      (k: string) => void
  onConfirm:  () => void
  onClose:    () => void
}

export function GuestEditModal({ table, guestCount, guestDraft, onKey, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-80 rounded-3xl border border-white/15 bg-[#0d1220]/98 backdrop-blur-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/8 bg-amber-500/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-0.5">Table {table}</p>
              <p className="text-lg font-bold text-amber-400">Update Guests</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-lg font-bold text-white">
              T{table}
            </div>
          </div>
        </div>

        <div className="px-6 pt-5 pb-4 text-center border-b border-white/8">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mx-auto mb-2.5">
            <Users className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-base font-bold text-white">How many guests?</p>
          <p className="text-xs text-white/30 mt-0.5">Current: {guestCount}</p>
        </div>

        <div className="flex items-center justify-center h-16 border-b border-white/8">
          <span className={cn('text-5xl font-bold tabular-nums transition-all', guestDraft > 0 ? 'text-white' : 'text-white/15')}>
            {guestDraft || '0'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-px bg-white/5 border-t border-white/8">
          {['1','2','3','4','5','6','7','8','9','⌫','0','✓'].map(k => (
            <button
              key={k}
              onClick={() => k === '✓' ? onConfirm() : onKey(k)}
              className={cn(
                'h-14 text-xl font-semibold flex items-center justify-center transition-all active:scale-95 touch-manipulation',
                k === '✓'
                  ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20'
                  : k === '⌫'
                    ? 'bg-[#0d1220] text-rose-400/70 hover:bg-rose-500/10'
                    : 'bg-[#0d1220] text-white/80 hover:bg-white/8'
              )}
            >
              {k === '⌫' ? <Delete className="w-5 h-5" /> : k}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-white/8">
          <button
            onClick={onClose}
            className="w-full h-10 rounded-xl bg-white/6 hover:bg-white/10 text-white/50 text-sm font-medium transition-all active:scale-95"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
