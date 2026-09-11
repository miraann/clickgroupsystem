// Renders a sequence of Kurdish (or mixed Kurdish/Latin) receipt lines to a
// single raster bitmap, so they print correctly on thermal printers with no
// Arabic font ROM (see raster.ts for why). One image per block keeps the
// sharp/SVG render cost to 1-2 calls per receipt instead of one per line.
import { renderSvgToBitmap, kurdishFontFaceCss } from './raster'

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

const FONT_FAMILY = 'KuReceipt'
const PAD = 6

const ROW_FONT = 26,  ROW_LINE = 36
const WIDE_FONT = 46, WIDE_LINE = 60
const TALL_FONT = 38, TALL_LINE = 50

const escXml = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Crude average-glyph-width heuristic for proportional Naskh Arabic text —
// truncates an overlong item name instead of letting it collide with the qty
// column, the same safety net the old character-column layout gave for free.
function fit(text: string, maxPx: number, fontSize: number): string {
  const avgGlyphPx = fontSize * 0.56
  const maxChars = Math.max(1, Math.floor(maxPx / avgGlyphPx))
  if (text.length <= maxChars) return text
  return text.slice(0, Math.max(1, maxChars - 1)) + '…'
}

export async function renderKurdishBlock(lines: KuLine[], widthPx: number): Promise<Uint8Array> {
  let y = 4
  const svg: string[] = []

  for (const line of lines) {
    switch (line.t) {
      case 'center': {
        const font = line.size === 'wide' ? WIDE_FONT : line.size === 'tall' ? TALL_FONT : ROW_FONT
        const lh   = line.size === 'wide' ? WIDE_LINE : line.size === 'tall' ? TALL_LINE : ROW_LINE
        y += lh
        svg.push(`<text x="${widthPx / 2}" y="${y - lh * 0.28}" font-size="${font}" font-weight="700" text-anchor="middle">${escXml(line.text)}</text>`)
        break
      }
      case 'left': {
        y += ROW_LINE
        svg.push(`<text x="${PAD}" y="${y - ROW_LINE * 0.28}" font-size="${ROW_FONT}" font-weight="700" text-anchor="start">${escXml(line.text)}</text>`)
        break
      }
      case 'row': {
        y += ROW_LINE
        const yy = y - ROW_LINE * 0.28
        svg.push(
          `<text x="${widthPx - PAD}" y="${yy}" font-size="${ROW_FONT}" font-weight="700" text-anchor="end">${escXml(line.first)}</text>`,
          `<text x="${PAD}" y="${yy}" font-size="${ROW_FONT}" font-weight="700" text-anchor="start">${escXml(line.second)}</text>`,
        )
        break
      }
      case 'item': {
        y += ROW_LINE
        const yy = y - ROW_LINE * 0.28
        const rightText = fit(line.right, widthPx * 0.42, ROW_FONT)
        svg.push(
          `<text x="${PAD}" y="${yy}" font-size="${ROW_FONT}" font-weight="700" text-anchor="start">${escXml(line.left)}</text>`,
          `<text x="${widthPx / 2}" y="${yy}" font-size="${ROW_FONT}" font-weight="700" text-anchor="middle">${escXml(line.mid)}</text>`,
          `<text x="${widthPx - PAD}" y="${yy}" font-size="${ROW_FONT}" font-weight="700" text-anchor="end">${escXml(rightText)}</text>`,
        )
        break
      }
      case 'rule': {
        y += 20
        svg.push(`<line x1="0" y1="${y - 8}" x2="${widthPx}" y2="${y - 8}" stroke="black" stroke-width="${line.heavy ? 3 : 1.5}" />`)
        break
      }
      case 'underline': {
        y += 34
        svg.push(`<line x1="${PAD}" y1="${y - 6}" x2="${widthPx - PAD}" y2="${y - 6}" stroke="black" stroke-width="1.5" />`)
        break
      }
      case 'blank': {
        y += 16
        break
      }
    }
  }

  const heightPx = Math.ceil(y) + 8
  const svgDoc = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">
<style>${kurdishFontFaceCss(FONT_FAMILY)} text { font-family: '${FONT_FAMILY}'; fill: #000; }</style>
<rect width="100%" height="100%" fill="#fff"/>
${svg.join('\n')}
</svg>`

  return renderSvgToBitmap(svgDoc, widthPx, heightPx)
}
