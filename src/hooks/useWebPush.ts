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
  const [error, setError]               = useState<string | null>(null)

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
    setError(null)
    try {
      // ── Native Android ────────────────────────────────────
      if (await isCapacitorNative()) {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const result = await PushNotifications.requestPermissions()
        if (result.receive !== 'granted') { setStatus('denied'); setBusy(false); return }

        // Set up both success and error listeners BEFORE calling register()
        const outcome = await new Promise<{ token?: string; err?: string }>(async (resolve) => {
          const okHandle  = await PushNotifications.addListener('registration', (token) => {
            okHandle.remove()
            resolve({ token: token.value })
          })
          const errHandle = await PushNotifications.addListener('registrationError', (e) => {
            errHandle.remove()
            resolve({ err: JSON.stringify(e) })
          })
          setTimeout(() => resolve({ err: 'Registration timed out after 10s' }), 10000)
          await PushNotifications.register()
        })

        if (outcome.err) {
          setError(`FCM registration failed: ${outcome.err}`)
          setBusy(false)
          return
        }

        if (outcome.token) {
          const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fcm_token: outcome.token, restaurant_id: restaurantId }),
          })
          if (!res.ok) {
            const body = await res.text()
            setError(`Subscribe API error: ${body}`)
            setBusy(false)
            return
          }
        }

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
      setError(String(err))
    }
    setBusy(false)
  }, [restaurantId, busy])

  const unsubscribe = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (await isCapacitorNative()) {
        const { PushNotifications } = await import('@capacitor/push-notifications')
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

  return { status, busy, error, subscribe, unsubscribe }
}
