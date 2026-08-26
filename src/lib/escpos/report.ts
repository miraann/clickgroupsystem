import { escpos, cols, enc, divBytes, rowBytes, concat } from './commands'

export interface DailySalesReportPayload {
  restaurantName: string
  dateStr:        string
  timeStr:        string
  currencySymbol: string
  paperWidth:     number

  txCount:        number
  totalRevenue:   number
  avgOrder:       number
  totalGuests:    number
  totalDiscount:  number
  totalChange:    number

  byPayment:      { method: string; count: number; total: number }[]
  orderTypes:     { label: string; count: number; total: number }[]
  memberCount:    number
  memberTotal:    number
  walkInCount:    number
  walkInTotal:    number
  topItems:       { name: string; qty: number; revenue: number }[]
  byCashier:      { name: string; count: number; total: number }[]

  totalExpenses:  number
  netProfit:      number

  avgDailySalesMonth:   number
  avgDailyExpenseMonth: number
}

export function buildDailySalesReportBytes(d: DailySalesReportPayload): Uint8Array {
  const W   = cols(d.paperWidth)
  const fmt = (n: number) => `${n.toLocaleString('en-US')}${d.currencySymbol ? ' ' + d.currencySymbol : ''}`
  const div = (ch = '-') => divBytes(W, ch)
  const row = (label: string, value: string) => rowBytes(label, value, W)

  const section = (title: string) => concat(
    escpos.alignLeft(), escpos.boldOn(),
    enc(title.toUpperCase() + '\n'),
    escpos.boldOff(), div('.'),
  )

  const parts: Uint8Array[] = [
    escpos.init(),
    escpos.alignCenter(), escpos.boldOn(), escpos.doubleHeight(),
    enc(d.restaurantName + '\n'),
    escpos.normalSize(),
    enc('DAILY SALES REPORT\n'),
    escpos.boldOff(),
    enc(`${d.dateStr}  ${d.timeStr}\n`),
    div('='),
    escpos.alignLeft(),

    row('Transactions', String(d.txCount)),
    escpos.boldOn(), row('Total Revenue', fmt(d.totalRevenue)), escpos.boldOff(),
    row('Avg Order Value', fmt(d.avgOrder)),
    row('Guests Served', String(d.totalGuests)),
    div('.'),
    row('Total Discounts', fmt(d.totalDiscount)),
    row('Change Given', fmt(d.totalChange)),
    div('='),
  ]

  if (d.byPayment.length) {
    parts.push(section('Payment Methods'))
    for (const pm of d.byPayment) parts.push(row(`${pm.method} x${pm.count}`, fmt(pm.total)))
    parts.push(div('='))
  }

  if (d.orderTypes.length) {
    parts.push(section('Order Types'))
    for (const ot of d.orderTypes) parts.push(row(`${ot.label} x${ot.count}`, fmt(ot.total)))
    parts.push(div('='))
  }

  parts.push(
    section('Customer Split'),
    row(`Member x${d.memberCount}`, fmt(d.memberTotal)),
    row(`Walk-in x${d.walkInCount}`, fmt(d.walkInTotal)),
    div('='),
  )

  if (d.topItems.length) {
    parts.push(section('Top Selling Items'))
    d.topItems.forEach((item, i) => parts.push(row(`${i + 1}. ${item.name} x${item.qty}`, fmt(item.revenue))))
    parts.push(div('='))
  }

  if (d.byCashier.length) {
    parts.push(section('By Cashier'))
    for (const c of d.byCashier) parts.push(row(`${c.name} x${c.count}`, fmt(c.total)))
    parts.push(div('='))
  }

  parts.push(
    section('Expenses & Net Profit'),
    row('Gross Revenue', fmt(d.totalRevenue)),
    row('Paid Expenses', `-${fmt(d.totalExpenses)}`),
    div('.'),
    escpos.boldOn(), escpos.doubleHeight(),
    row('NET PROFIT', fmt(d.netProfit)),
    escpos.normalSize(), escpos.boldOff(),
    div('='),

    section('Current Month Daily Avg'),
    row('Avg Daily Sales', fmt(d.avgDailySalesMonth)),
    row('Avg Daily Expense', fmt(d.avgDailyExpenseMonth)),
    div('='),

    escpos.alignCenter(),
    enc('END OF REPORT\n'),
    escpos.feed(4),
    escpos.cut(),
  )

  return concat(...parts)
}
