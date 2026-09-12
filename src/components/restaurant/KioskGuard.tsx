'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isDeliveryKiosk, DELIVERY_KIOSK_HOME, isKdsKiosk, KDS_KIOSK_HOME } from '@/lib/kioskMode'

/**
 * The ClickGroup Delivery / KDS APKs are single-screen kiosks: each may only
 * sit on its own route (/dashboard/delivery-orders or /dashboard/kds). Any
 * attempt to reach another /dashboard route — Home, a pushed deep link — is
 * bounced straight back.
 *
 * This catches in-app (client-side) navigation; MainActivity.java is the native
 * backstop for full page loads. Login / PIN screens live outside this layout so
 * they are unaffected.
 */
export default function KioskGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || !pathname.startsWith('/dashboard')) return
    if (isDeliveryKiosk() && pathname !== DELIVERY_KIOSK_HOME) {
      router.replace(DELIVERY_KIOSK_HOME)
      return
    }
    if (isKdsKiosk() && pathname !== KDS_KIOSK_HOME) {
      router.replace(KDS_KIOSK_HOME)
    }
  }, [pathname, router])

  return null
}
