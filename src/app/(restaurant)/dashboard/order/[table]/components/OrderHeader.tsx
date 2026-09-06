'use client'
import { ArrowLeft, Users, ShoppingBag, RefreshCw, Home } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface Props {
  table:        string
  isTakeout:    boolean
  takeoutName:  string | null
  takeoutPhone: string | null
  orderId:      string | null
  guestCount:   number
  grandTotal:    number
  formatPrice:   (n: number) => string
  canGuestEdit:  boolean
  onGuestEdit:   () => void
}

export function OrderHeader({
  table, isTakeout, takeoutName, takeoutPhone,
  orderId, guestCount, grandTotal, formatPrice, canGuestEdit, onGuestEdit,
}: Props) {
  const router = useRouter()
  const { t: tr } = useLanguage()

  return (
    <header className="shrink-0 flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b border-white/8 backdrop-blur-2xl" style={{ background: 'var(--app-anchor-80, rgba(2,38,88,0.8))' }}>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => router.back()}
            aria-label={tr.back}
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5 sm:w-7 sm:h-7 scale-x-[-1]" />
          </button>
          <button
            onClick={() => window.location.reload()}
            aria-label={tr.ord_refresh}
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all touch-manipulation"
          >
            <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            aria-label={tr.ord_home}
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all touch-manipulation"
          >
            <Home className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
        <div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            {isTakeout ? (
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                <span className="text-sm sm:text-base font-bold text-white">{takeoutName ?? tr.ord_takeout}</span>
                {takeoutPhone && <span className="text-xs sm:text-sm text-white/40">{takeoutPhone}</span>}
              </div>
            ) : (
              <>
                <span className="text-sm sm:text-base font-bold text-white">{tr.kds_table} {table}</span>
                {canGuestEdit && (
                  <button
                    onClick={onGuestEdit}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-white/8 border border-white/12 hover:bg-white/12 hover:border-white/20 active:scale-95 transition-all touch-manipulation"
                  >
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                    <span className="text-sm sm:text-base font-bold text-white">{guestCount > 0 ? guestCount : '—'}</span>
                    <span className="text-xs sm:text-sm text-white/40">{tr.ord_guests}</span>
                  </button>
                )}
              </>
            )}
          </div>
          <p className="text-xs sm:text-[13px] text-white/25 mt-0.5">
            {isTakeout ? tr.ord_takeout : tr.ord_dine_in} · #{orderId?.slice(-6).toUpperCase()}
          </p>
        </div>
      </div>
      {grandTotal > 0 && (
        <div className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-amber-500/12 border border-amber-500/20">
          <span className="text-sm sm:text-base font-bold text-amber-400 tabular-nums">{formatPrice(grandTotal)}</span>
        </div>
      )}
    </header>
  )
}
