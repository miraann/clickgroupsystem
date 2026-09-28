'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  NATIVE_SHELL_CLASS, canSetSystemBarColor, isNativeShell, notifyAppReady, setSystemBarColor,
} from '@/lib/nativeShell'

// Inside the Android APK: drops the native splash once the first screen has
// rendered, and keeps the status / navigation bars the colour of whatever sits
// at the top of the current screen — like a native toolbar. No-op in browsers.

type RGB = [number, number, number]
type RGBA = [number, number, number, number]

const FALLBACK: RGB = [2, 38, 88] // #022658
const SENTINEL = '#010203'

let ctx: CanvasRenderingContext2D | null | undefined
let lastSent = ''

/** Resolve any CSS colour (rgb, oklch, color-mix…) to RGBA through a 1×1 canvas. */
function toRgba(css: string | null): RGBA | null {
  if (!css || css === 'transparent') return null
  if (ctx === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    ctx = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!ctx) return null
  ctx.fillStyle = SENTINEL
  ctx.fillStyle = css
  if (ctx.fillStyle === SENTINEL && css.trim().toLowerCase() !== SENTINEL) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

/** First colour stop of a computed gradient. */
function firstGradientStop(bgImage: string): string | null {
  return bgImage.match(/(?:rgba?|hsla?|oklch|oklab|lch|lab|color)\([^()]*\)/)?.[0] ?? null
}

/** The colour actually painted at the top-centre of the screen (layers composited). */
function sampleTopColor(): string | null {
  let el = document.elementFromPoint(Math.round(window.innerWidth / 2), 2)
  if (!el) return null
  const layers: RGBA[] = []
  for (; el; el = el.parentElement) {
    const cs = getComputedStyle(el)
    const c = cs.backgroundImage.includes('gradient')
      ? toRgba(firstGradientStop(cs.backgroundImage))
      : toRgba(cs.backgroundColor)
    if (!c || c[3] === 0) continue
    layers.push(c)
    if (c[3] >= 0.99) break
  }
  let rgb: RGB = FALLBACK
  const bottom = layers[layers.length - 1]
  if (bottom && bottom[3] >= 0.99) {
    rgb = [bottom[0], bottom[1], bottom[2]]
    layers.pop()
  }
  for (let i = layers.length - 1; i >= 0; i--) {
    const [r, g, b, a] = layers[i]
    rgb = [r * a + rgb[0] * (1 - a), g * a + rgb[1] * (1 - a), b * a + rgb[2] * (1 - a)]
  }
  return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function syncBars() {
  const color = sampleTopColor()
  if (color && color !== lastSent) {
    lastSent = color
    setSystemBarColor(color)
  }
}

export default function NativeShell() {
  const pathname = usePathname()

  useEffect(() => {
    if (!isNativeShell()) return
    document.documentElement.classList.add(NATIVE_SHELL_CLASS)
    const t = setTimeout(notifyAppReady, 100)
    return () => clearTimeout(t)
  }, [])

  // Re-sample after each navigation, as the new screen settles.
  useEffect(() => {
    if (!canSetSystemBarColor()) return
    const timers = [80, 450, 1500].map(ms => setTimeout(syncBars, ms))
    return () => timers.forEach(clearTimeout)
  }, [pathname])

  // …and when the restaurant's appearance colours land on <html> (AppearanceBgProvider).
  useEffect(() => {
    if (!canSetSystemBarColor()) return
    let t: ReturnType<typeof setTimeout> | undefined
    const mo = new MutationObserver(() => {
      clearTimeout(t)
      t = setTimeout(syncBars, 120)
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => {
      mo.disconnect()
      clearTimeout(t)
    }
  }, [])

  return null
}
