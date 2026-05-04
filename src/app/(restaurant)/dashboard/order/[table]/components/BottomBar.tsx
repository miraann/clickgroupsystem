'use client'
import { motion } from 'framer-motion'
import { Send, CreditCard, Loader2, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface Props {
  table:          string
  isTakeout:      boolean
  guestCount:     number
  grandTotal:     number
  sentTotal:      number
  draftSize:      number
  sentCount:      number
  sending:        boolean
  sendError:      string | null
  mobilePanel:    'menu' | 'order'
  setMobilePanel: (p: 'menu' | 'order') => void
  restaurantId:   string | null
  supabase:       ReturnType<typeof createClient>
  formatPrice:    (n: number) => string
  canCfd:         boolean
  canPay:         boolean
  canSend:        boolean
  onSend:         () => void
  onPay:          () => void
}

export function BottomBar({
  table, isTakeout, guestCount,
  grandTotal, sentTotal, draftSize, sentCount,
  sending, sendError, mobilePanel, setMobilePanel,
  restaurantId, supabase, formatPrice, canCfd, canPay, canSend,
  onSend, onPay,
}: Props) {
  const openCfd = () => {
    if (!restaurantId) return
    window.open(
      `/cfd/${restaurantId}/${isTakeout ? 'takeout' : table}`,
      'CFD',
      'width=1024,height=768,menubar=no,toolbar=no,location=no,status=no',
    )
  }

  const openPayment = () => {
    window.history.pushState({ payment: true }, '')
    onPay()
    if (restaurantId) {
      supabase.channel(`cfd-sync-${restaurantId}`)
        .send({ type: 'broadcast', event: 'table_change', payload: { table: isTakeout ? 'takeout' : table } })
        .catch(() => {})
    }
  }

  return (
    <div className="shrink-0 border-t border-white/8 bg-[#022658]/90 backdrop-blur-2xl px-4 py-3">
      {/* Mobile panel toggle */}
      <div className="sm:hidden flex gap-1.5 mb-3">
        <button
          onClick={() => setMobilePanel('menu')}
          className={cn('flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 touch-manipulation',
            mobilePanel === 'menu'
              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
              : 'bg-white/5 border border-white/8 text-white/30 hover:text-white/50')}
        >Menu</button>
        <button
          onClick={() => setMobilePanel('order')}
          className={cn('flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 touch-manipulation',
            mobilePanel === 'order'
              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
              : 'bg-white/5 border border-white/8 text-white/30 hover:text-white/50')}
        >
          Order{draftSize + sentCount > 0 ? ` (${draftSize + sentCount})` : ''}
        </button>
      </div>

      {sendError && (
        <p className="text-xs text-rose-400 font-mono mb-2 px-1 break-all">Send failed: {sendError}</p>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-white/25">Table {table}{guestCount > 0 ? ` · ${guestCount} guests` : ''}</p>
          <p className="text-base font-bold text-white tabular-nums">
            Total&nbsp;<span className={grandTotal > 0 ? 'text-amber-400' : 'text-white/30'}>{formatPrice(grandTotal)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {canCfd && (
            <button
              onClick={openCfd}
              className="flex items-center gap-1.5 px-3 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium active:scale-95 transition-all touch-manipulation"
              title="Open Customer Facing Display"
            >
              <Monitor className="w-4 h-4" />
              <span className="hidden sm:inline">CFD</span>
            </button>
          )}
          {canPay && sentTotal > 0 && (
            <motion.button
              onClick={openPayment}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="flex items-center gap-2 px-5 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-sm font-semibold transition-colors touch-manipulation">
              <CreditCard className="w-4 h-4" />Pay
            </motion.button>
          )}
          {canSend && (
            <motion.button
              onClick={onSend}
              disabled={draftSize === 0 || sending}
              whileTap={draftSize > 0 && !sending ? { scale: 0.95 } : {}}
              transition={{ duration: 0.1 }}
              className={cn('flex items-center gap-2 px-6 h-12 rounded-xl text-sm font-bold transition-colors touch-manipulation',
                draftSize > 0 && !sending
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30'
                  : 'bg-white/5 border border-white/8 text-white/20 cursor-not-allowed')}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send to Kitchen'}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  )
}
