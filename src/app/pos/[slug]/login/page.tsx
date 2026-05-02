'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Delete, ChefHat, Clock, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { getStaffHome } from '@/lib/permissions/staffHome'

const supabase = createClient()

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'] as const
type Key = typeof KEYS[number]

interface Restaurant { id: string; name: string; logo_url?: string | null }
interface StaffRow   { id: string; name: string; role: string; color: string; pin: string; role_id: string | null }

export default function POSLoginPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const [restaurantId, setRestaurantId] = useState<string>('')

  const [restaurant, setRestaurant]   = useState<Restaurant | null>(null)
  const [loadingRest, setLoadingRest] = useState(true)
  const [pin, setPin]                 = useState('')
  const [status, setStatus]           = useState<'idle' | 'checking' | 'success' | 'error'>('idle')
  const [shake, setShake]             = useState(false)
  const [time, setTime]               = useState(new Date())

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Resolve slug → real restaurant id + info
  useEffect(() => {
    if (!slug) return
    supabase
      .from('restaurants')
      .select('id, name, logo_url')
      .eq('menu_slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setRestaurant(data as Restaurant); setRestaurantId(data.id) }
        setLoadingRest(false)
      })
  }, [slug])

  // Auto-submit when 4 digits entered
  const checkPin = useCallback(async (enteredPin: string) => {
    if (enteredPin.length !== 4 || !restaurantId) return
    setStatus('checking')

    const { data: staffRow } = await supabase
      .from('staff')
      .select('id, name, role, color, pin, role_id')
      .eq('restaurant_id', restaurantId)
      .eq('pin', enteredPin)
      .eq('status', 'active')
      .maybeSingle()

    if (!staffRow) {
      setStatus('error')
      setShake(true)
      setTimeout(() => { setPin(''); setStatus('idle'); setShake(false) }, 700)
      return
    }

    const staff = staffRow as StaffRow

    // Fetch custom role permissions directly from staff.role_id → restaurant_roles
    let rolePermissions: Record<string, boolean> = {}
    let roleName: string | null = null
    if (staff.role_id) {
      const { data: roleRow } = await supabase
        .from('restaurant_roles')
        .select('name, permissions')
        .eq('id', staff.role_id)
        .maybeSingle()
      if (roleRow) {
        rolePermissions = (roleRow.permissions as Record<string, boolean>) ?? {}
        roleName = roleRow.name as string
      }
    }

    // Persist session to localStorage (UUID for DB queries, slug for URL building)
    localStorage.setItem('restaurant_id',   restaurantId)
    localStorage.setItem('restaurant_slug', slug)
    localStorage.setItem('pos_staff_id', staff.id)
    localStorage.setItem('pos_staff_name', staff.name)
    localStorage.setItem('pos_staff_role', staff.role)
    localStorage.setItem('pos_staff_color', staff.color ?? '')
    localStorage.setItem('pos_role_permissions', JSON.stringify(rolePermissions))
    if (roleName) localStorage.setItem('pos_role_name', roleName)
    else localStorage.removeItem('pos_role_name')

    setStatus('success')
    setTimeout(() => router.push(getStaffHome(rolePermissions, slug)), 1100)
  }, [restaurantId, slug, router])

  const handleKey = useCallback((key: Key) => {
    if (status === 'checking' || status === 'success') return
    if (key === 'del') { setPin(p => p.slice(0, -1)); setStatus('idle'); return }
    if (key === 'clr') { setPin(''); setStatus('idle'); return }
    if (pin.length >= 4) return
    const next = pin + key
    setPin(next)
    if (next.length === 4) checkPin(next)
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

  const formattedTime = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  const formattedDate = time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

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
              <p className="text-sm font-bold text-white leading-none">{restaurant?.name ?? 'Point of Sale'}</p>
              <p className="text-xs text-white/30 mt-0.5">Staff Login</p>
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
      <div className="relative z-10 w-full max-w-sm px-4">

        {/* Restaurant logo / icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center mb-4 shadow-2xl shadow-amber-500/10">
            <ChefHat className="w-9 h-9 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Enter your PIN</h1>
          <p className="text-white/35 text-sm mt-1">4-digit staff PIN to access POS</p>
        </div>

        {/* PIN dots */}
        <div className={cn('flex justify-center gap-5 mb-8', shake && 'animate-[pinShake_0.45s_ease-in-out]')}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={cn(
              'w-5 h-5 rounded-full border-2 transition-all duration-150',
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
              <CheckCircle2 className="w-4 h-4" /> Welcome! Opening dashboard...
            </p>
          )}
          {status === 'error' && (
            <p className="text-sm text-rose-400 font-medium">Incorrect PIN. Try again.</p>
          )}
          {status === 'checking' && (
            <p className="text-sm text-amber-400/70 font-medium flex items-center justify-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying...
            </p>
          )}
          {status === 'idle' && pin.length === 0 && (
            <p className="text-sm text-white/20">Tap numbers below</p>
          )}
        </div>

        {/* Number pad */}
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
                      : 'bg-white/8 border border-white/12 text-white hover:bg-white/14 hover:border-white/20 active:bg-white/20 shadow-sm'
                  )}
                >
                  {key === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : key === 'clr' ? 'CLR' : key}
                </button>
              )
            })}
          </div>
        </div>

        <p className="text-center text-xs text-white/15 mt-5">
          Contact your manager if you forgot your PIN.
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
