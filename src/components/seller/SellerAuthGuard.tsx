'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'

const TWO_HOURS = 2 * 60 * 60 * 1000

export default function SellerAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Fast path: localStorage session present
    if (localStorage.getItem('seller_session') === 'true') {
      setReady(true)
      return
    }

    // Fallback: verify via server cookie (handles localStorage-cleared edge case)
    fetch('/api/seller/verify')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.ok) { router.replace('/seller-login'); return }
        localStorage.setItem('seller_session', 'true')
        setReady(true)
      })
      .catch(() => router.replace('/seller-login'))
  }, [router])

  const logout = useCallback(async () => {
    localStorage.removeItem('seller_session')
    await fetch('/api/seller/logout', { method: 'POST' }).catch(() => {})
    router.replace('/seller-login')
  }, [router])

  useInactivityLogout(TWO_HOURS, logout, ready)

  if (!ready) return null
  return <>{children}</>
}
