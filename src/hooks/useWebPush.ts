'use client'
import { useState, useEffect, useCallback } from 'react'

type SubStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function useWebPush(restaurantId: string | null) {
  const [status, setStatus]           = useState<SubStatus>('loading')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [busy, setBusy]               = useState(false)

  const check = useCallback(async () => {
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
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); return }

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
    } finally {
      setBusy(false)
    }
  }, [restaurantId, busy])

  const unsubscribe = useCallback(async () => {
    if (!subscription || busy) return
    setBusy(true)
    try {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      await subscription.unsubscribe()
      setSubscription(null)
      setStatus('unsubscribed')
    } catch {}
    setBusy(false)
  }, [subscription, busy])

  return { status, busy, subscribe, unsubscribe }
}
