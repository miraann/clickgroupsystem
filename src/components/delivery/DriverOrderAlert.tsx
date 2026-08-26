'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Truck, X, MapPin } from 'lucide-react'

interface AssignedOrder {
  deliveryId:   string
  customerName: string
  addressText:  string | null
  status:       string
}

/**
 * Synthesized two-tone chime via Web Audio API — used whenever
 * /sounds/order-alert.mp3 is missing, fails to decode, or playback is
 * blocked. No network/file dependency, so it always works once the
 * AudioContext is allowed to run (any prior user gesture on the page).
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

    // Two-note "ding-dong" chime
    playTone(880, 0,    0.25)
    playTone(659, 0.22, 0.35)

    // Free the context once the chime has finished playing
    setTimeout(() => { ctx.close().catch(() => {}) }, 900)
  } catch { /* Web Audio unsupported — silently skip, popup + vibration still fire */ }
}

/**
 * Drop into the driver dashboard (dashboard/driver/page.tsx). Listens for
 * delivery_orders UPDATE events where driver_id newly becomes this staff
 * member's id, or an existing assignment moves to 'out_for_delivery', and
 * surfaces a sound + full-screen popup so a driver on another screen /
 * with the phone in their pocket doesn't miss the new job.
 */
export default function DriverOrderAlert({ staffId }: { staffId: string | null }) {
  const [alert, setAlert] = useState<AssignedOrder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const mp3FailedRef = useRef(false)

  useEffect(() => {
    const audio = new Audio('/sounds/order-alert.mp3')
    audio.loop = false
    audio.preload = 'auto'
    // If the file 404s or can't decode, fall back to the synthesized chime
    // for every subsequent alert instead of retrying a known-bad file.
    audio.addEventListener('error', () => { mp3FailedRef.current = true })
    audioRef.current = audio
  }, [])

  const playAlertSound = () => {
    if (mp3FailedRef.current || !audioRef.current) { playFallbackChime(); return }
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => playFallbackChime())
  }

  useEffect(() => {
    if (!staffId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`driver-alert-${staffId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_orders', filter: `driver_id=eq.${staffId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new
          const prev = payload.old
          const newlyAssigned = row.driver_id === staffId && prev.driver_id !== staffId
          const readyForPickup = row.status === 'out_for_delivery' && prev.status !== 'out_for_delivery'
          if (!newlyAssigned && !readyForPickup) return

          setAlert({
            deliveryId:   row.id,
            customerName: row.customer_name,
            addressText:  row.address_text ?? null,
            status:       row.status,
          })
          playAlertSound()
          if (navigator.vibrate) navigator.vibrate([200, 100, 200])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [staffId])

  if (!alert) return null

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="bg-emerald-500 text-white p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">
              {alert.status === 'out_for_delivery' ? 'Order Ready for Pickup' : 'New Delivery Assigned'}
            </p>
            <p className="text-emerald-50 text-sm">{alert.customerName}</p>
          </div>
        </div>
        {alert.addressText && (
          <div className="px-5 py-4 flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{alert.addressText}</span>
          </div>
        )}
        <div className="p-4 pt-0">
          <button
            onClick={() => setAlert(null)}
            className="w-full py-3 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" /> Got it
          </button>
        </div>
      </div>
    </div>
  )
}
