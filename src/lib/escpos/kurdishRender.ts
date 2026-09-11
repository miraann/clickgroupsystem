// Renders a sequence of Kurdish (or mixed Kurdish/Latin) receipt lines to a
// single raster bitmap, so they print correctly on thermal printers with no
// Arabic font ROM (see raster.ts for why). One image per block keeps the
// render cost to 1-2 canvas draws per receipt instead of one per line.
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas'
import { gsv0, packMonochromeRgba, ensureKurdishFontsRegistered, KU_FONT_FAMILY } from './raster'

export type KuLine =
  | { t: 'center'; text: string; size?: 'normal' | 'wide' | 'tall' }
  | { t: 'left';   text: string }
  // Two independently-anchored strings on one line — `first` sits at the
  // right edge, `second` at the left, mirroring the RTL column swap that
  // receipt.ts's row() helper used to do with monospace text.
  | { t: 'row'; first: string; second: string }
  // Three independently-anchored strings — `left` at the left edge, `mid`
  // centered, `right` at the right edge — mirroring threeColBytes().
  | { t: 'item'; left: string; mid: string; right: string }
  | { t: 'rule'; heavy?: boolean }
  | { t: 'underline' }
  | { t: 'blank' }

const PAD = 6

const ROW_FONT = 26,  ROW_LINE = 36
const WIDE_FONT = 46, WIDE_LINE = 60
const TALL_FONT = 38, TALL_LINE = 50

type TextOp = { kind: 'text'; x: number; y: number; text: string; align: 'left' | 'right' | 'center'; fontPx: number }
type LineOp = { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
type DrawOp = TextOp | LineOp

const font = (px: number) => `${px}px "${KU_FONT_FAMILY}"`

// The bundled font has only one weight — bold is faked with a stroke+fill
// outline (proportional to font size) instead of a font-weight switch.
const FAUX_BOLD_RATIO = 0.045

// Arabic-script ranges (covers Kurdish's extra Sorani letters too). A line
// with no strong-RTL characters (a phone number, an invoice code, a plain
// date) must be drawn with direction 'ltr' — forcing 'rtl' on a string like
// "0750 123 4567" makes the canvas reorder its space-separated digit groups
// right-to-left even though each group itself stays left-to-right, which
// visually reverses it to "4567 123 0750".
const RTL_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const hasRtl = (text: string) => RTL_RE.test(text)

// Truncates an overlong item name (with an ellipsis) instead of letting it
// collide with the qty column — measured precisely against the real font
// metrics rather than guessed, now that we have a real canvas context.
function fit(ctx: SKRSContext2D, text: string, maxPx: number, fontPx: number): string {
  ctx.font = font(fontPx)
  if (ctx.measureText(text).width <= maxPx) return text
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxPx) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? text.slice(0, lo) + '…' : '…'
}

function layout(measureCtx: SKRSContext2D, lines: KuLine[], widthPx: number): { heightPx: number; ops: DrawOp[] } {
  let y = 4
  const ops: DrawOp[] = []

  for (const line of lines) {
    switch (line.t) {
      case 'center': {
        const fontPx = line.size === 'wide' ? WIDE_FONT : line.size === 'tall' ? TALL_FONT : ROW_FONT
        const lh     = line.size === 'wide' ? WIDE_LINE : line.size === 'tall' ? TALL_LINE : ROW_LINE
        y += lh
        ops.push({ kind: 'text', x: widthPx / 2, y: y - lh * 0.28, text: line.text, align: 'center', fontPx })
        break
      }
      case 'left': {
        y += ROW_LINE
        ops.push({ kind: 'text', x: PAD, y: y - ROW_LINE * 0.28, text: line.text, align: 'left', fontPx: ROW_FONT })
        break
      }
      case 'row': {
        y += ROW_LINE
        const yy = y - ROW_LINE * 0.28
        ops.push(
          { kind: 'text', x: widthPx - PAD, y: yy, text: line.first,  align: 'right', fontPx: ROW_FONT },
          { kind: 'text', x: PAD,           y: yy, text: line.second, align: 'left',  fontPx: ROW_FONT },
        )
        break
      }
      case 'item': {
        y += ROW_LINE
        const yy = y - ROW_LINE * 0.28
        const rightText = fit(measureCtx, line.right, widthPx * 0.42, ROW_FONT)
        ops.push(
          { kind: 'text', x: PAD,             y: yy, text: line.left,   align: 'left',   fontPx: ROW_FONT },
          { kind: 'text', x: widthPx / 2,      y: yy, text: line.mid,    align: 'center', fontPx: ROW_FONT },
          { kind: 'text', x: widthPx - PAD,    y: yy, text: rightText,   align: 'right',  fontPx: ROW_FONT },
        )
        break
      }
      case 'rule': {
        y += 20
        ops.push({ kind: 'line', x1: 0, y1: y - 8, x2: widthPx, y2: y - 8, width: line.heavy ? 3 : 1.5 })
        break
      }
      case 'underline': {
        y += 34
        ops.push({ kind: 'line', x1: PAD, y1: y - 6, x2: widthPx - PAD, y2: y - 6, width: 1.5 })
        break
      }
      case 'blank': {
        y += 16
        break
      }
    }
  }

  return { heightPx: Math.ceil(y) + 8, ops }
}

export async function renderKurdishBlock(lines: KuLine[], widthPx: number): Promise<Uint8Array> {
  ensureKurdishFontsRegistered()

  // A throwaway context just to measure text for layout/truncation before the
  // final canvas (whose exact height depends on that layout) is created.
  const measureCtx = createCanvas(1, 1).getContext('2d')
  const { heightPx, ops } = layout(measureCtx, lines, widthPx)

  const canvas = createCanvas(widthPx, heightPx)
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.lineJoin = 'round'

  for (const op of ops) {
    if (op.kind === 'text') {
      ctx.font = font(op.fontPx)
      ctx.textAlign = op.align
      // Per-line, not global: a pure-Latin/digit string (phone number,
      // invoice code) must stay 'ltr' or its space-separated tokens get
      // reordered — see the note on hasRtl() above.
      ctx.direction = hasRtl(op.text) ? 'rtl' : 'ltr'
      ctx.lineWidth = op.fontPx * FAUX_BOLD_RATIO
      ctx.strokeText(op.text, op.x, op.y)
      ctx.fillText(op.text, op.x, op.y)
    } else {
      ctx.lineWidth = op.width
      ctx.beginPath()
      ctx.moveTo(op.x1, op.y1)
      ctx.lineTo(op.x2, op.y2)
      ctx.stroke()
    }
  }

  const { data } = ctx.getImageData(0, 0, widthPx, heightPx)
  const packed = packMonochromeRgba(data, widthPx, heightPx)
  return gsv0(packed, widthPx, heightPx)
}
