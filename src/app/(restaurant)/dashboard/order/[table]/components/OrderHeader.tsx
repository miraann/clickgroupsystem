'use client'
import { ArrowLeft, Users, ShoppingBag } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  table:        string
  isTakeout:    boolean
  takeoutName:  string | null
  takeoutPhone: string | null
  orderId:      string | null
  guestCount:   number
  grandTotal:   number
  formatPrice:  (n: number) => string
  onGuestEdit:  () => void
}

export function OrderHeader({
  table, isTakeout, takeoutName, takeoutPhone,
  orderId, guestCount, grandTotal, formatPrice, onGuestEdit,
}: Props) {
  const router = useRouter()

  return (
    <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#022658]/80 backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all touch-manipulation"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            {isTakeout ? (
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-white">{takeoutName ?? 'Takeout'}</span>
                {takeoutPhone && <span className="text-xs text-white/40">{takeoutPhone}</span>}
              </div>
            ) : (
              <>
                <span className="text-sm font-bold text-white">Table {table}</span>
                <button
                  onClick={onGuestEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/8 border border-white/12 hover:bg-white/12 hover:border-white/20 active:scale-95 transition-all touch-manipulation"
                >
                  <Users className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">{guestCount > 0 ? guestCount : '—'}</span>
                  <span className="text-xs text-white/40">guests</span>
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-white/25 mt-0.5">
            {isTakeout ? 'Takeout' : 'Dine In'} · #{orderId?.slice(-6).toUpperCase()}
          </p>
        </div>
      </div>
      {grandTotal > 0 && (
        <div className="px-4 py-2 rounded-xl bg-amber-500/12 border border-amber-500/20">
          <span className="text-sm font-bold text-amber-400 tabular-nums">{formatPrice(grandTotal)}</span>
        </div>
      )}
    </header>
  )
}
