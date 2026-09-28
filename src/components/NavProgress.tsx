'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Thin top-of-screen progress bar while a route change is loading, so every
// tap gets instant feedback (like a native app) instead of a frozen screen.
//
// The App Router fetches each navigation's RSC payload with an `rsc: 1` header
// (prefetches add `next-router-prefetch`); counting those in-flight requests
// catches <Link> clicks, router.push/replace and back/forward alike.

let installed = false
let inFlight = 0
const listeners = new Set<(n: number) => void>()

function headerGetter(input: RequestInfo | URL, init?: RequestInit): ((name: string) => string | null) | null {
  const h = init?.headers ?? (input instanceof Request ? input.headers : undefined)
  if (!h) return null
  if (h instanceof Headers) return name => h.get(name)
  const entries = Array.isArray(h) ? h : Object.entries(h)
  return name => entries.find(([k]) => k.toLowerCase() === name)?.[1] ?? null
}

function isNavigationFetch(input: RequestInfo | URL, init?: RequestInit): boolean {
  const get = headerGetter(input, init)
  if (!get) return false
  if (get('next-action')) return true
  return get('rsc') === '1' && !get('next-router-prefetch') && !get('next-router-segment-prefetch')
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const originalFetch = window.fetch
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const promise = originalFetch.call(window, input, init)
    if (isNavigationFetch(input, init)) {
      inFlight++
      listeners.forEach(fn => fn(inFlight))
      const done = () => {
        inFlight = Math.max(0, inFlight - 1)
        listeners.forEach(fn => fn(inFlight))
      }
      promise.then(done, done)
    }
    return promise
  }
}

type Phase = 'idle' | 'loading' | 'done'

export default function NavProgress() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const finishRef = useRef<() => void>(() => {})

  useEffect(() => {
    const set = (p: Phase) => {
      phaseRef.current = p
      setPhase(p)
    }
    const finish = () => {
      clearTimeout(showTimer.current)
      if (phaseRef.current !== 'loading') return
      set('done')
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => set('idle'), 400)
    }
    const onChange = (n: number) => {
      if (n === 0) return finish()
      clearTimeout(hideTimer.current)
      // Only show for loads slow enough to notice.
      if (phaseRef.current !== 'loading') {
        clearTimeout(showTimer.current)
        showTimer.current = setTimeout(() => set('loading'), 120)
      }
    }
    install()
    listeners.add(onChange)
    finishRef.current = finish
    return () => {
      listeners.delete(onChange)
      clearTimeout(showTimer.current)
      clearTimeout(hideTimer.current)
    }
  }, [])

  // The new screen is on — complete the bar even if its payload is still streaming.
  useEffect(() => { finishRef.current() }, [pathname])

  if (phase === 'idle') return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] h-[3px]">
      <div
        className="h-full"
        style={{
          background: 'var(--app-primary, #f59e0b)',
          boxShadow: '0 0 8px var(--app-primary, #f59e0b)',
          width: phase === 'done' ? '100%' : undefined,
          opacity: phase === 'done' ? 0 : 1,
          animation: phase === 'loading' ? 'cg-nav-progress 8s cubic-bezier(.08,.7,.2,1) forwards' : undefined,
          transition: phase === 'done' ? 'width .18s ease-out, opacity .2s ease .18s' : undefined,
        }}
      />
    </div>
  )
}
