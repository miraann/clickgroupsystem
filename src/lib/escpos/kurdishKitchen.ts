// Kurdish-language kitchen ticket — same content/order as the English path
// in kitchen.ts, but rendered to a raster bitmap (kurdishRender.ts) instead
// of raw text bytes, since most thermal printers have no Arabic font ROM.
// See kurdishReceipt.ts for the same approach on the customer receipt.
import { escpos, concat } from './commands'
import { printableWidthPx } from './raster'
import { renderKurdishBlock, KuLine } from './kurdishRender'
import { KU_KITCHEN as K, kuTableLabel } from './kurdish'
import type { KitchenPayload } from './kitchen'

export async function buildKurdishKitchenBytes(d: KitchenPayload): Promise<Uint8Array> {
  const widthPx = printableWidthPx(d.paperWidth)
  const tableLabel = kuTableLabel(d.tableNum)

  const lines: KuLine[] = [
    { t: 'center', text: K.title, size: 'wide' },
    { t: 'rule', heavy: true },

    d.orderNum
      ? { t: 'row', first: tableLabel, second: d.orderNum }
      : { t: 'right', text: tableLabel },
    { t: 'right', text: `${d.dateStr}  ${d.timeStr}` },
    { t: 'rule' },

    ...d.items.flatMap(item => {
      const rows: KuLine[] = [
        { t: 'row', first: item.name, second: `${String(item.qty).padStart(2, '0')}x` },
      ]
      if (item.note?.trim()) rows.push({ t: 'right', text: `» ${item.note.trim()}` })
      return rows
    }),

    { t: 'rule', heavy: true },
  ]

  const bitmap = await renderKurdishBlock(lines, widthPx)
  return concat(escpos.init(), escpos.doubleStrike(true), escpos.alignLeft(), bitmap, escpos.feed(4), escpos.cut())
}
