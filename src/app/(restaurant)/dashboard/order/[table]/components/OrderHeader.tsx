'use client'
import { ArrowLeft, Users, ShoppingBag, RefreshCw, Home } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useNavButtonStyle } from '@/hooks/useNavButtonStyle'

interface Props {
  table:        string
  isTakeout:    boolean
  takeoutName:  string | null
  takeoutPhone: string | null
  guestCount:   number
  grandTotal:    number
  formatPrice:   (n: number) => string
  canGuestEdit:  boolean
  onGuestEdit:   () => void
}

// Icon-over-label nav buttons; width grows with the label so longer
// translations (e.g. نوێکردنەوە) don't clip
const NAV_BTN   = 'min-w-12 h-11 sm:min-w-16 sm:h-14 px-1.5 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center gap-0.5 sm:gap-1 active:scale-95 transition-all touch-manipulation'
const NAV_LABEL = 'text-[10px] sm:text-xs font-semibold leading-none whitespace-nowrap'

export function OrderHeader({
  table, isTakeout, takeoutName, takeoutPhone,
  guestCount, grandTotal, formatPrice, canGuestEdit, onGuestEdit,
}: Props) {
  const router = useRouter()
  const { t: tr, isRTL } = useLanguage()
  const { navCn, navStyle } = useNavButtonStyle()

  // The nav buttons sit on the physical left in both LTR and RTL:
  // row-reverse in RTL keeps the same left-to-right layout as LTR
  return (
    <header className={`shrink-0 flex ${isRTL ? 'flex-row-reverse' : ''} items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b border-white/8 backdrop-blur-2xl`} style={{ background: 'var(--app-anchor-80, rgba(2,38,88,0.8))' }}>
      <div className={`flex ${isRTL ? 'flex-row-reverse' : ''} items-center gap-3 sm:gap-4`}>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Back is the leftmost of the group (order-last flips it in RTL)
              — matches the payment screen */}
          <button
            onClick={() => router.back()}
            className={`${isRTL ? 'order-last' : ''} ${NAV_BTN} ${navCn}`}
            style={navStyle('back')}
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className={NAV_LABEL}>{tr.back}</span>
          </button>
          <button
            onClick={() => window.location.reload()}
            className={`${NAV_BTN} ${navCn}`}
            style={navStyle('refresh')}
          >
            <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className={NAV_LABEL}>{tr.ord_refresh}</span>
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className={`${NAV_BTN} ${navCn}`}
            style={navStyle('home')}
          >
            <Home className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className={NAV_LABEL}>{tr.ord_home}</span>
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
