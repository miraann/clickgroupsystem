'use client'
import { useState, useEffect, useCallback } from 'react'

type SubStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function isCapacitorNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch { return false }
}

export function useWebPush(restaurantId: string | null) {
  const [status, setStatus]             = useState<SubStatus>('loading')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [busy, setBusy]                 = useState(false)

  const check = useCallback(async () => {
    // ── Native Android via Capacitor ──────────────────────────
    if (await isCapacitorNative()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const s = await PushNotifications.checkPermissions()
        setStatus(s.receive === 'granted' ? 'subscribed'
                : s.receive === 'denied'  ? 'denied'
                : 'unsubscribed')
      } catch { setStatus('unsupported') }
      return
    }

    // ── Browser Web Push ──────────────────────────────────────
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported'); return
    }
    if (Notification.permission === 'denied') { setStatus('denied'); return }
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) { setSubscription(existing); setStatus('subscribed') }
    else setStatus('unsubscribed')
  }, [])

  useEffect(() => { check() }, [check])

  const subscribe = useCallback(async () => {
    if (!restaurantId || busy) return
    setBusy(true)
    try {
      // ── Native Android ────────────────────────────────────
      if (await isCapacitorNative()) {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const result = await PushNotifications.requestPermissions()
        if (result.receive !== 'granted') { setStatus('denied'); setBusy(false); return }

        await PushNotifications.register()

        // Listen for FCM token once
        await new Promise<void>((resolve) => {
          const listener = PushNotifications.addListener('registration', async (token) => {
            await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fcm_token: token.value, restaurant_id: restaurantId }),
            })
            listener.then(l => l.remove())
            resolve()
          })
          setTimeout(resolve, 5000) // safety timeout
        })

        setStatus('subscribed')
        setBusy(false)
        return
      }

      // ── Browser Web Push ──────────────────────────────────
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); setBusy(false); return }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), restaurant_id: restaurantId }),
      })

      setSubscription(sub)
      setStatus('subscribed')
    } catch (err) {
      console.error('Push subscribe failed:', err)
    }
    setBusy(false)
  }, [restaurantId, busy])

  const unsubscribe = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      if (await isCapacitorNative()) {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        // Remove all listeners; on next app open will re-register if needed
        await PushNotifications.removeAllListeners()
        setStatus('unsubscribed')
        setBusy(false)
        return
      }

      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe()
        setSubscription(null)
      }
      setStatus('unsubscribed')
    } catch {}
    setBusy(false)
  }, [subscription, busy])

  return { status, busy, subscribe, unsubscribe }
}
