'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const STAFF_KEYS = [
  'pos_staff_id', 'pos_staff_name', 'pos_staff_role', 'pos_staff_color',
  'pos_role_permissions', 'pos_role_name', 'owner_session', '_app_bg_cache',
  'pos_session_ts',
]

function clearStaffSession() {
  STAFF_KEYS.forEach(k => localStorage.removeItem(k))
  sessionStorage.removeItem('pos_session_active')
}

// Session is valid if timestamp was set within the last 8 hours (matching cookie TTL)
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
function isSessionFresh(): boolean {
  const ts = localStorage.getItem('pos_session_ts')
  if (!ts) return false
  return Date.now() - parseInt(ts, 10) < SESSION_TTL_MS
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurant_id')
    const slug         = localStorage.getItem('restaurant_slug')

    // No restaurant bound to this device yet → first-time email login
    if (!restaurantId || !slug) {
      router.replace('/restaurant-login')
      return
    }

    // Restaurant is bound. Check if this app session is already authenticated.
    // Use localStorage timestamp so the session survives app restarts (unlike sessionStorage).
    const sessionActive =
      sessionStorage.getItem('pos_session_active') === '1' || isSessionFresh()

    if (sessionActive && (localStorage.getItem('pos_staff_id') || localStorage.getItem('owner_session') === 'true')) {
      // Confirm the signed server cookie before rendering. localStorage alone is
      // not trusted — src/proxy.ts is the hard gate, this avoids a content flash
      // and handles a cleared/expired cookie.
      fetch('/api/restaurant/verify')
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!data?.ok) {
            clearStaffSession()
            fetch('/api/restaurant/logout', { method: 'POST' }).catch(() => {})
            router.replace(`/pos/${slug}/login`)
            return
          }
          setReady(true)
        })
        .catch(() => {
          clearStaffSession()
          router.replace(`/pos/${slug}/login`)
        })
      return
    }

    // No active session (fresh app open or session expired) → PIN screen
    clearStaffSession()
    router.replace(`/pos/${slug}/login`)
  }, [router])

  const logout = useCallback(async () => {
    const slug = localStorage.getItem('restaurant_slug')
    clearStaffSession()
    await fetch('/api/restaurant/logout', { method: 'POST' }).catch(() => {})
    router.replace(slug ? `/pos/${slug}/login` : '/restaurant-login')
  }, [router])

  // expose logout so children can call it (kept for compatibility)
  void logout

  if (!ready) return null
  return <>{children}</>
}
