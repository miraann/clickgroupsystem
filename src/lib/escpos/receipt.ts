import { escpos, cols, enc, divBytes, rowBytes, threeColBytes, concat } from './commands'

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
