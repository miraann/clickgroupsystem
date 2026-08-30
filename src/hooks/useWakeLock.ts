'use client'
import { useEffect, useRef } from 'react'

/**
 * Screen Wake Lock — stops the device display from sleeping while `enabled`.
 *
 * Used by the CFD (customer-facing display) screens. The wake lock is
 * automatically dropped by the browser whenever the page is hidden, so it is
 * re-acquired on every `visibilitychange` back to visible.
 *
 * The native CFD shell (Capacitor) also sets `FLAG_KEEP_SCREEN_ON` from the
 * same `localStorage['cfd_keep_awake']` flag, as a fallback for Android
 * WebViews that don't implement the Wake Lock API.
 */
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    const nav = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { wakeLock?: WakeLock })
      : undefined
    if (!nav?.wakeLock) return

    let cancelled = false

    const acquire = async () => {
      if (!enabled || cancelled || sentinelRef.current) return
      try {
        const sentinel = await nav.wakeLock!.request('screen')
        sentinelRef.current = sentinel
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
        })
      } catch {
        /* refused (low battery, permissions policy, …) — nothing to do */
      }
    }

    const release = () => {
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire()
    }

    if (enabled) {
      acquire()
      document.addEventListener('visibilitychange', onVisibility)
    } else {
      release()
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [enabled])
}
