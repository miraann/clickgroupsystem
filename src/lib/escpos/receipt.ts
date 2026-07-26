import { escpos, cols, enc, divBytes, rowBytes, threeColBytes, concat } from './commands'
import { KU, kuTableLabel } from './kurdish'

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
  language?:      'ku' | 'en'
  note?:          string | null
  mode?:          'receipt' | 'payment'
  poweredBy?:     string | null
  logoBitmap?:    Uint8Array | null
  qrBitmap?:      Uint8Array | null
}

export function buildReceiptBytes(d: ReceiptPayload): Uint8Array {
  const W      = cols(d.paperWidth)
  const isKu   = (d.language ?? 'ku') === 'ku'
  const fmt    = (n: number) => `${n.toLocaleString('en-US')}${d.currencySymbol ? ' ' + d.currencySymbol : ''}`
  const div    = (ch = '-') => divBytes(W, ch)

  // In Kurdish mode: swap columns so label is on right, value on left (RTL reading order)
  const row = (label: string, value: string) =>
    isKu ? rowBytes(value, label, W) : rowBytes(label, value, W)

  const L = {
    invoiceNo:      isKu ? KU.invoiceNo      : 'Invoice No.',
    cashier:        isKu ? KU.cashier        : 'Cashier',
    employee:       isKu ? KU.employee       : 'Employee',
    paymentMethod:  isKu ? KU.paymentMethod  : 'Payment Method',
    item:           isKu ? KU.item           : 'Item',
    qty:            isKu ? KU.qty            : 'Qty',
    price:          isKu ? KU.price          : 'Price',
    subtotal:       isKu ? KU.subtotal       : 'Subtotal',
    discount:       isKu ? KU.discount       : 'Discount',
    surcharge:      isKu ? KU.surcharge      : 'Surcharge',
    total:          isKu ? KU.total          : 'Total',
    totalAmount:    isKu ? KU.totalAmount    : 'Total Amount',
    amountTendered: isKu ? KU.amountTendered : 'Amount Tendered',
    change:         isKu ? KU.change         : 'Change',
    paid:           isKu ? KU.paid           : '*** PAID ***',
    yourFeedback:   isKu ? KU.yourFeedback   : 'YOUR FEEDBACK',
    nameLine:       isKu ? KU.name           : 'NAME:',
    phoneLine:      isKu ? KU.phoneEmail     : 'PHONE / EMAIL:',
    feedbackLine:   isKu ? KU.feedback       : 'FEEDBACK:',
  }

  const tableLabel = isKu
    ? kuTableLabel(d.tableNum, d.guests)
    : d.guests ? `Table ${d.tableNum} - ${d.guests} guests` : `Table ${d.tableNum}`

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
    row(d.dateStr,   L.invoiceNo),
    row(d.timeStr,   d.invoiceNum),
    row(L.cashier,   L.employee),
    row(d.cashier,   d.cashier),
    div(),

    // ── Table - guests | Order number ─────────────────────
    row(tableLabel, d.orderNum),
    div(),

    // ── Payment method (centered) ─────────────────────────
    escpos.alignCenter(),
    enc(L.paymentMethod + '\n'),
    escpos.boldOn(),
    enc(d.paymentMethod + '\n'),
    escpos.boldOff(),
    escpos.alignLeft(),
    div(),

    // ── Items header ──────────────────────────────────────
    escpos.boldOn(),
    isKu
      ? threeColBytes(L.price, L.qty, L.item, W)
      : threeColBytes(L.item,  L.qty, L.price, W),
    escpos.boldOff(),
    div(),

    // ── Items ─────────────────────────────────────────────
    ...d.items.map(item =>
      isKu
        ? threeColBytes(fmt(item.price * item.qty), String(item.qty), item.name, W)
        : threeColBytes(item.name, String(item.qty), fmt(item.price * item.qty), W)
    ),
    div(),

    // ── Totals ────────────────────────────────────────────
    row(L.subtotal, fmt(d.subtotal)),
    ...(d.discount  > 0 ? [row(L.discount,  `-${fmt(d.discount)}`)]  : []),
    ...(d.surcharge > 0 ? [row(L.surcharge, `+${fmt(d.surcharge)}`)] : []),
    escpos.boldOn(),
    row(L.total, fmt(d.total)),
    escpos.boldOff(),

    // ── Total Amount box ──────────────────────────────────
    div('='),
    escpos.alignCenter(),
    enc(L.totalAmount + '\n'),
    escpos.boldOn(), escpos.doubleHeight(),
    enc(fmt(d.total) + '\n'),
    escpos.normalSize(), escpos.boldOff(),
  ]

  // ── Payment mode: PAID stamp ──────────────────────────
  if (d.mode === 'payment') {
    parts.push(
      enc('\n'),
      escpos.boldOn(),
      enc(L.paid + '\n'),
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
      enc(L.yourFeedback + '\n'),
      escpos.boldOff(),
      escpos.alignLeft(),
      div(),
      enc(L.nameLine + '\n'),
      enc(line + '\n\n'),
      enc(L.phoneLine + '\n'),
      enc(line + '\n\n'),
      enc(L.feedbackLine + '\n'),
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
