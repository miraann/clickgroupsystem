'use client'
import { useEffect, useRef } from 'react'

const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

export function useInactivityLogout(timeoutMs: number, onLogout: () => void, enabled = true) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  useEffect(() => {
    if (!enabled) return

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onLogoutRef.current(), timeoutMs)
    }

    reset()
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      EVENTS.forEach(e => window.removeEventListener(e, reset))
    }
  }, [timeoutMs, enabled])
}
