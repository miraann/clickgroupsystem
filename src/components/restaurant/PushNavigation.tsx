'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PushNavigation() {
  const router = useRouter()

  useEffect(() => {
    let removeListener: (() => void) | null = null

    async function setup() {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return

        const { PushNotifications } = await import('@capacitor/push-notifications')

        const handle = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const url = action.notification?.data?.url as string | undefined
            if (url) router.push(url)
          },
        )

        removeListener = () => handle.remove()
      } catch {}
    }

    setup()
    return () => { removeListener?.() }
  }, [router])

  return null
}
