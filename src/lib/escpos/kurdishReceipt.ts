// Kurdish-language thermal receipt — same content/order as the English path
// in receipt.ts, but rendered to raster bitmaps (kurdishRender.ts) instead of
// raw text bytes, since most thermal printers have no Arabic font ROM.
import { escpos, concat } from './commands'
import { printableWidthPx } from './raster'
import { renderKurdishBlock, KuLine } from './kurdishRender'
import { KU, kuTableLabel } from './kurdish'
import type { ReceiptPayload } from './receipt'

export async function buildKurdishReceiptBytes(d: ReceiptPayload): Promise<Uint8Array> {
  const widthPx = printableWidthPx(d.paperWidth)
  const fmt = (n: number) => `${n.toLocaleString('en-US')}${d.currencySymbol ? ' ' + d.currencySymbol : ''}`
  const tableLabel = kuTableLabel(d.tableNum, d.guests)

  const bodyA: KuLine[] = [
    { t: 'center', text: d.restaurantName.toUpperCase(), size: 'wide' },
    ...(d.phone   ? [{ t: 'center', text: d.phone }   as KuLine] : []),
    ...(d.address ? [{ t: 'center', text: d.address } as KuLine] : []),
    { t: 'rule' },

    { t: 'row', first: d.dateStr,  second: KU.invoiceNo },
    { t: 'row', first: d.timeStr,  second: d.invoiceNum },
    { t: 'row', first: KU.employee, second: d.cashier },
    { t: 'rule' },

    { t: 'right', text: tableLabel },
    { t: 'rule' },

    { t: 'center', text: KU.paymentMethod },
    { t: 'center', text: d.paymentMethod },
    { t: 'rule' },

    { t: 'item', left: KU.price, mid: KU.qty, right: KU.item },
    { t: 'rule' },
    ...d.items.map(item => ({
      t: 'item' as const,
      left:  fmt(item.price * item.qty),
      mid:   String(item.qty),
      right: item.name,
    })),
    { t: 'rule' },

    { t: 'row', first: KU.subtotal, second: fmt(d.subtotal) },
    ...(d.discount  > 0 ? [{ t: 'row', first: KU.discount,  second: `-${fmt(d.discount)}`  } as KuLine] : []),
    ...(d.surcharge > 0 ? [{ t: 'row', first: KU.surcharge, second: `+${fmt(d.surcharge)}` } as KuLine] : []),
    { t: 'row', first: KU.total, second: fmt(d.total) },

    { t: 'rule', heavy: true },
    { t: 'center', text: KU.totalAmount },
    { t: 'center', text: fmt(d.total), size: 'tall' },
  ]

  if (d.mode === 'payment') {
    bodyA.push(
      { t: 'blank' },
      { t: 'center', text: KU.paid },
      { t: 'center', text: `${d.dateStr}  ${d.timeStr}` },
    )
  }
  bodyA.push({ t: 'rule', heavy: true })

  const bodyB: KuLine[] = []

  if (d.mode !== 'payment') {
    bodyB.push(
      { t: 'center', text: KU.yourFeedback },
      { t: 'blank' },
      { t: 'rule' },
      { t: 'right', text: KU.name },
      { t: 'underline' },
      { t: 'right', text: KU.phoneEmail },
      { t: 'underline' },
      { t: 'right', text: KU.feedback },
      { t: 'underline' },
      { t: 'underline' },
      { t: 'underline' },
      { t: 'rule' },
    )
  }

  if (d.note?.trim()) {
    bodyB.push(
      { t: 'center', text: d.note.trim() },
      { t: 'rule' },
    )
  }

  if (d.mode !== 'payment') {
    bodyB.push(
      { t: 'blank' },
      { t: 'center', text: d.thankYouMsg || 'سوپاس بۆ سەردانتان' },
      { t: 'center', text: d.poweredBy ? `Powered by ClickGroup - ${d.poweredBy}` : 'Powered by ClickGroup' },
    )
  }

  const parts: Uint8Array[] = [escpos.init(), escpos.doubleStrike(true)]

  if (d.logoBitmap) parts.push(escpos.alignCenter(), d.logoBitmap)

  parts.push(escpos.alignLeft(), await renderKurdishBlock(bodyA, widthPx))

  if (d.mode !== 'payment' && d.qrBitmap) {
    parts.push(escpos.alignCenter(), d.qrBitmap)
  }

  if (bodyB.length) {
    parts.push(escpos.alignLeft(), await renderKurdishBlock(bodyB, widthPx))
  }

  parts.push(escpos.feed(4), escpos.cut())

  return concat(...parts)
}
