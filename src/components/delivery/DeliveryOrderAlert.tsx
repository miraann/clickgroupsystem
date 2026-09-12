'use client'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Synthesized two-tone chime via Web Audio API — used whenever
 * /sounds/order-alert.mp3 is missing, fails to decode, or playback is
 * blocked. Mirrors the fallback in DriverOrderAlert.tsx.
 */
function playFallbackChime() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()

    const playTone = (freq: number, startAt: number, duration: number) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt)
      gain.gain.setValueAtTime(0, ctx.currentTime + startAt)
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + startAt + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + duration + 0.05)
    }

    playTone(880, 0,    0.25)
    playTone(659, 0.22, 0.35)

    setTimeout(() => { ctx.close().catch(() => {}) }, 900)
  } catch { /* Web Audio unsupported — silently skip */ }
}

/**
 * Drop into the delivery-orders staff screen (dashboard/delivery-orders/page.tsx).
 * ActivityToast already shows a silent visual toast for new delivery orders,
 * but the delivery kiosk tablet usually sits on a counter with nobody looking
 * at it — this adds the audio cue that screen already relies on elsewhere
 * (cashier's playNewOrderAlert, driver's DriverOrderAlert).
 */
export default function DeliveryOrderAlert({ restaurantId }: { restaurantId: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mp3FailedRef = useRef(false)

  useEffect(() => {
    const audio = new Audio('/sounds/order-alert.mp3')
    audio.loop = false
    audio.preload = 'auto'
    audio.addEventListener('error', () => { mp3FailedRef.current = true })
    audioRef.current = audio
  }, [])

  const playAlertSound = () => {
    if (mp3FailedRef.current || !audioRef.current) { playFallbackChime(); return }
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => playFallbackChime())
  }

  useEffect(() => {
    if (!restaurantId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`delivery-order-alert-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.new?.source !== 'delivery') return
          playAlertSound()
          if (navigator.vibrate) navigator.vibrate([200, 100, 200])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [restaurantId])

  return null
}
