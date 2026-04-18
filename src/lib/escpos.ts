// ESC/POS thermal printer byte generation

const ESC = 0x1b
const GS  = 0x1d

const cmd = (...bytes: number[]) => new Uint8Array(bytes)
const enc = (s: string)          => new TextEncoder().encode(s)

export const escpos = {
  init:         () => cmd(ESC, 0x40),
  alignLeft:    () => cmd(ESC, 0x61, 0x00),
  alignCenter:  () => cmd(ESC, 0x61, 0x01),
  alignRight:   () => cmd(ESC, 0x61, 0x02),
  boldOn:       () => cmd(ESC, 0x45, 0x01),
  boldOff:      () => cmd(ESC, 0x45, 0x00),
  doubleHeight: () => cmd(GS,  0x21, 0x01),
  doubleSize:   () => cmd(GS,  0x21, 0x11),
  normalSize:   () => cmd(GS,  0x21, 0x00),
  feed:         (n = 3) => cmd(ESC, 0x64, n),
  cut:          () => cmd(GS,  0x56, 0x41, 0x05),
  text:         (s: string) => enc(s),
}

function cols(paperWidth: number): number {
  if (paperWidth <= 58) return 32
  if (paperWidth <= 80) return 42
  return 48
}

function twoCol(left: string, right: string, width: number): string {
  const space = width - right.length
  const l = left.length >= space ? left.slice(0, space - 1) + ' ' : left.padEnd(space)
  return l + right + '\n'
}

function divider(width: number, char = '-'): string {
  return char.repeat(width) + '\n'
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

export interface ReceiptPayload {
  restaurantName: string
  address?:       string | null
  phone?:         string | null
  tableNum:       string
  invoiceNum:     string
  orderNum:       string
  cashier:        string
  dateStr:        string
  timeStr:        string
  items:          { name: string; qty: number; price: number }[]
  subtotal:       number
  discount:       number
  surcharge:      number
  total:          number
  paymentMethod:  string
  amountPaid:     number
  change:         number
  currencySymbol: string
  thankYouMsg:    string
  paperWidth:     number
  note?:          string | null
}

export function buildReceiptBytes(d: ReceiptPayload): Uint8Array {
  const W   = cols(d.paperWidth)
  const t   = (s: string) => enc(s)
  const fmt = (n: number) => `${d.currencySymbol}${n.toLocaleString('en-US')}`

  const parts: Uint8Array[] = [
    escpos.init(),

    // Header
    escpos.alignCenter(),
    escpos.boldOn(), escpos.doubleSize(),
    t(d.restaurantName.toUpperCase() + '\n'),
    escpos.normalSize(), escpos.boldOff(),
    ...(d.phone   ? [t(d.phone   + '\n')] : []),
    ...(d.address ? [t(d.address + '\n')] : []),
    t('\n'),

    // Meta
    escpos.alignLeft(),
    t(divider(W)),
    t(twoCol('Date:',    d.dateStr,    W)),
    t(twoCol('Time:',    d.timeStr,    W)),
    t(twoCol('Invoice:', d.invoiceNum, W)),
    t(twoCol('Order:',   d.orderNum,   W)),
    t(twoCol('Table:',   d.tableNum,   W)),
    t(twoCol('Cashier:', d.cashier,    W)),
    t(divider(W)),

    // Items
    ...d.items.flatMap(item => [
      escpos.boldOn(),
      t(item.name.slice(0, W) + '\n'),
      escpos.boldOff(),
      t(twoCol(`  x${item.qty}  @${fmt(item.price)}`, fmt(item.price * item.qty), W)),
    ]),

    // Totals
    t(divider(W)),
    t(twoCol('Subtotal:', fmt(d.subtotal), W)),
    ...(d.discount  > 0 ? [t(twoCol('Discount:',  `-${fmt(d.discount)}`,  W))] : []),
    ...(d.surcharge > 0 ? [t(twoCol('Surcharge:', `+${fmt(d.surcharge)}`, W))] : []),
    t(divider(W, '=')),
    escpos.boldOn(), escpos.doubleHeight(),
    t(twoCol('TOTAL:', fmt(d.total), W)),
    escpos.normalSize(), escpos.boldOff(),
    t(divider(W)),
    t(twoCol('Payment:', d.paymentMethod.toUpperCase(), W)),
    t(twoCol('Paid:',    fmt(d.amountPaid), W)),
    ...(d.change > 0 ? [t(twoCol('Change:', fmt(d.change), W))] : []),

    // Note
    ...(d.note?.trim() ? [
      t(divider(W)),
      escpos.alignCenter(),
      t(d.note.trim() + '\n'),
    ] : []),

    // Footer
    t(divider(W)),
    escpos.alignCenter(),
    t('\n' + d.thankYouMsg + '\n'),

    // Feed + cut
    escpos.feed(4),
    escpos.cut(),
  ]

  return concat(...parts)
}
