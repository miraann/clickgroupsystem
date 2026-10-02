'use client'
import type { CSSProperties } from 'react'
import { useRestaurant } from '@/hooks/useRestaurant'

// Fill per button when the style is "vibrant"
const VIBRANT: Record<string, string> = {
  back:    '#6366f1',
  home:    '#f59e0b',
  refresh: '#10b981',
  driver:  '#8b5cf6',
  logout:  '#f43f5e',
}

function hexAlpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

/**
 * Look of the header nav buttons (back / home / refresh …), following the
 * "Button Style" picked in Settings → Appearance and the background theme.
 * Put `navCn` in className and `navStyle(key)` in style.
 */
export function useNavButtonStyle() {
  const { restaurant } = useRestaurant()
  const s       = (restaurant?.settings ?? {}) as Record<string, unknown>
  const style   = (s.nav_button_style as string) || 'glass'
  const primary = (s.primary_color    as string) || '#f59e0b'

  const navCn = style === 'glass'
    ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
    : 'hover:brightness-110'

  const navStyle = (key: string): CSSProperties => {
    if (style === 'vibrant') {
      const c = VIBRANT[key] ?? primary
      return { background: c, border: `1px solid ${c}`, color: '#ffffff', boxShadow: `0 4px 14px ${hexAlpha(c, 0.40)}` }
    }
    if (style === 'neon') {
      return { background: 'var(--app-well, rgba(0,0,0,0.40))', border:`1px solid ${hexAlpha(primary, 0.68)}`, color: primary, boxShadow: `0 0 10px ${hexAlpha(primary, 0.26)}` }
    }
    if (style === 'crystal') {
      return {
        background: 'linear-gradient(135deg, rgb(var(--ov) / 0.13) 0%, rgb(var(--ov) / 0.05) 100%)',
        border:     '1px solid rgb(var(--ov) / 0.22)',
        color:      'color-mix(in srgb, var(--app-text, #ffffff) 80%, transparent)',
      }
    }
    return {}
  }

  return { navCn, navStyle }
}
