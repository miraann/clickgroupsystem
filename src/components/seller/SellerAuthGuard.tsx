'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'

const TWO_HOURS = 2 * 60 * 60 * 1000

export default function SellerAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Always verify the signed server cookie. The localStorage flag is a UX
    // hint only and is never trusted for access control (see src/proxy.ts).
    fetch('/api/seller/verify')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.ok) {
          localStorage.removeItem('seller_session')
          router.replace('/seller-login')
          return
        }
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
