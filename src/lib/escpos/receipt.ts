import { escpos, cols, enc, divBytes, rowBytes, threeColBytes, concat } from './commands'
import { KU, kuTableLabel } from './kurdish'
import { toAscii, enPaymentMethod, enCurrencySymbol } from './translate'

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
  paymentMethodType?: string | null   // icon_type bucket — fallback for the English label
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

  // English receipts: force every dynamic value to printable ASCII (translating
  // the common Kurdish/Arabic terms first) so a printer without an Arabic font
  // ROM never emits replacement garbage. Kurdish receipts are left untouched.
  const tx        = (s?: string | null): string => (isKu ? (s ?? '') : toAscii(s))
  const currency  = isKu ? d.currencySymbol : enCurrencySymbol(d.currencySymbol)
  const payMethod = isKu ? d.paymentMethod  : enPaymentMethod(d.paymentMethod, d.paymentMethodType)

  const fmt    = (n: number) => `${n.toLocaleString('en-US')}${currency ? ' ' + currency : ''}`
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
    : d.guests ? `Table ${tx(d.tableNum)} - ${d.guests} guests` : `Table ${tx(d.tableNum)}`

  const parts: Uint8Array[] = [
    escpos.init(),
    escpos.doubleStrike(true), // darken print — thin single-pass text is hard to read
    escpos.boldOn(),           // emphasise the whole receipt; never turned back off

    // ── Logo bitmap (centered) ────────────────────────────
    ...(d.logoBitmap ? [escpos.alignCenter(), d.logoBitmap] : []),

    // ── Restaurant name + contact (centered) ──────────────
    escpos.alignCenter(),
    escpos.doubleSize(),
    enc(tx(d.restaurantName).toUpperCase() + '\n'),
    escpos.normalSize(),
    ...(d.phone   ? [enc(tx(d.phone)   + '\n')] : []),
    ...(d.address ? [enc(tx(d.address) + '\n')] : []),

    // ── Date | Invoice two-column header ──────────────────
    escpos.alignLeft(),
    div(),
    row(d.dateStr,   L.invoiceNo),
    row(d.timeStr,   tx(d.invoiceNum)),
    row(L.cashier,   L.employee),
    row(tx(d.cashier), tx(d.cashier)),
    div(),

    // ── Table - guests | Order number ─────────────────────
    row(tableLabel, tx(d.orderNum)),
    div(),

    // ── Payment method (centered) ─────────────────────────
    escpos.alignCenter(),
    enc(L.paymentMethod + '\n'),
    enc(payMethod + '\n'),
    escpos.alignLeft(),
    div(),

    // ── Items header ──────────────────────────────────────
    isKu
      ? threeColBytes(L.price, L.qty, L.item, W)
      : threeColBytes(L.item,  L.qty, L.price, W),
    div(),

    // ── Items ─────────────────────────────────────────────
    ...d.items.map(item =>
      isKu
        ? threeColBytes(fmt(item.price * item.qty), String(item.qty), item.name, W)
        : threeColBytes(tx(item.name), String(item.qty), fmt(item.price * item.qty), W)
    ),
    div(),

    // ── Totals ────────────────────────────────────────────
    row(L.subtotal, fmt(d.subtotal)),
    ...(d.discount  > 0 ? [row(L.discount,  `-${fmt(d.discount)}`)]  : []),
    ...(d.surcharge > 0 ? [row(L.surcharge, `+${fmt(d.surcharge)}`)] : []),
    row(L.total, fmt(d.total)),

    // ── Total Amount box ──────────────────────────────────
    div('='),
    escpos.alignCenter(),
    enc(L.totalAmount + '\n'),
    escpos.doubleHeight(),
    enc(fmt(d.total) + '\n'),
    escpos.normalSize(),
  ]

  // ── Payment mode: PAID stamp ──────────────────────────
  if (d.mode === 'payment') {
    parts.push(
      enc('\n'),
      enc(L.paid + '\n'),
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
      enc(L.yourFeedback + '\n'),
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
      enc(tx(d.note).trim() + '\n'),
      div(),
    )
  }

  // ── Footer ────────────────────────────────────────────
  // Live payment receipts skip the thank-you / "Powered by" lines — they end
  // on the PAID stamp. Only reprints keep the branded footer.
  if (d.mode !== 'payment') {
    parts.push(
      escpos.alignCenter(),
      enc('\n' + (tx(d.thankYouMsg) || (isKu ? d.thankYouMsg : 'Thank you for your visit!')) + '\n'),
      enc(d.poweredBy
        ? `Powered by ClickGroup - ${tx(d.poweredBy)}\n`
        : 'Powered by ClickGroup\n'),
    )
  }

  parts.push(escpos.feed(4), escpos.cut())

  return concat(...parts)
}
