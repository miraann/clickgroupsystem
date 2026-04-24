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
  doubleHeight: () => cmd(ESC, 0x21, 0x10),
  doubleSize:   () => cmd(ESC, 0x21, 0x30),
  normalSize:   () => cmd(ESC, 0x21, 0x00),
  feed:         (n = 3) => cmd(ESC, 0x64, n),
  cut:          () => cmd(GS,  0x56, 0x42, 0x10),
  text:         (s: string) => enc(s),
}

function cols(paperWidth: number): number {
  if (paperWidth <= 58) return 32
  if (paperWidth <= 80) return 42
  return 48
}

// Left-right two-column row
function twoCol(left: string, right: string, width: number): string {
  const space = width - right.length
  const l = left.length >= space ? left.slice(0, space - 1) + ' ' : left.padEnd(space)
  return l + right + '\n'
}

// Three-column row: Item | Qty | Price
function threeCol(left: string, mid: string, right: string, width: number): string {
  const rightW = Math.min(12, Math.floor(width * 0.30))
  const midW   = 5
  const leftW  = width - midW - rightW
  const l = left.length > leftW ? left.slice(0, leftW - 1) + ' ' : left.padEnd(leftW)
  const m = mid.padStart(midW)
  const r = right.padStart(rightW)
  return l + m + r + '\n'
}

function divider(width: number, char = '-'): string {
  return char.repeat(width) + '\n'
}

// ESC/POS QR code (GS ( k commands — supported by most thermal printers)
function makeQrBytes(data: string): Uint8Array {
  const dataBytes = enc(data)
  const len       = dataBytes.length + 3
  const pL        = len & 0xFF
  const pH        = (len >> 8) & 0xFF

  const header = new Uint8Array([
    GS, 0x28, 0x6B, 4, 0, 49, 65, 50, 0,   // model 2
    GS, 0x28, 0x6B, 3, 0, 49, 67, 5,        // cell size 5
    GS, 0x28, 0x6B, 3, 0, 49, 69, 48,       // error correction M
    GS, 0x28, 0x6B, pL, pH, 49, 80, 48,     // store data
  ])
  const footer = new Uint8Array([GS, 0x28, 0x6B, 3, 0, 49, 81, 48]) // print

  const out = new Uint8Array(header.length + dataBytes.length + footer.length)
  out.set(header)
  out.set(dataBytes, header.length)
  out.set(footer, header.length + dataBytes.length)
  return out
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out   = new Uint8Array(total)
  let offset  = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
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
  qrUrl?:         string | null
  poweredBy?:     string | null
}

export function buildReceiptBytes(d: ReceiptPayload): Uint8Array {
  const W   = cols(d.paperWidth)
  const t   = (s: string) => enc(s)
  const fmt = (n: number) => `${d.currencySymbol}${n.toLocaleString('en-US')}`
  const div = (ch = '-')  => t(divider(W, ch))
  const row = (l: string, r: string) => t(twoCol(l, r, W))

  const parts: Uint8Array[] = [
    escpos.init(),

    // ── Restaurant name + contact (centered) ──────────────
    escpos.alignCenter(),
    escpos.boldOn(), escpos.doubleSize(),
    t(d.restaurantName.toUpperCase() + '\n'),
    escpos.normalSize(), escpos.boldOff(),
    ...(d.phone   ? [t(d.phone   + '\n')] : []),
    ...(d.address ? [t(d.address + '\n')] : []),

    // ── Date | Invoice two-column header ──────────────────
    escpos.alignLeft(),
    div(),
    row(d.dateStr,  'Invoice No.'),
    row(d.timeStr,  d.invoiceNum),
    row('Cashier',  'Employee'),
    row(d.cashier,  d.cashier),
    div(),

    // ── Table · guests | Order number ─────────────────────
    t(twoCol(
      `Table ${d.tableNum}${d.guests ? ` · ${d.guests} guests` : ''}`,
      d.orderNum,
      W
    )),
    div(),

    // ── Payment method (centered) ─────────────────────────
    escpos.alignCenter(),
    t('Payment Method\n'),
    escpos.boldOn(),
    t(d.paymentMethod + '\n'),
    escpos.boldOff(),
    escpos.alignLeft(),
    div(),

    // ── Items header ──────────────────────────────────────
    escpos.boldOn(),
    t(threeCol('Item', 'Qty', 'Price', W)),
    escpos.boldOff(),
    div(),

    // ── Items ─────────────────────────────────────────────
    ...d.items.map(item =>
      t(threeCol(item.name, String(item.qty), fmt(item.price * item.qty), W))
    ),
    div(),

    // ── Totals ────────────────────────────────────────────
    t(row('Subtotal', fmt(d.subtotal))),
    ...(d.discount  > 0 ? [t(row('Discount',  `-${fmt(d.discount)}`))]  : []),
    ...(d.surcharge > 0 ? [t(row('Surcharge', `+${fmt(d.surcharge)}`))] : []),
    escpos.boldOn(),
    t(row('Total', fmt(d.total))),
    escpos.boldOff(),

    // ── Total Amount box ──────────────────────────────────
    div('='),
    escpos.alignCenter(),
    t('Total Amount\n'),
    escpos.boldOn(), escpos.doubleHeight(),
    t(fmt(d.total) + '\n'),
    escpos.normalSize(), escpos.boldOff(),
  ]

  // ── Payment mode: PAID stamp ──────────────────────────
  if (d.mode === 'payment') {
    parts.push(
      t('\n'),
      escpos.boldOn(),
      t('*** PAID ***\n'),
      escpos.boldOff(),
      t(`${d.dateStr}  ${d.timeStr}\n`),
    )
  }

  parts.push(div('='))

  // ── Receipt mode: QR code + Feedback ──────────────────
  if (d.mode !== 'payment') {
    if (d.qrUrl) {
      parts.push(
        escpos.alignCenter(),
        makeQrBytes(d.qrUrl),
        t('\n'),
        div(),
      )
    }
    // Feedback write-in section
    const line = '_'.repeat(W)
    parts.push(
      escpos.alignCenter(),
      escpos.boldOn(),
      t('YOUR FEEDBACK\n'),
      escpos.boldOff(),
      escpos.alignLeft(),
      div(),
      t('NAME:\n'),
      t(line + '\n\n'),
      t('PHONE / EMAIL:\n'),
      t(line + '\n\n'),
      t('FEEDBACK:\n'),
      t(line + '\n\n'),
      t(line + '\n\n'),
      t(line + '\n\n'),
      div(),
    )
  }

  // ── Note ──────────────────────────────────────────────
  if (d.note?.trim()) {
    parts.push(
      escpos.alignCenter(),
      t(d.note.trim() + '\n'),
      div(),
    )
  }

  // ── Footer ────────────────────────────────────────────
  parts.push(
    escpos.alignCenter(),
    escpos.boldOn(),
    t('\n' + d.thankYouMsg + '\n'),
    escpos.boldOff(),
    ...(d.poweredBy ? [t(`Powered by ClickGroup · ${d.poweredBy}\n`)] : [t('Powered by ClickGroup\n')]),
    escpos.feed(4),
    escpos.cut(),
  )

  return concat(...parts)
}
