'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react'

// One-time pairing screen for the CFD (Customer Facing Display) app.
// The native shell always boots here (/cfd). Once a restaurant has been paired
// its menu slug is stored in localStorage, and every later launch skips
// straight to /cfd/<slug>. Open /cfd?switch=1 to unpair and pick another.
const SLUG_KEY = 'cfd_slug'

export default function CFDPairing() {
  const router = useRouter()

  const [ready,    setReady]    = useState(false)
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // If already paired, jump to the display. `?switch=1` forces re-pairing.
  useEffect(() => {
    const wantsSwitch = new URLSearchParams(window.location.search).has('switch')
    const saved = localStorage.getItem(SLUG_KEY)
    if (wantsSwitch) {
      localStorage.removeItem(SLUG_KEY)
      setReady(true)
      return
    }
    if (saved) {
      router.replace(`/cfd/${saved}`)
      return
    }
    setReady(true)
  }, [router])

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim() || loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/restaurant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'Login failed.')
        setLoading(false)
        return
      }

      const slug: string | undefined = data.restaurant?.menu_slug
      if (!slug) {
        setError('This restaurant has no menu slug configured. Contact support.')
        setLoading(false)
        return
      }

      localStorage.setItem(SLUG_KEY, slug)
      router.replace(`/cfd/${slug}`)
    } catch {
      setError('Network error. Check the connection and try again.')
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#022658] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#022658] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Icon + title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-500/10">
            <Monitor className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">Pair this Display</h1>
          <p className="text-white/40 text-sm">
            Sign in once — this device will remember the restaurant
            <br />
            <span dir="rtl">جارێک بچۆ ژوورەوە — ئەم ئامێرە ڕێستۆرانتەکە بیردەهێنێتەوە</span>
          </p>
        </div>

        {/* Card */}
        <form onSubmit={handlePair} className="bg-white/4 border border-white/10 rounded-3xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-white/50 font-medium mb-1.5">Restaurant Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="owner@restaurant.com"
              autoComplete="email"
              dir="ltr"
              required
              className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-white/50 font-medium mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                dir="ltr"
                required
                className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 pr-11 text-sm font-medium text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Pairing…' : 'Pair Display'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <p className="text-center text-white/15 text-xs mt-5">
          Uses the restaurant login — no staff PIN needed
        </p>
      </div>
    </div>
  )
}
