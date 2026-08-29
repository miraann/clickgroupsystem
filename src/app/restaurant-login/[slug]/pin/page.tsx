'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Delete, CheckCircle2, Loader2, ArrowLeft, ShieldAlert } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'] as const
type Key = typeof KEYS[number]

export default function RestaurantPinPage() {
  const router = useRouter()
  const { slug } = useParams() as { slug: string }
  const { t } = useLanguage()

  const [restaurantName, setRestaurantName] = useState('')
  const [hasPin, setHasPin]   = useState<boolean | null>(null)
  const [pin, setPin]         = useState('')
  const [status, setStatus]   = useState<'idle' | 'checking' | 'success' | 'error'>('idle')
  const [shake, setShake]     = useState(false)

  useEffect(() => {
    const name = sessionStorage.getItem('pending_restaurant_name') ?? ''
    if (!name) {
      router.replace('/restaurant-login')
      return
    }
    setRestaurantName(name)
    setHasPin(sessionStorage.getItem('pending_restaurant_has_pin') !== '0')
  }, [router])

  const checkPin = useCallback(async (entered: string) => {
    if (entered.length < 4) return
    setStatus('checking')

    const res = await fetch('/api/restaurant/verify-pin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pin: entered }),
    })

    if (!res.ok) {
      setStatus('error')
      setShake(true)
      setTimeout(() => { setPin(''); setStatus('idle'); setShake(false) }, 700)
      return
    }

    const { restaurant } = await res.json()
    sessionStorage.removeItem('pending_restaurant_name')
    sessionStorage.removeItem('pending_restaurant_has_pin')

    const posKeys = ['pos_staff_id', 'pos_staff_name', 'pos_staff_role', 'pos_staff_color', 'pos_role_permissions', 'pos_role_name']
    posKeys.forEach(k => localStorage.removeItem(k))
    localStorage.setItem('restaurant_id',   restaurant.id)
    localStorage.setItem('restaurant_name', restaurant.name)
    localStorage.setItem('restaurant_slug', restaurant.menu_slug ?? slug)
    localStorage.setItem('owner_session',   'true')

    setStatus('success')
    setTimeout(() => router.push('/dashboard'), 900)
  }, [router, slug])

  const handleKey = useCallback((key: Key) => {
    if (!hasPin || status === 'checking' || status === 'success') return
    if (key === 'del') { setPin(p => p.slice(0, -1)); setStatus('idle'); return }
    if (key === 'clr') { setPin(''); setStatus('idle'); return }
    if (pin.length >= 6) return
    const next = pin + key
    setPin(next)
    if (next.length === 6) checkPin(next)
  }, [pin, status, hasPin, checkPin])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key as Key)
      else if (e.key === 'Backspace') handleKey('del')
      else if (e.key === 'Escape') { setPin(''); setStatus('idle') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey])

  const noPinConfigured = hasPin === false

  return (
    <div className="min-h-screen bg-[#0a1533] flex items-center justify-center px-4 relative overflow-hidden select-none">
      {/* Brand background glows — ClickGroup navy + gold */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/4 w-[28rem] h-[28rem] bg-[#f5c518]/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-24 right-1/4 w-[28rem] h-[28rem] bg-[#2544b8]/25 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <button
          onClick={() => router.push('/restaurant-login')}
          className="inline-flex items-center gap-1.5 text-white/35 hover:text-white/70 text-sm mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.rl_back}
        </button>

        <div className="text-center mb-8">
          {noPinConfigured ? (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 shadow-2xl shadow-rose-500/30 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-white p-2.5 flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-[#f5c518]/20 ring-1 ring-white/15">
              <Image src="/logo/logo.png" alt="ClickGroup" width={64} height={64} className="w-full h-full object-contain" priority />
            </div>
          )}
          <h1 className="text-2xl font-black text-white">
            {noPinConfigured ? t.rpin_notset_title : t.rpin_enter_title}
          </h1>
          <p className="text-white/45 text-sm mt-1">
            {restaurantName || t.rpin_default_sub}
          </p>
        </div>

        {noPinConfigured ? (
          /* ── No PIN configured ── */
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 p-6 text-center space-y-3">
            <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
            <p className="text-white font-semibold">{t.rpin_notset_head}</p>
            <p className="text-sm text-white/50 leading-relaxed">
              {t.rpin_notset_body}
            </p>
          </div>
        ) : (
          <>
            {/* PIN dots */}
            <div className={cn('flex justify-center gap-4 mb-6', shake && 'animate-[pinShake_0.45s_ease-in-out]')}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className={cn(
                  'w-4 h-4 rounded-full border-2 transition-all duration-150',
                  status === 'success'    ? 'bg-emerald-400 border-emerald-400 scale-110'
                  : status === 'error'   ? 'bg-rose-400 border-rose-400'
                  : status === 'checking' && i < pin.length ? 'bg-[#f5c518] border-[#f5c518] scale-110 animate-pulse'
                  : i < pin.length       ? 'bg-[#f5c518] border-[#f5c518] scale-110'
                  : 'bg-transparent border-white/20'
                )} />
              ))}
            </div>

            {/* Status */}
            <div className="text-center h-6 mb-6">
              {status === 'success' && (
                <p className="text-sm text-emerald-400 font-medium flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> {t.pl_welcome}
                </p>
              )}
              {status === 'error' && (
                <p className="text-sm text-rose-400 font-medium">{t.pl_incorrect}</p>
              )}
              {status === 'checking' && (
                <p className="text-sm text-[#f5c518]/80 font-medium flex items-center justify-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.pl_verifying}
                </p>
              )}
              {status === 'idle' && pin.length === 0 && (
                <p className="text-sm text-white/20">{t.pl_tap_numbers}</p>
              )}
            </div>

            {/* Numpad */}
            <div className="rounded-3xl border border-white/10 bg-white/4 backdrop-blur-2xl p-4 shadow-2xl shadow-black/40">
              <div className="grid grid-cols-3 gap-3">
                {KEYS.map(key => {
                  const isAction = key === 'del' || key === 'clr'
                  const disabled = status === 'checking' || status === 'success'
                  return (
                    <button
                      key={key}
                      onClick={() => handleKey(key)}
                      disabled={disabled}
                      className={cn(
                        'relative h-[68px] rounded-2xl font-semibold text-2xl transition-all duration-100 touch-manipulation active:scale-[0.92] disabled:opacity-40',
                        isAction
                          ? 'bg-white/5 border border-white/8 text-white/45 hover:bg-white/10 hover:text-white/70 text-base'
                          : 'bg-[#f5c518]/10 border border-[#f5c518]/25 text-white hover:bg-[#f5c518]/20 hover:border-[#f5c518]/40 active:bg-[#f5c518]/30 shadow-sm'
                      )}
                    >
                      {key === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : key === 'clr' ? t.pl_clr : key}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <p className="text-center text-white/20 text-xs mt-6">
          {t.rl_footer}
        </p>
      </div>

      <style jsx>{`
        @keyframes pinShake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-10px); }
          35%       { transform: translateX(10px); }
          55%       { transform: translateX(-7px); }
          75%       { transform: translateX(7px); }
        }
      `}</style>
    </div>
  )
}
