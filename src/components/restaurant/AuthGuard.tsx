'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'
import { createClient } from '@/lib/supabase/client'

const EIGHT_HOURS = 8 * 60 * 60 * 1000

function clearLocalSession() {
  const keys = [
    'pos_staff_id', 'pos_staff_name', 'pos_staff_role', 'pos_staff_color',
    'pos_role_permissions', 'pos_role_name', 'owner_session',
    'restaurant_id', 'restaurant_name', 'restaurant_slug', '_app_bg_cache',
  ]
  keys.forEach(k => localStorage.removeItem(k))
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurant_id')

    // Fast path: localStorage session present
    if (restaurantId && (localStorage.getItem('pos_staff_id') || localStorage.getItem('owner_session') === 'true')) {
      setReady(true)
      // Background: verify the restaurant still exists in the DB.
      // Catches stale sessions left over when a restaurant is deleted from the seller console.
      const supabase = createClient()
      supabase.from('restaurants').select('id').eq('id', restaurantId).maybeSingle()
        .then(({ data }) => {
          if (!data) {
            const slug = localStorage.getItem('restaurant_slug')
            clearLocalSession()
            fetch('/api/restaurant/logout', { method: 'POST' }).catch(() => {})
            router.replace(slug ? `/pos/${slug}/login` : '/restaurant-login')
          }
        })
      return
    }

    // Fallback: localStorage was cleared but the HTTP-only session cookie may still be valid.
    // Ask the server to verify and restore session data.
    fetch('/api/restaurant/verify')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.ok) {
          router.replace('/restaurant-login')
          return
        }
        const { restaurant, role } = data
        localStorage.setItem('restaurant_id',   restaurant.id)
        localStorage.setItem('restaurant_name', restaurant.name)
        localStorage.setItem('restaurant_slug', restaurant.menu_slug ?? '')
        if (role === 'owner') localStorage.setItem('owner_session', 'true')
        setReady(true)
      })
      .catch(() => router.replace('/restaurant-login'))
  }, [router])

  const logout = useCallback(async () => {
    const slug = localStorage.getItem('restaurant_slug')
    clearLocalSession()
    await fetch('/api/restaurant/logout', { method: 'POST' }).catch(() => {})
    router.replace(slug ? `/pos/${slug}/login` : '/restaurant-login')
  }, [router])

  useInactivityLogout(EIGHT_HOURS, logout, ready)

  if (!ready) return null
  return <>{children}</>
}
