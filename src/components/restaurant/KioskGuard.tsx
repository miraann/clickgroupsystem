'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isDeliveryKiosk, DELIVERY_KIOSK_HOME } from '@/lib/kioskMode'

/**
 * The ClickGroup Delivery APK is a single-screen kiosk: it may only sit on
 * /dashboard/delivery-orders. Any attempt to reach another /dashboard route —
 * Home, the Driver screen, a pushed deep link — is bounced straight back.
 *
 * This catches in-app (client-side) navigation; MainActivity.java is the native
 * backstop for full page loads. Login / PIN screens live outside this layout so
 * they are unaffected.
 */
export default function KioskGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isDeliveryKiosk()) return
    if (!pathname || !pathname.startsWith('/dashboard')) return
    if (pathname === DELIVERY_KIOSK_HOME) return
    router.replace(DELIVERY_KIOSK_HOME)
  }, [pathname, router])

  return null
}
