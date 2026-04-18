'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurant_id')
    if (!restaurantId) {
      router.replace('/pos')
      return
    }

    // PIN staff login
    if (localStorage.getItem('pos_staff_id')) {
      setReady(true)
      return
    }

    // Owner login via restaurant-login page (custom password, no Supabase Auth)
    if (localStorage.getItem('owner_session') === 'true') {
      setReady(true)
      return
    }

    // Supabase Auth session (fallback for future Auth-based flows)
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setReady(true)
      } else {
        localStorage.removeItem('restaurant_id')
        router.replace('/pos')
      }
    })
  }, [router])

  if (!ready) return null
  return <>{children}</>
}
