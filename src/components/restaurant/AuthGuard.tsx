'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const STAFF_KEYS = [
  'pos_staff_id', 'pos_staff_name', 'pos_staff_role', 'pos_staff_color',
  'pos_role_permissions', 'pos_role_name', 'owner_session', '_app_bg_cache',
]

function clearStaffSession() {
  STAFF_KEYS.forEach(k => localStorage.removeItem(k))
  sessionStorage.removeItem('pos_session_active')
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
    const sessionActive = sessionStorage.getItem('pos_session_active') === '1'

    if (sessionActive && (localStorage.getItem('pos_staff_id') || localStorage.getItem('owner_session') === 'true')) {
      // Active session — verify the restaurant still exists in the background
      setReady(true)
      const supabase = createClient()
      supabase.from('restaurants').select('id').eq('id', restaurantId).maybeSingle()
        .then(({ data }) => {
          if (!data) {
            clearStaffSession()
            fetch('/api/restaurant/logout', { method: 'POST' }).catch(() => {})
            router.replace(`/pos/${slug}/login`)
          }
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
