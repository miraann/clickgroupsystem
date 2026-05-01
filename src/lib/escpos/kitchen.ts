import { escpos, cols, enc, divBytes, rowBytes, concat } from './commands'

export interface KitchenPayload {
  tableNum:   string
  orderNum?:  string | null
  timeStr:    string
  dateStr:    string
  items:      { name: string; qty: number; note?: string | null }[]
  paperWidth: number
  note?:      string | null
}

export function buildKitchenBytes(d: KitchenPayload): Uint8Array {
  const W   = cols(d.paperWidth)
  const div = (ch = '-') => divBytes(W, ch)

  const header = d.orderNum
    ? rowBytes(`Table ${d.tableNum}`, d.orderNum, W)
    : enc(`Table ${d.tableNum}\n`)

  const parts: Uint8Array[] = [
    escpos.init(),
    escpos.doubleStrike(true),

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
        enc(` ${qtyPad}x  ${item.name}\n`),
        escpos.boldOff(),
      ]
      if (item.note?.trim()) rows.push(enc(`      >> ${item.note.trim()}\n`))
      return rows
    }),

    div('='),
    escpos.feed(4),
    escpos.cut(),
  ]

  return concat(...parts)
}
