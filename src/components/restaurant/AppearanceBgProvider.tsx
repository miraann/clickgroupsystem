'use client'
import { useEffect } from 'react'
import { useRestaurant } from '@/hooks/useRestaurant'
import { applyAppearance, clearAppearanceText, computeAnchor, computeBg, isLightBg } from '@/lib/appearance'

export default function AppearanceBgProvider({ children }: { children: React.ReactNode }) {
  const { restaurant } = useRestaurant()

  // Instant paint from the localStorage cache to avoid a flash before the
  // shared restaurant row resolves.
  useEffect(() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
    if (!id) return
    try {
      const stored = localStorage.getItem('_app_bg_cache')
      if (!stored) return
      const c = JSON.parse(stored)
      if (c.forId === id) applyAppearance({
        bg: c.bg, anchor: c.anchor,
        primary:   c.primary   || '#f59e0b',
        text:      c.text      || '#ffffff',
        textMuted: c.textMuted || '#94a3b8',
        light:     c.light === true,
      })
    } catch {}
  }, [])

  // Recompute + apply whenever the shared settings blob changes.
  useEffect(() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
    if (!id || !restaurant) return
    const s         = restaurant.settings ?? {}
    const style     = (s.sidebar_style        as string) || 'default'
    const cc        = (s.sidebar_custom_color as string) || '#022658'
    const ct        = (s.sidebar_custom_type  as string) || 'solid'
    const primary   = (s.primary_color        as string) || '#f59e0b'
    const text      = (s.text_color           as string) || '#ffffff'
    const textMuted = (s.text_muted_color     as string) || '#94a3b8'
    const bg        = computeBg(style, cc, ct)
    const anchor    = computeAnchor(style, cc, ct)
    const light     = isLightBg(style, cc, ct)
    applyAppearance({ bg, anchor, primary, text, textMuted, light })
    try {
      localStorage.setItem('_app_bg_cache', JSON.stringify({ forId: id, bg, anchor, primary, text, textMuted, light }))
    } catch {}
  }, [restaurant])

  // Leaving the restaurant screens (logout, public pages) — don't carry
  // dark text or the light UI onto pages styled for the default theme.
  useEffect(() => clearAppearanceText, [])

  return <>{children}</>
}
