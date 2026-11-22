'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import useSWR from 'swr'
import { Delete, ChefHat, Clock, Loader2, CheckCircle2, Download, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { getStaffHome } from '@/lib/permissions/staffHome'
import { getRuntime, CASHIER_APK_URL } from '@/lib/appUpdate'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import styles from './login.module.css'

const supabase = createClient()

// Latin numerals for the clock regardless of language, localized weekday / month
const DATE_LOCALE: Record<string, string> = {
  en: 'en-US',
  ku: 'ckb-u-nu-latn',
  ar: 'ar-u-nu-latn',
}


const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'] as const
type Key = typeof KEYS[number]

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
  // Optional post-PIN destination (?next=/dashboard/…). The Delivery APK shell
  // appends this so returning users land straight on the delivery screen; only
  // internal /dashboard paths are honoured.
  const [nextDest] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const n = new URLSearchParams(window.location.search).get('next')
    return n && /^\/dashboard(\/|$)/.test(n) ? n : null
  })

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
      setTimeout(() => router.push(nextDest ?? '/dashboard'), 350)
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
    setTimeout(() => router.push(nextDest ?? getStaffHome(staff.permissions ?? {}, restaurant.menu_slug ?? slug)), 350)
  }, [slug, router, nextDest])

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
    // Sizing / layout lives in login.module.css: the screen always fits the
    // viewport (browser, PWA, APK WebView, Electron) with no scrolling.
    <div className={cn(styles.root, 'bg-[#022658] select-none')}>

      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-amber-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      </div>

      {/* Top bar */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={cn(styles.brandIcon, 'rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30')}>
            <ChefHat className="text-white" />
          </div>
          {loadingRest ? (
            <div className="h-4 w-32 max-w-[40vw] rounded bg-white/8 animate-pulse" />
          ) : (
            <div className={styles.brandText}>
              <p className={cn(styles.brandName, 'font-bold text-white')}>{restaurant?.name ?? t.pl_pos}</p>
              <p className={cn(styles.brandSub, 'text-white/30')}>{t.pl_staff_login}</p>
            </div>
          )}
        </div>
        <div className={styles.clock}>
          <p className={cn(styles.time, 'font-bold text-white tabular-nums')}>{formattedTime}</p>
          <p className={cn(styles.date, 'text-white/30')}>
            <Clock />{formattedDate}
          </p>
        </div>
      </header>

      <main className={styles.stage}>

        {/* Logo, title, PIN dots, status */}
        <div className={styles.head}>
          <div className={cn(styles.logo, 'bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center shadow-2xl shadow-amber-500/10 overflow-hidden')}>
            {restaurant?.logo_url
              ? <Image src={restaurant.logo_url} alt={restaurant.name} fill sizes="112px" className="object-cover" />
              : <ChefHat className="text-amber-400" />}
          </div>
          <h1 className={cn(styles.title, 'font-bold text-white')}>{t.pl_enter_pin}</h1>
          <p className={cn(styles.subtitle, 'text-white/35')}>{t.pl_pin_subtitle}</p>

          <div className={cn(styles.dots, shake && styles.shake)} dir="ltr">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className={cn(
                styles.dot,
                'rounded-full border-2 transition-all duration-150',
                status === 'success'   ? 'bg-emerald-400 border-emerald-400 scale-110'
                : status === 'error'  ? 'bg-rose-400 border-rose-400'
                : status === 'checking' && i < pin.length ? 'bg-amber-400 border-amber-400 scale-110 animate-pulse'
                : i < pin.length     ? 'bg-white border-white scale-110'
                : 'bg-transparent border-white/20'
              )} />
            ))}
          </div>

          <div className={styles.status} role="status" aria-live="polite">
            {status === 'success' && (
              <span className="text-emerald-400 font-medium inline-flex items-center gap-1.5">
                <CheckCircle2 /> {t.pl_welcome}
              </span>
            )}
            {status === 'error' && (
              <span className="text-rose-400 font-medium">{t.pl_incorrect}</span>
            )}
            {status === 'checking' && (
              <span className="text-amber-400/70 font-medium inline-flex items-center gap-1.5">
                <Loader2 className="animate-spin" /> {t.pl_verifying}
              </span>
            )}
            {status === 'idle' && pin.length === 0 && (
              <span className="text-white/20">{t.pl_tap_numbers}</span>
            )}
          </div>
        </div>

        {/* Number pad — fills the height that is left */}
        <div className={styles.padArea}>
          <div className={cn(styles.pad, 'border border-white/10 bg-white/4 backdrop-blur-2xl shadow-2xl shadow-black/40')} dir="ltr">
            {KEYS.map(key => {
              const isAction = key === 'del' || key === 'clr'
              const disabled = status === 'checking' || status === 'success'
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKey(key)}
                  disabled={disabled}
                  className={cn(
                    styles.key,
                    isAction && styles.keyAction,
                    'font-semibold transition-all duration-100 touch-manipulation active:scale-[0.92] disabled:opacity-40',
                    isAction
                      ? 'bg-white/5 border border-white/8 text-white/45 hover:bg-white/10 hover:text-white/70'
                      : 'bg-white/8 border border-white/12 text-white hover:bg-white/14 hover:border-white/20 active:bg-white/20 shadow-sm'
                  )}
                >
                  {key === 'del' ? <Delete /> : key === 'clr' ? t.pl_clr : key}
                </button>
              )
            })}
          </div>
        </div>

        {/* Forgot hint, switch account, install */}
        <div className={styles.foot}>
          <p className={cn(styles.forgot, 'text-white/15')}>
            {t.pl_forgot}
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => {
                ['restaurant_id','restaurant_name','restaurant_slug','owner_session',
                 'pos_staff_id','pos_staff_name','pos_staff_role','pos_staff_color',
                 'pos_role_permissions','pos_role_name'].forEach(k => localStorage.removeItem(k))
                sessionStorage.removeItem('pos_session_active')
                router.replace(`/restaurant-login${nextDest ? `?next=${encodeURIComponent(nextDest)}` : ''}`)
              }}
              className={cn(styles.action, 'font-semibold transition-all active:scale-95 border bg-white/8 border-white/15 text-white/70 hover:bg-white/14 hover:text-white hover:border-white/25')}
            >
              <ArrowLeftRight />
              {t.pl_change_account}
            </button>

            {/* Install App button — web only; hidden inside the native APK / Electron shell */}
            {!isNativeShell && (
              isAndroid ? (
                // Android: download and install the native APK
                installed ? (
                  <div className={cn(styles.action, 'font-semibold border bg-emerald-500/15 border-emerald-500/25 text-emerald-400')}>
                    <CheckCircle2 /> {t.pl_app_installed}
                  </div>
                ) : (
                  <a
                    href={CASHIER_APK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(styles.action, 'font-semibold transition-all active:scale-95 border bg-amber-500/15 border-amber-500/25 text-amber-400 hover:bg-amber-500/25')}
                  >
                    <Download /> {t.pl_install_android}
                  </a>
                )
              ) : (deferredInstall || installed) ? (
                // Desktop/iOS: PWA install prompt
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={installed}
                  className={cn(
                    styles.action,
                    'font-semibold transition-all active:scale-95 border',
                    installed
                      ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400 cursor-default'
                      : 'bg-white/8 border-white/15 text-white/70 hover:bg-white/14 hover:text-white hover:border-white/25'
                  )}
                >
                  {installed
                    ? <><CheckCircle2 /> {t.pl_app_installed}</>
                    : <><Download /> {t.pl_install_app}</>}
                </button>
              ) : null
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
