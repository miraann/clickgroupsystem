import { escpos, cols, enc, divBytes, rowBytes, concat } from './commands'
import { toAscii } from './translate'
import { buildKurdishKitchenBytes } from './kurdishKitchen'

export interface KitchenPayload {
  tableNum:   string
  orderNum?:  string | null
  timeStr:    string
  dateStr:    string
  items:      { name: string; qty: number; note?: string | null }[]
  paperWidth: number
  note?:      string | null
  language?:  'ku' | 'en'
}

export async function buildKitchenBytes(d: KitchenPayload): Promise<Uint8Array> {
  // Kurdish (Sorani) needs the Arabic script plus letters most printers'
  // Arabic codepage doesn't cover — raster-render it instead of sending text
  // bytes, same approach as the customer receipt (see kurdishReceipt.ts).
  const isKu = (d.language ?? 'ku') === 'ku'
  if (isKu) return buildKurdishKitchenBytes(d)

  const W   = cols(d.paperWidth)
  const div = (ch = '-') => divBytes(W, ch)

  // Kitchen printers are the same cheap thermal units as the receipt side —
  // no Arabic/Kurdish font ROM — so force every dynamic value to printable
  // ASCII, exactly like buildReceiptBytes does. Raw UTF-8 item names print as
  // replacement garbage (or nothing) on these printers.
  const tx = (s?: string | null) => toAscii(s)

  const orderNum = tx(d.orderNum)
  const header = orderNum
    ? rowBytes(`Table ${tx(d.tableNum)}`, orderNum, W)
    : enc(`Table ${tx(d.tableNum)}\n`)

  const parts: Uint8Array[] = [
    escpos.init(),
    escpos.doubleStrike(true), // darken normal-weight text — thin single-pass print is hard to read

    // ── Header ───────────────────────────────────────────────
    escpos.alignCenter(),
    escpos.boldOn(), escpos.doubleSize(),
    enc('KITCHEN ORDER\n'),
    escpos.normalSize(), escpos.boldOff(),
    div('='),

    // ── Table + time ─────────────────────────────────────────
    escpos.alignLeft(),
    escpos.boldOn(),
    header,
    escpos.boldOff(),
    enc(`${d.dateStr}  ${d.timeStr}\n`),
    div(),

    // ── Items ─────────────────────────────────────────────────
    ...d.items.flatMap(item => {
      const qtyPad = String(item.qty).padStart(2)
      const rows: Uint8Array[] = [
        escpos.boldOn(),
        enc(` ${qtyPad}x  ${tx(item.name)}\n`),
        escpos.boldOff(),
      ]
      const n = tx(item.note)
      if (n) rows.push(enc(`      >> ${n}\n`))
      return rows
    }),

    div('='),
    escpos.feed(4),
    escpos.cut(),
  ]

  return concat(...parts)
}
