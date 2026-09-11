// Shared ESC/POS raster-bitmap primitives — used for the logo/QR bitmaps and
// for rendering whole lines of text to an image (see kurdishRender.ts) on
// printers whose font ROM can't render a given script.
import { GlobalFonts } from '@napi-rs/canvas'
import { join } from 'path'

// ESC/POS GS v 0 raster bitmap command wrapper.
export function gsv0(pixels: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const bytesPerRow = Math.ceil(widthPx / 8)
  const header = new Uint8Array([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    heightPx   & 0xff, (heightPx   >> 8) & 0xff,
  ])
  const out = new Uint8Array(header.length + pixels.length)
  out.set(header, 0)
  out.set(pixels, header.length)
  return out
}

// Packs a 1-byte-per-pixel greyscale buffer into 1-bit-per-pixel MSB-first
// rows, as GS v 0 expects. Used for the logo bitmap (sharp raw greyscale output).
export function packMonochrome(data: Buffer | Uint8Array, widthPx: number, heightPx: number, threshold = 128): Uint8Array {
  const bytesPerRow = Math.ceil(widthPx / 8)
  const packed = new Uint8Array(bytesPerRow * heightPx)
  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      if (data[y * widthPx + x] < threshold) {
        packed[y * bytesPerRow + Math.floor(x / 8)] |= 0x80 >> (x % 8)
      }
    }
  }
  return packed
}

// Same, but for a 4-byte-per-pixel RGBA buffer (canvas getImageData output) —
// used for the Kurdish text bitmap. Text is drawn pure black on white, so the
// red channel alone is a valid greyscale proxy.
export function packMonochromeRgba(data: Uint8ClampedArray | Uint8Array, widthPx: number, heightPx: number, threshold = 128): Uint8Array {
  const bytesPerRow = Math.ceil(widthPx / 8)
  const packed = new Uint8Array(bytesPerRow * heightPx)
  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const i = (y * widthPx + x) * 4
      if (data[i] < threshold) {
        packed[y * bytesPerRow + Math.floor(x / 8)] |= 0x80 >> (x % 8)
      }
    }
  }
  return packed
}

// Printable width in dots for a given paper-roll width (mm), at the
// industry-standard 8 dots/mm (203dpi). 58mm→384 and 80mm→576 are the widely
// documented print-area values for those two roll sizes; the rest extrapolate
// the same ~margin ratio for the newer presets in Settings → Device → Printers.
export function printableWidthPx(paperWidthMm: number): number {
  if (paperWidthMm <= 48)  return 288
  if (paperWidthMm <= 58)  return 384
  if (paperWidthMm <= 72)  return 512
  if (paperWidthMm <= 80)  return 576
  if (paperWidthMm <= 104) return 768
  return 832
}

// Kurdish (Sorani) uses the Arabic script plus a handful of extra letters
// (ڕ ڵ ۆ ێ ھ چ گ پ ژ) that most thermal printers' Arabic codepage doesn't
// include, and most have no Arabic font ROM at all — so text bytes print as
// replacement garbage. Noto Naskh Arabic covers the full Kurdish letter set
// (and Latin/digits for dates, prices, invoice numbers, …), so lines that need
// it are rendered to a bitmap server-side (via @napi-rs/canvas, which bundles
// its own text-shaping engine and doesn't depend on the OS/container having
// fontconfig or Arabic fonts installed — unlike SVG-via-librsvg, whose
// embedded-font support varies by platform and isn't guaranteed on every
// serverless runtime) and printed as an image instead — that works on any
// ESC/POS printer regardless of firmware font support.
export const KU_FONT_FAMILY = 'KuReceipt'

let fontsRegistered = false
export function ensureKurdishFontsRegistered(): void {
  if (fontsRegistered) return
  const fontsDir = join(__dirname, 'fonts')
  GlobalFonts.registerFromPath(join(fontsDir, 'NotoNaskhArabic-Regular.ttf'), KU_FONT_FAMILY)
  GlobalFonts.registerFromPath(join(fontsDir, 'NotoNaskhArabic-Bold.ttf'),    KU_FONT_FAMILY)
  fontsRegistered = true
}
