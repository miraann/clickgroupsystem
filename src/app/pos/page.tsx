'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Delete, ChevronRight, ChefHat, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const STAFF = [
  { id: '1', name: 'Ahmad Karimi', role: 'Owner', pin: '1234', color: 'from-violet-500 to-purple-600' },
  { id: '2', name: 'Layla Hassan', role: 'Manager', pin: '2580', color: 'from-indigo-500 to-blue-600' },
  { id: '3', name: 'Omar Khalid', role: 'Cashier', pin: '3690', color: 'from-emerald-500 to-teal-600' },
  { id: '4', name: 'Noor Ahmed', role: 'Waiter', pin: '1470', color: 'from-amber-500 to-orange-500' },
  { id: '5', name: 'Karzan Ibrahim', role: 'Chef', pin: '9630', color: 'from-rose-500 to-pink-600' },
  { id: '6', name: 'Soran Ali', role: 'Waiter', pin: '7410', color: 'from-cyan-500 to-sky-600' },
]

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del']

export default function POSEntry() {
  const router = useRouter()
  const [selectedStaff, setSelectedStaff] = useState<typeof STAFF[0] | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [success, setSuccess] = useState(false)
  const [time, setTime] = useState(new Date())
  const [shake, setShake] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleKey = useCallback((key: string) => {
    if (success) return
    if (key === 'del') {
      setPin(p => p.slice(0, -1))
      setError(false)
    } else if (key === 'clear') {
      setPin('')
      setError(false)
    } else if (pin.length < 4) {
      const next = pin + key
      setPin(next)
      if (next.length === 4) {
        // Validate
        if (next === selectedStaff?.pin) {
          setSuccess(true)
          setTimeout(() => router.push('/dashboard'), 1200)
        } else {
          setError(true)
          setShake(true)
          setTimeout(() => { setPin(''); setError(false); setShake(false) }, 700)
        }
      }
    }
  }, [pin, selectedStaff, success, router])

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key)
      else if (e.key === 'Backspace') handleKey('del')
      else if (e.key === 'Escape') { setPin(''); setSelectedStaff(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey])

  const formattedTime = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  const formattedDate = time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-[#060810] flex flex-col items-center justify-center overflow-hidden relative select-none">

      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-amber-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-violet-600/5 rounded-full blur-3xl" />
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />
      </div>

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">Spice Garden</p>
            <p className="text-xs text-white/30 mt-0.5">Point of Sale</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white tabular-nums">{formattedTime}</p>
          <p className="text-xs text-white/30 flex items-center justify-end gap-1">
            <Clock className="w-3 h-3" />{formattedDate}
          </p>
        </div>
      </div>

      {!selectedStaff ? (
        /* ── STAFF SELECTION ── */
        <div className="relative z-10 w-full max-w-2xl px-4">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-white">Who&apos;s working today?</h1>
            <p className="text-white/35 mt-2">Tap your name to sign in</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {STAFF.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStaff(s)}
                className="group relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 hover:bg-white/10 hover:border-white/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-left"
              >
                {/* Glow */}
                <div className={cn('absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity blur-xl bg-gradient-to-br', s.color)} />

                <div className="relative">
                  {/* Avatar */}
                  <div className={cn('w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center text-xl font-bold text-white mb-3 shadow-lg', s.color)}>
                    {s.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <p className="text-sm font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">{s.role}</p>
                </div>

                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </div>
              </button>
            ))}
          </div>
        </div>

      ) : (
        /* ── PIN PAD ── */
        <div className="relative z-10 w-full max-w-sm px-4">

          {/* Staff info */}
          <div className="text-center mb-8">
            <button
              onClick={() => { setSelectedStaff(null); setPin(''); setError(false) }}
              className="inline-flex flex-col items-center gap-3 group"
            >
              <div className={cn(
                'w-20 h-20 rounded-3xl bg-gradient-to-br flex items-center justify-center text-3xl font-bold text-white shadow-2xl transition-transform group-hover:scale-95',
                success ? 'from-emerald-400 to-emerald-600' : selectedStaff.color,
                error && 'from-rose-500 to-rose-700'
              )}>
                {selectedStaff.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <p className="text-xl font-bold text-white">{selectedStaff.name}</p>
                <p className="text-sm text-white/40">{selectedStaff.role} · tap to switch</p>
              </div>
            </button>
          </div>

          {/* PIN dots */}
          <div className={cn(
            'flex justify-center gap-4 mb-8 transition-transform',
            shake && 'animate-[wiggle_0.4s_ease-in-out]'
          )}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={cn(
                  'w-4 h-4 rounded-full border-2 transition-all duration-150',
                  success
                    ? 'bg-emerald-400 border-emerald-400 scale-110'
                    : error
                    ? 'bg-rose-400 border-rose-400'
                    : i < pin.length
                    ? 'bg-white border-white scale-110'
                    : 'bg-transparent border-white/25'
                )}
              />
            ))}
          </div>

          {/* Status text */}
          <div className="text-center h-5 mb-6">
            {success && <p className="text-sm text-emerald-400 font-medium">Welcome back! Opening POS...</p>}
            {error && <p className="text-sm text-rose-400 font-medium">Incorrect PIN. Try again.</p>}
            {!success && !error && pin.length === 0 && <p className="text-sm text-white/25">Enter your 4-digit PIN</p>}
          </div>

          {/* Number Pad */}
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-4 shadow-2xl shadow-black/40">
            <div className="grid grid-cols-3 gap-3">
              {KEYS.map((key) => {
                const isAction = key === 'del' || key === 'clear'
                const isEmpty = key === ''

                return (
                  <button
                    key={key}
                    onClick={() => !isEmpty && handleKey(key)}
                    disabled={success}
                    className={cn(
                      'relative h-16 rounded-2xl font-semibold text-xl transition-all duration-100',
                      'active:scale-95 disabled:opacity-50',
                      isEmpty ? 'cursor-default' :
                      isAction
                        ? 'bg-white/5 border border-white/8 text-white/50 hover:bg-white/10 hover:text-white/80 active:bg-white/15'
                        : 'bg-white/8 border border-white/12 text-white hover:bg-white/15 hover:border-white/20 active:bg-white/20',
                      // Press effect
                      'before:absolute before:inset-0 before:rounded-2xl before:bg-white/0 before:transition-all active:before:bg-white/5'
                    )}
                  >
                    {key === 'del' ? (
                      <Delete className="w-5 h-5 mx-auto" />
                    ) : key === 'clear' ? (
                      <span className="text-sm font-medium">CLR</span>
                    ) : (
                      <span>{key}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-center text-xs text-white/15 mt-6">
            Use PIN <span className="text-white/30">1234</span> for demo (Ahmad Karimi)
          </p>
        </div>
      )}

      <style jsx>{`
        @keyframes wiggle {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
