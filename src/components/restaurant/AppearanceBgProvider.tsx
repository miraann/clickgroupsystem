'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

let _cache: { bg: string; anchor: string; primary: string; text: string; textMuted: string } | null = null
let _cacheFor: string | null = null

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

const GRADIENT_PRESETS: { id: string; bg: string; anchor: string }[] = [
  { id: 'gradient-ocean',   bg: 'linear-gradient(135deg, #050c18 0%, #1e3a8a 45%, #050c18 100%)',            anchor: '#050c18' },
  { id: 'gradient-sunset',  bg: 'linear-gradient(135deg, #120303 0%, #7f1d1d 40%, #4a1505 100%)',            anchor: '#120303' },
  { id: 'gradient-emerald', bg: 'linear-gradient(135deg, #011a14 0%, #065f46 45%, #011a14 100%)',            anchor: '#011a14' },
  { id: 'gradient-galaxy',  bg: 'linear-gradient(135deg, #08061a 0%, #312e81 45%, #08061a 100%)',            anchor: '#08061a' },
  { id: 'gradient-aurora',  bg: 'linear-gradient(135deg, #021a1a 0%, #134e4a 35%, #2e1065 70%, #021a1a 100%)', anchor: '#021a1a' },
  { id: 'gradient-rose',    bg: 'linear-gradient(135deg, #110309 0%, #831843 45%, #110309 100%)',            anchor: '#110309' },
]

function computeBg(style: string, cc: string, ct: string): string {
  if (style === 'default')  return '#022658'
  if (style === 'midnight') return '#09090b'
  if (style === 'colorful') return 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)'
  if (style === 'purple')   return '#3b0764'
  const gp = GRADIENT_PRESETS.find(g => g.id === style)
  if (gp) return gp.bg
  if (ct === 'gradient') {
    const { r, g, b } = hexToRgb(cc)
    return `linear-gradient(135deg, rgb(${Math.floor(r*.2)},${Math.floor(g*.2)},${Math.floor(b*.2)}) 0%, ${cc} 55%, rgb(${Math.floor(r*.3)},${Math.floor(g*.3)},${Math.floor(b*.3)}) 100%)`
  }
  return cc
}

function computeAnchor(style: string, cc: string, ct: string): string {
  if (style === 'default')  return '#022658'
  if (style === 'midnight') return '#09090b'
  if (style === 'colorful') return '#24243e'
  if (style === 'purple')   return '#3b0764'
  const gp = GRADIENT_PRESETS.find(g => g.id === style)
  if (gp) return gp.anchor
  return ct === 'solid' ? cc : '#0d0d0d'
}

function applyVars(anchor: string, bg: string, primary: string, text = '#ffffff', textMuted = '#94a3b8') {
  const { r, g, b } = hexToRgb(anchor)
  const root = document.documentElement
  root.style.setProperty('--app-bg',         bg)
  root.style.setProperty('--app-anchor',      anchor)
  root.style.setProperty('--app-anchor-80',   `rgba(${r},${g},${b},0.80)`)
  root.style.setProperty('--app-anchor-90',   `rgba(${r},${g},${b},0.90)`)
  root.style.setProperty('--app-anchor-95',   `rgba(${r},${g},${b},0.95)`)
  root.style.setProperty('--app-primary',     primary)
  root.style.setProperty('--app-text',        text)
  root.style.setProperty('--app-text-muted',  textMuted)
}

export default function AppearanceBgProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const id = localStorage.getItem('restaurant_id')
    if (!id) return

    // Instant paint from cache to avoid flash
    const stored = localStorage.getItem('_app_bg_cache')
    if (stored) {
      try {
        const c = JSON.parse(stored)
        if (c.forId === id) applyVars(c.anchor, c.bg, c.primary || '#f59e0b', c.text || '#ffffff', c.textMuted || '#94a3b8')
      } catch {}
    }

    if (_cache && _cacheFor === id) {
      applyVars(_cache.anchor, _cache.bg, _cache.primary, _cache.text, _cache.textMuted)
      return
    }

    const supabase = createClient()
    supabase.from('restaurants').select('settings').eq('id', id).maybeSingle()
      .then(({ data }) => {
        const s         = (data?.settings ?? {}) as Record<string, unknown>
        const style     = (s.sidebar_style        as string) || 'default'
        const cc        = (s.sidebar_custom_color as string) || '#022658'
        const ct        = (s.sidebar_custom_type  as string) || 'solid'
        const primary   = (s.primary_color        as string) || '#f59e0b'
        const text      = (s.text_color           as string) || '#ffffff'
        const textMuted = (s.text_muted_color     as string) || '#94a3b8'
        const bg        = computeBg(style, cc, ct)
        const anchor    = computeAnchor(style, cc, ct)
        _cache    = { bg, anchor, primary, text, textMuted }
        _cacheFor = id
        applyVars(anchor, bg, primary, text, textMuted)
        localStorage.setItem('_app_bg_cache', JSON.stringify({ forId: id, bg, anchor, primary, text, textMuted }))
      })
  }, [])

  return <>{children}</>
}
