'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Soft fade on route change. It animates the same wrapper instead of re-keying
// it by pathname, so nested layouts (settings, menu) keep their state and are
// not torn down and rebuilt on every navigation.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    ref.current?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })
  }, [pathname])

  return <div ref={ref}>{children}</div>
}
