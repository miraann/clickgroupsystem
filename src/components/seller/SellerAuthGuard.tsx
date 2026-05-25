'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'

const TWO_HOURS = 2 * 60 * 60 * 1000

export default function SellerAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('seller_session') === 'true') {
      setReady(true)
    } else {
      router.replace('/seller-login')
    }
  }, [router])

  const logout = useCallback(() => {
    localStorage.removeItem('seller_session')
    router.replace('/seller-login')
  }, [router])

  useInactivityLogout(TWO_HOURS, logout, ready)

  if (!ready) return null
  return <>{children}</>
}
