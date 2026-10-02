'use client'
import { useState, useEffect, useCallback } from 'react'
import { promptBatteryExemptionOnce } from '@/lib/backgroundDelivery'

type SubStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function isCapacitorNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch { return false }
}

// ── Native FCM token sync ─────────────────────────────────────────
// FCM tokens rotate (reinstall, app-data clear, periodic refresh), and the
// server drops a token FCM reports dead. Registering only the first time
// permission was granted left such devices silent for good, so every page
// load re-reads the current token and upserts it (idempotent), and a
// long-lived 'registration' listener uploads tokens rotated while the app runs.

let nativeOwner: { restaurantId: string; staffId: string | null } | null = null
let nativeToken: string | null = null
let tokenListener: Promise<void> | null = null
let nativePost: { key: string; result: Promise<string | null> } | null = null
let nativeSync: { key: string; result: Promise<string | null> } | null = null

/** Upload a token; the listener and registerNative() both see each one, so share the request. */
function postNativeToken(token: string): Promise<string | null> {
  if (!nativeOwner) return Promise.resolve(null)
  nativeToken = token
  const { restaurantId, staffId } = nativeOwner
  const key = `${token}|${restaurantId}|${staffId ?? ''}`
  if (nativePost?.key === key) return nativePost.result
  const result = (async () => {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fcm_token: token, restaurant_id: restaurantId, staff_id: staffId }),
      })
      if (res.ok) return null
      return `Subscribe API error: ${await res.text()}`
    } catch (err) {
      return `Subscribe API error: ${String(err)}`
    }
  })().then(err => {
    if (err && nativePost?.key === key) nativePost = null
    return err
  })
  nativePost = { key, result }
  return result
}

function listenForTokens(): Promise<void> {
  tokenListener ??= (async () => {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.addListener('registration', t => { void postNativeToken(t.value) })
  })()
  return tokenListener
}

async function registerNative(): Promise<string | null> {
  const { PushNotifications } = await import('@capacitor/push-notifications')
  await listenForTokens()
  // register() asks FCM for the current token; the listener above posts it.
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
  if (outcome.err) return `FCM registration failed: ${outcome.err}`
  const err = outcome.token ? await postNativeToken(outcome.token) : null
  if (!err) void promptBatteryExemptionOnce()
  return err
}

/** Register this device's FCM token for the restaurant — once per page load per owner. */
function syncNativeToken(restaurantId: string, staffId: string | null): Promise<string | null> {
  const key = `${restaurantId}|${staffId ?? ''}`
  if (nativeSync?.key !== key) {
    nativeOwner = { restaurantId, staffId }
    const result = registerNative().then(err => {
      if (err && nativeSync?.key === key) nativeSync = null  // let the next mount retry
      return err
    })
    nativeSync = { key, result }
  }
  return nativeSync.result
}

// Same self-heal for browser Web Push: re-post the existing subscription once
// per page load in case the server dropped it.
const webSynced = new Set<string>()

export function useWebPush(restaurantId: string | null, staffId: string | null = null) {
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

  // Already permitted: re-register on every load (see syncNativeToken).
  useEffect(() => {
    if (status !== 'subscribed' || !restaurantId) return
    let cancelled = false
    ;(async () => {
      if (await isCapacitorNative()) {
        const err = await syncNativeToken(restaurantId, staffId)
        if (err && !cancelled) setError(err)
        return
      }
      const key = `${subscription?.endpoint}|${restaurantId}|${staffId ?? ''}`
      if (!subscription || webSynced.has(key)) return
      webSynced.add(key)
      fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), restaurant_id: restaurantId, staff_id: staffId }),
      }).then(res => { if (!res.ok) webSynced.delete(key) }, () => webSynced.delete(key))
    })()
    return () => { cancelled = true }
  }, [status, restaurantId, staffId, subscription])

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

        const err = await syncNativeToken(restaurantId, staffId)
        if (err) {
          setError(err)
          setBusy(false)
          return
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
        body: JSON.stringify({ subscription: sub.toJSON(), restaurant_id: restaurantId, staff_id: staffId }),
      })

      setSubscription(sub)
      setStatus('subscribed')
    } catch (err) {
      setError(String(err))
    }
    setBusy(false)
  }, [restaurantId, staffId, busy])

  const unsubscribe = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (await isCapacitorNative()) {
        // Not removeAllListeners(): that also killed PushNavigation's tap
        // handler and the token listener, while the server kept sending.
        const { PushNotifications } = await import('@capacitor/push-notifications')
        if (nativeToken) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: nativeToken }),
          })
        }
        await PushNotifications.unregister()
        nativeOwner = null
        nativeToken = null
        nativePost = null
        nativeSync = null
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
