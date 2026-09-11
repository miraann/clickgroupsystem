import { escpos, cols, enc, divBytes, rowBytes, threeColBytes, concat } from './commands'
import { toAscii, enPaymentMethod, enCurrencySymbol } from './translate'
import { buildKurdishReceiptBytes } from './kurdishReceipt'

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

export async function buildReceiptBytes(d: ReceiptPayload): Promise<Uint8Array> {
  const isKu = (d.language ?? 'ku') === 'ku'

  // Kurdish (Sorani) needs the Arabic script plus letters most printers'
  // Arabic codepage doesn't cover — raster-render it instead of sending text
  // bytes. See kurdishReceipt.ts / raster.ts for why.
  if (isKu) return buildKurdishReceiptBytes(d)

  const W = cols(d.paperWidth)

  // English receipts: force every dynamic value to printable ASCII (translating
  // the common Kurdish/Arabic terms first) so a printer without an Arabic font
  // ROM never emits replacement garbage.
  const tx        = (s?: string | null): string => toAscii(s)
  const currency  = enCurrencySymbol(d.currencySymbol)
  const payMethod = enPaymentMethod(d.paymentMethod, d.paymentMethodType)

  const fmt = (n: number) => `${n.toLocaleString('en-US')}${currency ? ' ' + currency : ''}`
  const div = (ch = '-') => divBytes(W, ch)
  const row = (label: string, value: string) => rowBytes(label, value, W)

  const L = {
    invoiceNo:      'Invoice No.',
    cashier:        'Cashier',
    employee:       'Employee',
    paymentMethod:  'Payment Method',
    item:           'Item',
    qty:            'Qty',
    price:          'Price',
    subtotal:       'Subtotal',
    discount:       'Discount',
    surcharge:      'Surcharge',
    total:          'Total',
    totalAmount:    'Total Amount',
    paid:           '*** PAID ***',
    yourFeedback:   'YOUR FEEDBACK',
    nameLine:       'NAME:',
    phoneLine:      'PHONE / EMAIL:',
    feedbackLine:   'FEEDBACK:',
  }

  const tableLabel = d.guests ? `Table ${tx(d.tableNum)} - ${d.guests} guests` : `Table ${tx(d.tableNum)}`

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
    threeColBytes(L.item, L.qty, L.price, W),
    div(),

    // ── Items ─────────────────────────────────────────────
    ...d.items.map(item =>
      threeColBytes(tx(item.name), String(item.qty), fmt(item.price * item.qty), W)
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
      enc('\n' + (tx(d.thankYouMsg) || 'Thank you for your visit!') + '\n'),
      enc(d.poweredBy
        ? `Powered by ClickGroup - ${tx(d.poweredBy)}\n`
        : 'Powered by ClickGroup\n'),
    )
  }

  parts.push(escpos.feed(4), escpos.cut())

  return concat(...parts)
}
