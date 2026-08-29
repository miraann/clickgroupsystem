'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export default function RestaurantLoginPage() {
  const router = useRouter()
  const { t } = useLanguage()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError(null)

    const res = await fetch('/api/restaurant/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim(), password: password.trim() }),
    })

    if (res.ok) {
      const data = await res.json()

      if (data.requirePin) {
        router.push(`/pos/${data.restaurant?.menu_slug}/login`)
        return
      }

      const { restaurant } = data
      // Permanently bind this restaurant to the device (survives app restarts)
      localStorage.setItem('restaurant_id',   restaurant.id)
      localStorage.setItem('restaurant_name', restaurant.name)
      localStorage.setItem('restaurant_slug', restaurant.menu_slug ?? '')
      // Clear any stale staff session — owner must enter PIN each session
      const posKeys = ['pos_staff_id', 'pos_staff_name', 'pos_staff_role', 'pos_staff_color', 'pos_role_permissions', 'pos_role_name', 'owner_session']
      posKeys.forEach(k => localStorage.removeItem(k))
      sessionStorage.removeItem('pos_session_active')
      router.push(`/pos/${restaurant.menu_slug}/login`)
    } else {
      const body = await res.json().catch(() => ({ error: t.rl_failed }))
      setError(body.error ?? t.rl_failed)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a1533] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Brand background glows — ClickGroup navy + gold */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/4 w-[28rem] h-[28rem] bg-[#f5c518]/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-24 right-1/4 w-[28rem] h-[28rem] bg-[#2544b8]/25 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-white/35 hover:text-white/70 text-sm mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t.rl_back}
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-white p-2.5 flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-[#f5c518]/20 ring-1 ring-white/15">
            <Image src="/logo/logo.png" alt="ClickGroup" width={64} height={64} className="w-full h-full object-contain" priority />
          </div>
          <h1 className="text-2xl font-black text-white">{t.rl_title}</h1>
          <p className="text-white/45 text-sm mt-1">{t.rl_subtitle}</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleLogin}
          className="bg-white/[0.04] border border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl shadow-black/40"
        >
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-white/55 mb-1.5">{t.rl_email}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t.rl_email_ph}
              autoComplete="email"
              required
              dir="ltr"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#f5c518]/60 focus:ring-2 focus:ring-[#f5c518]/15 transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-white/55 mb-1.5">{t.rl_password}</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t.rl_password_ph}
                autoComplete="current-password"
                required
                dir="ltr"
                className="w-full px-4 py-3 pr-11 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#f5c518]/60 focus:ring-2 focus:ring-[#f5c518]/15 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full py-3 rounded-2xl bg-[#f5c518] hover:bg-[#ffd43b] disabled:opacity-30 disabled:cursor-not-allowed text-[#0a1533] font-black text-sm transition-all active:scale-[0.98] shadow-lg shadow-[#f5c518]/25 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? t.rl_signing_in : t.rl_sign_in}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-6">
          {t.rl_footer}
        </p>
      </div>
    </div>
  )
}
