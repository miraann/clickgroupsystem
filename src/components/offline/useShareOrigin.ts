'use client'
import { useEffect, useState } from 'react'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import { fetchOfflineStatus } from './OfflineShell'

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/

/**
 * The address other devices should use to reach this app, for QR codes and
 * links shown on screen. Online that is this page's own origin. Offline, the
 * POS PC opens the app as 127.0.0.1 — which on a phone or tablet means the
 * phone itself — so use the PC's Wi-Fi address instead (the same one
 * Settings → Advanced shows for tablets).
 */
export function useShareOrigin(): string {
  const [origin, setOrigin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin))
  useEffect(() => {
    if (!IS_OFFLINE_EDITION || !LOOPBACK.test(window.location.hostname)) return
    let live = true
    fetchOfflineStatus().then(s => { if (live && s?.tablets[0]) setOrigin(s.tablets[0]) })
    return () => { live = false }
  }, [])
  return origin
}
