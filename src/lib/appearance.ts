// Background-theme maths shared by Settings → Appearance (live preview) and
// AppearanceBgProvider (applies the saved choice on every restaurant screen).

export const GRADIENT_PRESETS = [
  { id: 'gradient-ocean',   label: 'Ocean',   bg: 'linear-gradient(135deg, #050c18 0%, #1e3a8a 45%, #050c18 100%)',            anchor: '#050c18' },
  { id: 'gradient-sunset',  label: 'Sunset',  bg: 'linear-gradient(135deg, #120303 0%, #7f1d1d 40%, #4a1505 100%)',            anchor: '#120303' },
  { id: 'gradient-emerald', label: 'Emerald', bg: 'linear-gradient(135deg, #011a14 0%, #065f46 45%, #011a14 100%)',            anchor: '#011a14' },
  { id: 'gradient-galaxy',  label: 'Galaxy',  bg: 'linear-gradient(135deg, #08061a 0%, #312e81 45%, #08061a 100%)',            anchor: '#08061a' },
  { id: 'gradient-aurora',  label: 'Aurora',  bg: 'linear-gradient(135deg, #021a1a 0%, #134e4a 35%, #2e1065 70%, #021a1a 100%)', anchor: '#021a1a' },
  { id: 'gradient-rose',    label: 'Rose',    bg: 'linear-gradient(135deg, #110309 0%, #831843 45%, #110309 100%)',            anchor: '#110309' },
] as const

// The "White" preset: soft grey-white page, pure white header/footer bars
export const LIGHT_BG     = '#eef2f7'
export const LIGHT_ANCHOR = '#ffffff'

// Stock text colours for each side; crossing between a dark and a light
// background swaps between them so text stays readable
export const TEXT_ON_DARK  = { text: '#ffffff', muted: '#94a3b8' }
export const TEXT_ON_LIGHT = { text: '#0f172a', muted: '#64748b' }

function rgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

export function computeBg(style: string, cc: string, ct: string): string {
  if (style === 'default')  return '#022658'
  if (style === 'midnight') return '#09090b'
  if (style === 'colorful') return 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)'
  if (style === 'purple')   return '#3b0764'
  if (style === 'light')    return LIGHT_BG
  const gp = GRADIENT_PRESETS.find(g => g.id === style)
  if (gp) return gp.bg
  if (ct === 'gradient') {
    const { r, g, b } = rgb(cc)
    return `linear-gradient(135deg, rgb(${Math.floor(r*.2)},${Math.floor(g*.2)},${Math.floor(b*.2)}) 0%, ${cc} 55%, rgb(${Math.floor(r*.3)},${Math.floor(g*.3)},${Math.floor(b*.3)}) 100%)`
  }
  return cc
}

export function computeAnchor(style: string, cc: string, ct: string): string {
  if (style === 'default')  return '#022658'
  if (style === 'midnight') return '#09090b'
  if (style === 'colorful') return '#24243e'
  if (style === 'purple')   return '#3b0764'
  if (style === 'light')    return LIGHT_ANCHOR
  const gp = GRADIENT_PRESETS.find(g => g.id === style)
  if (gp) return gp.anchor
  return ct === 'solid' ? cc : '#0d0d0d'
}

/** Perceived brightness above ~2/3 — dark text and the light UI read better on it. */
export function isLightHex(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false
  const { r, g, b } = rgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 170
}

/** Whether the screens need the light UI (html.app-light, see globals.css). */
export function isLightBg(style: string, cc: string, ct: string): boolean {
  if (style === 'light') return true
  return style === 'custom' && ct === 'solid' && isLightHex(cc)
}

export interface AppearanceVars {
  bg:        string
  anchor:    string
  primary:   string
  text:      string
  textMuted: string
  light:     boolean
}

export function applyAppearance({ bg, anchor, primary, text, textMuted, light }: AppearanceVars) {
  const { r, g, b } = rgb(anchor)
  const root = document.documentElement
  root.style.setProperty('--app-bg',         bg)
  root.style.setProperty('--app-anchor',     anchor)
  root.style.setProperty('--app-anchor-80',  `rgba(${r},${g},${b},0.80)`)
  root.style.setProperty('--app-anchor-90',  `rgba(${r},${g},${b},0.90)`)
  root.style.setProperty('--app-anchor-95',  `rgba(${r},${g},${b},0.95)`)
  root.style.setProperty('--app-primary',    primary)
  root.style.setProperty('--app-text',       text)
  root.style.setProperty('--app-text-muted', textMuted)
  root.classList.toggle('app-light', light)
}

/** Undo the text colours and light UI so non-restaurant pages get their defaults back. */
export function clearAppearanceText() {
  const root = document.documentElement
  root.style.removeProperty('--app-text')
  root.style.removeProperty('--app-text-muted')
  root.classList.remove('app-light')
}
