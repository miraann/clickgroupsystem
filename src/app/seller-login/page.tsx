'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ArrowLeft, Zap, Clock } from 'lucide-react'
import Link from 'next/link'

const COOLDOWN_MS = 60_000
const STORAGE_KEY = 'seller_login_last_attempt'

export default function SellerLoginPage() {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    const tick = () => {
      const last = Number(localStorage.getItem(STORAGE_KEY) ?? 0)
      const remaining = Math.ceil((last + COOLDOWN_MS - Date.now()) / 1000)
      setCooldown(remaining > 0 ? remaining : 0)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim() || cooldown > 0 || loading) return

    setLoading(true)
    setError(null)
    localStorage.setItem(STORAGE_KEY, String(Date.now()))

    const res = await fetch('/api/seller/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.trim() }),
    })

    if (res.ok) {
      localStorage.setItem('seller_session', 'true')
      router.replace('/seller')
    } else {
      const { error: msg } = await res.json().catch(() => ({ error: 'Login failed.' }))
      setError(msg ?? 'Incorrect password.')
      setLoading(false)
    }
  }

  const isBlocked = cooldown > 0

  return (
    <div className="min-h-screen bg-[#080b14] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-indigo-500/30">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Seller Console</h1>
          <p className="text-white/40 text-sm mt-1">System owner access only</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white/4 border border-white/10 rounded-3xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Master Password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter master password"
                autoComplete="current-password"
                autoFocus
                required
                disabled={isBlocked}
                className="w-full px-4 py-3 pr-11 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          {isBlocked && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Wait <span className="font-bold tabular-nums">{cooldown}s</span> before trying again</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim() || isBlocked}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isBlocked ? <Clock className="w-4 h-4" /> : null}
            {loading ? 'Signing in…' : isBlocked ? `Try again in ${cooldown}s` : 'Enter Seller Console'}
          </button>
        </form>

        <p className="text-center text-white/15 text-xs mt-6">
          ClickGroup POS · Seller Console
        </p>
      </div>
    </div>
  )
}
