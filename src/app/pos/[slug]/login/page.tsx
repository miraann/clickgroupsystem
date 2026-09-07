'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import useSWR from 'swr'
import { Delete, ChefHat, Clock, Loader2, CheckCircle2, Download, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { getStaffHome } from '@/lib/permissions/staffHome'
import { getRuntime } from '@/lib/appUpdate'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const supabase = createClient()

// Latin numerals for the clock regardless of language, localized weekday / month
const DATE_LOCALE: Record<string, string> = {
  en: 'en-US',
  ku: 'ckb-u-nu-latn',
  ar: 'ar-u-nu-latn',
}


const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'] as const
type Key = typeof KEYS[number]

// Cashier APK, straight from the GitHub release. Bump the tag when cutting a new
// release (see docs/APP_UPDATES.md — same place you bump android-latest.json).
const CASHIER_APK_URL =
  'https://github.com/miraann/clickgroupsystem/releases/download/v1.1/ClickGroup-Cashier-release.apk'

interface Restaurant { id: string; name: string; logo_url?: string | null; menu_slug?: string | null }

export default function POSLoginPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const { t, lang } = useLanguage()

  // Restaurant name/logo for the PIN card — cosmetic, cached across mounts.
  const { data: restaurant } = useSWR<Restaurant | null>(
    slug ? `restaurant-public-${slug}` : null,
    async () => {
      const { data } = await supabase
        .from('restaurant_public')
        .select('id, name, logo_url')
        .eq('menu_slug', slug)
        .maybeSingle()
      return (data as Restaurant) ?? null
    },
    { revalidateOnFocus: false, dedupingInterval: 300_000, keepPreviousData: true },
  )
  const loadingRest = restaurant === undefined

  const [pin, setPin]   = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle')
  const [shake, setShake]   = useState(false)
  const [time, setTime]     = useState<Date | null>(null)
  const [deferredInstall, setDeferredInstall] = useState<any>(null)
  const [installed, setInstalled]             = useState(false)
  const [isAndroid, setIsAndroid]             = useState(false)
  // True inside the native APK / Electron shell — the install button is web-only.
  const [isNativeShell, setIsNativeShell]     = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsNativeShell(getRuntime() !== 'web')
    setIsAndroid(/Android/i.test(navigator.userAgent))
    if (window.matchMedia('(display-mode: standalone)').matches) { setInstalled(true); return }
    const handler = (e: Event) => { e.preventDefault(); setDeferredInstall(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setInstalled(true); setDeferredInstall(null) })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredInstall) return
    deferredInstall.prompt()
    const { outcome } = await deferredInstall.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferredInstall(null)
  }

  // Clock tick — first value is set on mount so SSR and client markup match (no hydration mismatch)
  useEffect(() => {
    setTime(new Date())
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-submit when 6 digits entered — PIN verification is now server-side
  const checkPin = useCallback(async (enteredPin: string) => {
    if (enteredPin.length !== 6 || !slug) return
    setStatus('checking')

    const res = await fetch('/api/pos/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ slug, pin: enteredPin }),
    })

    if (!res.ok) {
      setStatus('error')
      setShake(true)
      setTimeout(() => { setPin(''); setStatus('idle'); setShake(false) }, 700)
      return
    }

    const data = await res.json()
    const { restaurant } = data

    if (data.isOwner) {
      // Restaurant owner logged in via PIN — set owner session
      const posKeys = ['pos_staff_id', 'pos_staff_name', 'pos_staff_role', 'pos_staff_color', 'pos_role_permissions', 'pos_role_name']
      posKeys.forEach(k => localStorage.removeItem(k))
      localStorage.setItem('restaurant_id',   restaurant.id)
      localStorage.setItem('restaurant_name', restaurant.name)
      localStorage.setItem('restaurant_slug', restaurant.menu_slug ?? slug)
      localStorage.setItem('owner_session',   'true')
      localStorage.setItem('pos_session_ts',  Date.now().toString())
      sessionStorage.setItem('pos_session_active', '1')
      setStatus('success')
      setTimeout(() => router.push('/dashboard'), 350)
      return
    }

    // Staff login — persist to localStorage for UI use
    const { staff } = data
    localStorage.setItem('restaurant_id',        restaurant.id)
    localStorage.setItem('restaurant_slug',       restaurant.menu_slug ?? slug)
    localStorage.setItem('pos_staff_id',          staff.id)
    localStorage.setItem('pos_staff_name',        staff.name)
    localStorage.setItem('pos_staff_role',        staff.role)
    localStorage.setItem('pos_staff_color',       staff.color ?? '')
    localStorage.setItem('pos_role_permissions',  JSON.stringify(staff.permissions ?? {}))
    if (staff.roleName) localStorage.setItem('pos_role_name', staff.roleName)
    else localStorage.removeItem('pos_role_name')
    localStorage.setItem('pos_session_ts',  Date.now().toString())
    sessionStorage.setItem('pos_session_active', '1')

    setStatus('success')
    setTimeout(() => router.push(getStaffHome(staff.permissions ?? {}, restaurant.menu_slug ?? slug)), 350)
  }, [slug, router])

  const handleKey = useCallback((key: Key) => {
    if (status === 'checking' || status === 'success') return
    if (key === 'del') { setPin(p => p.slice(0, -1)); setStatus('idle'); return }
    if (key === 'clr') { setPin(''); setStatus('idle'); return }
    if (pin.length >= 6) return
    const next = pin + key
    setPin(next)
    if (next.length === 6) checkPin(next)
  }, [pin, status, checkPin])

  // Physical keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key as Key)
      else if (e.key === 'Backspace') handleKey('del')
      else if (e.key === 'Escape') { setPin(''); setStatus('idle') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey])

  const dateLocale = DATE_LOCALE[lang] ?? 'en-US'
  const formattedTime = time?.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', hour12: true }) ?? ' '
  const formattedDate = time?.toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric' }) ?? ' '

  return (
    <div className="min-h-screen bg-[#022658] flex flex-col items-center justify-center overflow-hidden relative select-none">

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-amber-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      </div>

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          {loadingRest ? (
            <div className="h-4 w-32 rounded bg-white/8 animate-pulse" />
          ) : (
            <div>
              <p className="text-sm font-bold text-white leading-none">{restaurant?.name ?? t.pl_pos}</p>
              <p className="text-xs text-white/30 mt-0.5">{t.pl_staff_login}</p>
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white tabular-nums">{formattedTime}</p>
          <p className="text-xs text-white/30 flex items-center justify-end gap-1.5">
            <Clock className="w-3 h-3" />{formattedDate}
          </p>
        </div>
      </div>

      {/* PIN card */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl px-4">

        {/* Restaurant logo / icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-3xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center mb-4 shadow-2xl shadow-amber-500/10 overflow-hidden">
            {restaurant?.logo_url
              ? <img src={restaurant.logo_url} alt={restaurant.name} className="w-full h-full object-cover" />
              : <ChefHat className="w-9 h-9 sm:w-11 sm:h-11 md:w-14 md:h-14 text-amber-400" />}
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{t.pl_enter_pin}</h1>
          <p className="text-white/35 text-sm sm:text-base md:text-lg mt-1">{t.pl_pin_subtitle}</p>
        </div>

        {/* PIN dots */}
        <div className={cn('flex justify-center gap-5 sm:gap-6 md:gap-8 mb-8 md:mb-10', shake && 'animate-[pinShake_0.45s_ease-in-out]')}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className={cn(
              'w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-full border-2 transition-all duration-150',
              status === 'success'   ? 'bg-emerald-400 border-emerald-400 scale-110'
              : status === 'error'  ? 'bg-rose-400 border-rose-400'
              : status === 'checking' && i < pin.length ? 'bg-amber-400 border-amber-400 scale-110 animate-pulse'
              : i < pin.length     ? 'bg-white border-white scale-110'
              : 'bg-transparent border-white/20'
            )} />
          ))}
        </div>

        {/* Status message */}
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
            <p className="text-sm text-amber-400/70 font-medium flex items-center justify-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.pl_verifying}
            </p>
          )}
          {status === 'idle' && pin.length === 0 && (
            <p className="text-sm text-white/20">{t.pl_tap_numbers}</p>
          )}
        </div>

        {/* Number pad */}
        <div className="rounded-3xl border border-white/10 bg-white/4 backdrop-blur-2xl p-4 sm:p-5 md:p-7 shadow-2xl shadow-black/40">
          <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-5" dir="ltr">
            {KEYS.map(key => {
              const isAction = key === 'del' || key === 'clr'
              const disabled = status === 'checking' || status === 'success'
              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  disabled={disabled}
                  className={cn(
                    'relative h-[68px] sm:h-[92px] md:h-[150px] rounded-2xl md:rounded-3xl font-semibold text-2xl sm:text-3xl md:text-5xl transition-all duration-100 touch-manipulation active:scale-[0.92] disabled:opacity-40',
                    isAction
                      ? 'bg-white/5 border border-white/8 text-white/45 hover:bg-white/10 hover:text-white/70 text-base sm:text-lg md:text-2xl'
                      : 'bg-white/8 border border-white/12 text-white hover:bg-white/14 hover:border-white/20 active:bg-white/20 shadow-sm'
                  )}
                >
                  {key === 'del' ? <Delete className="w-5 h-5 sm:w-7 sm:h-7 md:w-11 md:h-11 mx-auto" /> : key === 'clr' ? t.pl_clr : key}
                </button>
              )
            })}
          </div>
        </div>

        <p className="text-center text-xs text-white/15 mt-5">
          {t.pl_forgot}
        </p>

        <div className="mt-4 flex justify-center">
          <button
            onClick={() => {
              ['restaurant_id','restaurant_name','restaurant_slug','owner_session',
               'pos_staff_id','pos_staff_name','pos_staff_role','pos_staff_color',
               'pos_role_permissions','pos_role_name'].forEach(k => localStorage.removeItem(k))
              sessionStorage.removeItem('pos_session_active')
              router.replace('/restaurant-login')
            }}
            className="flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all active:scale-95 border bg-white/8 border-white/15 text-white/70 hover:bg-white/14 hover:text-white hover:border-white/25"
          >
            <ArrowLeftRight className="w-4 h-4" />
            {t.pl_change_account}
          </button>
        </div>

        {/* Install App button — web only; hidden inside the native APK / Electron shell */}
        {!isNativeShell && (
        <div className="mt-5 flex justify-center">
          {isAndroid ? (
            // Android: download and install the native APK
            installed ? (
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold border bg-emerald-500/15 border-emerald-500/25 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> {t.pl_app_installed}
              </div>
            ) : (
              <a
                href={CASHIER_APK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95 border bg-amber-500/15 border-amber-500/25 text-amber-400 hover:bg-amber-500/25"
              >
                <Download className="w-4 h-4" /> {t.pl_install_android}
              </a>
            )
          ) : (deferredInstall || installed) ? (
            // Desktop/iOS: PWA install prompt
            <button
              onClick={handleInstall}
              disabled={installed}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95 border',
                installed
                  ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400 cursor-default'
                  : 'bg-white/8 border-white/15 text-white/70 hover:bg-white/14 hover:text-white hover:border-white/25'
              )}
            >
              {installed
                ? <><CheckCircle2 className="w-4 h-4" /> {t.pl_app_installed}</>
                : <><Download className="w-4 h-4" /> {t.pl_install_app}</>}
            </button>
          ) : null}
        </div>
        )}
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
