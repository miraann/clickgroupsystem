'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'

const EIGHT_HOURS = 8 * 60 * 60 * 1000

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurant_id')

    // Fast path: localStorage session present
    if (restaurantId && (localStorage.getItem('pos_staff_id') || localStorage.getItem('owner_session') === 'true')) {
      setReady(true)
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
    localStorage.removeItem('pos_staff_id')
    localStorage.removeItem('pos_staff_name')
    localStorage.removeItem('pos_staff_role')
    localStorage.removeItem('pos_staff_color')
    localStorage.removeItem('pos_role_permissions')
    localStorage.removeItem('pos_role_name')
    localStorage.removeItem('owner_session')
    localStorage.removeItem('restaurant_id')
    localStorage.removeItem('restaurant_name')
    localStorage.removeItem('restaurant_slug')
    await fetch('/api/restaurant/logout', { method: 'POST' }).catch(() => {})
    router.replace(slug ? `/pos/${slug}/login` : '/restaurant-login')
  }, [router])

  useInactivityLogout(EIGHT_HOURS, logout, ready)

  if (!ready) return null
  return <>{children}</>
}
