// ESC/POS thermal printer byte generation

const ESC = 0x1b
const GS  = 0x1d

const cmd = (...bytes: number[]) => new Uint8Array(bytes)
const enc = (s: string)          => new TextEncoder().encode(s)

export const escpos = {
  init:         () => cmd(ESC, 0x40),
  doubleStrike: (on: boolean) => cmd(ESC, 0x47, on ? 0x01 : 0x00),
  alignLeft:    () => cmd(ESC, 0x61, 0x00),
  alignCenter:  () => cmd(ESC, 0x61, 0x01),
  alignRight:   () => cmd(ESC, 0x61, 0x02),
  boldOn:       () => cmd(ESC, 0x45, 0x01),
  boldOff:      () => cmd(ESC, 0x45, 0x00),
  doubleHeight: () => cmd(ESC, 0x21, 0x10),
  doubleSize:   () => cmd(ESC, 0x21, 0x30),
  normalSize:   () => cmd(ESC, 0x21, 0x00),
  feed:         (n = 3) => cmd(ESC, 0x64, n),
  cut:          () => cmd(GS,  0x56, 0x42, 0x10),
}

function cols(paperWidth: number): number {
  if (paperWidth <= 58) return 32
  if (paperWidth <= 80) return 42
  return 48
}

// Left-right two-column row — returns encoded Uint8Array
function rowBytes(left: string, right: string, width: number): Uint8Array {
  const space = width - right.length
  const l = left.length >= space ? left.slice(0, space - 1) + ' ' : left.padEnd(space)
  return enc(l + right + '\n')
}

// Three-column row: Item | Qty | Price — returns encoded Uint8Array
function threeColBytes(left: string, mid: string, right: string, width: number): Uint8Array {
  const rightW = Math.min(14, Math.floor(width * 0.35))  // wider for "10,000 IQD"
  const midW   = 6
  const leftW  = width - midW - rightW
  const l = left.length > leftW ? left.slice(0, leftW - 1) + ' ' : left.padEnd(leftW)
  // center qty within its column
  const pad = midW - mid.length
  const lPad = Math.floor(pad / 2)
  const m = ' '.repeat(Math.max(0, lPad)) + mid + ' '.repeat(Math.max(0, pad - lPad))
  const r = right.padStart(rightW)
  return enc(l + m + r + '\n')
}

// Plain ASCII divider — returns encoded Uint8Array
function divBytes(width: number, char = '-'): Uint8Array {
  return enc(char.repeat(width) + '\n')
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out   = new Uint8Array(total)
  let offset  = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

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

export interface ReceiptPayload {
  restaurantName: string
  address?:       string | null
  phone?:         string | null
  tableNum:       string
  guests?:        number
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
  mode?:          'receipt' | 'payment'
  poweredBy?:     string | null
  logoBitmap?:    Uint8Array | null
  qrBitmap?:      Uint8Array | null
}

export function buildReceiptBytes(d: ReceiptPayload): Uint8Array {
  const W   = cols(d.paperWidth)
  const fmt = (n: number) => `${n.toLocaleString('en-US')}${d.currencySymbol ? ' ' + d.currencySymbol : ''}`
  const div = (ch = '-')  => divBytes(W, ch)
  const row = (l: string, r: string) => rowBytes(l, r, W)

  const tableLabel = d.guests
    ? `Table ${d.tableNum} - ${d.guests} guests`
    : `Table ${d.tableNum}`

  const parts: Uint8Array[] = [
    escpos.init(),
    escpos.doubleStrike(true),

    // ── Logo bitmap (centered) ────────────────────────────
    ...(d.logoBitmap ? [escpos.alignCenter(), d.logoBitmap] : []),

    // ── Restaurant name + contact (centered) ──────────────
    escpos.alignCenter(),
    escpos.boldOn(), escpos.doubleSize(),
    enc(d.restaurantName.toUpperCase() + '\n'),
    escpos.normalSize(), escpos.boldOff(),
    ...(d.phone   ? [enc(d.phone   + '\n')] : []),
    ...(d.address ? [enc(d.address + '\n')] : []),

    // ── Date | Invoice two-column header ──────────────────
    escpos.alignLeft(),
    div(),
    row(d.dateStr,  'Invoice No.'),
    row(d.timeStr,  d.invoiceNum),
    row('Cashier',  'Employee'),
    row(d.cashier,  d.cashier),
    div(),

    // ── Table - guests | Order number ─────────────────────
    row(tableLabel, d.orderNum),
    div(),

    // ── Payment method (centered) ─────────────────────────
    escpos.alignCenter(),
    enc('Payment Method\n'),
    escpos.boldOn(),
    enc(d.paymentMethod + '\n'),
    escpos.boldOff(),
    escpos.alignLeft(),
    div(),

    // ── Items header ──────────────────────────────────────
    escpos.boldOn(),
    threeColBytes('Item', 'Qty', 'Price', W),
    escpos.boldOff(),
    div(),

    // ── Items ─────────────────────────────────────────────
    ...d.items.map(item =>
      threeColBytes(item.name, String(item.qty), fmt(item.price * item.qty), W)
    ),
    div(),

    // ── Totals ────────────────────────────────────────────
    row('Subtotal', fmt(d.subtotal)),
    ...(d.discount  > 0 ? [row('Discount',  `-${fmt(d.discount)}`)]  : []),
    ...(d.surcharge > 0 ? [row('Surcharge', `+${fmt(d.surcharge)}`)] : []),
    escpos.boldOn(),
    row('Total', fmt(d.total)),
    escpos.boldOff(),

    // ── Total Amount box ──────────────────────────────────
    div('='),
    escpos.alignCenter(),
    enc('Total Amount\n'),
    escpos.boldOn(), escpos.doubleHeight(),
    enc(fmt(d.total) + '\n'),
    escpos.normalSize(), escpos.boldOff(),
  ]

  // ── Payment mode: PAID stamp ──────────────────────────
  if (d.mode === 'payment') {
    parts.push(
      enc('\n'),
      escpos.boldOn(),
      enc('*** PAID ***\n'),
      escpos.boldOff(),
      enc(`${d.dateStr}  ${d.timeStr}\n`),
    )
  }

  parts.push(div('='))

  // ── QR bitmap (receipt mode only, centered) ──────────
  if (d.mode !== 'payment' && d.qrBitmap) {
    parts.push(escpos.alignCenter(), d.qrBitmap)
  }

  // ── Receipt mode: feedback write-in ───────────────────
  if (d.mode !== 'payment') {
    const line = '_'.repeat(W)
    parts.push(
      escpos.alignCenter(),
      escpos.boldOn(),
      enc('YOUR FEEDBACK\n'),
      escpos.boldOff(),
      escpos.alignLeft(),
      div(),
      enc('NAME:\n'),
      enc(line + '\n\n'),
      enc('PHONE / EMAIL:\n'),
      enc(line + '\n\n'),
      enc('FEEDBACK:\n'),
      enc(line + '\n\n'),
      enc(line + '\n\n'),
      enc(line + '\n\n'),
      div(),
    )
  }

  // ── Note ──────────────────────────────────────────────
  if (d.note?.trim()) {
    parts.push(
      escpos.alignCenter(),
      enc(d.note.trim() + '\n'),
      div(),
    )
  }

  // ── Footer ────────────────────────────────────────────
  parts.push(
    escpos.alignCenter(),
    escpos.boldOn(),
    enc('\n' + d.thankYouMsg + '\n'),
    escpos.boldOff(),
    enc(d.poweredBy
      ? `Powered by ClickGroup - ${d.poweredBy}\n`
      : 'Powered by ClickGroup\n'),
    escpos.feed(4),
    escpos.cut(),
  )

  return concat(...parts)
}
