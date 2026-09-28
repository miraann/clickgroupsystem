/**
 * Text colour that stays readable on a solid `hex` background in the public
 * menus — black on very light menu colours (neon green, yellow…), white on
 * everything else. The threshold keeps white on the default amber, matching
 * the original design.
 */
export function textOnAccent(hex: string): '#000' | '#fff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return luminance > 0.5 ? '#000' : '#fff'
}
