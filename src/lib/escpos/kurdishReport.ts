// Kurdish-language Daily Sales report — same content/order as the English
// path in report.ts, but rendered to raster bitmaps (kurdishRender.ts)
// instead of raw text bytes, since most thermal printers have no Arabic
// font ROM. See kurdishReceipt.ts for the same approach on the customer receipt.
import { escpos, concat } from './commands'
import { printableWidthPx } from './raster'
import { renderKurdishBlock, KuLine } from './kurdishRender'
import { KU_REPORT as R } from './kurdish'
import type { DailySalesReportPayload } from './report'

export async function buildKurdishDailySalesReportBytes(d: DailySalesReportPayload): Promise<Uint8Array> {
  const widthPx = printableWidthPx(d.paperWidth)
  const fmt = (n: number) => `${n.toLocaleString('en-US')}${d.currencySymbol ? ' ' + d.currencySymbol : ''}`

  const lines: KuLine[] = [
    { t: 'center', text: d.restaurantName || 'Restaurant', size: 'wide' },
    { t: 'center', text: R.title },
    { t: 'center', text: `${d.dateStr}  ${d.timeStr}` },
    { t: 'rule', heavy: true },

    { t: 'row', first: R.transactions, second: String(d.txCount) },
    { t: 'row', first: R.totalRevenue, second: fmt(d.totalRevenue) },
    { t: 'row', first: R.avgOrder,     second: fmt(d.avgOrder) },
    { t: 'row', first: R.guestsServed, second: String(d.totalGuests) },
    { t: 'rule' },
    { t: 'row', first: R.totalDiscounts, second: fmt(d.totalDiscount) },
    { t: 'row', first: R.totalTips,      second: fmt(d.totalTips) },
    { t: 'row', first: R.changeGiven,    second: fmt(d.totalChange) },
    { t: 'rule', heavy: true },
  ]

  if (d.byPayment.length) {
    lines.push({ t: 'center', text: R.paymentMethods }, { t: 'rule' })
    for (const pm of d.byPayment) lines.push({ t: 'row', first: `${pm.method} x${pm.count}`, second: fmt(pm.total) })
    lines.push({ t: 'rule', heavy: true })
  }

  if (d.orderTypes.length) {
    const label = (l: string) => l === 'Dine-in' ? R.dineIn : l === 'Takeout' ? R.takeout : l === 'Delivery' ? R.delivery : l
    lines.push({ t: 'center', text: R.orderTypes }, { t: 'rule' })
    for (const ot of d.orderTypes) lines.push({ t: 'row', first: `${label(ot.label)} x${ot.count}`, second: fmt(ot.total) })
    lines.push({ t: 'rule', heavy: true })
  }

  lines.push(
    { t: 'center', text: R.customerSplit },
    { t: 'rule' },
    { t: 'row', first: `${R.member} x${d.memberCount}`, second: fmt(d.memberTotal) },
    { t: 'row', first: `${R.walkIn} x${d.walkInCount}`, second: fmt(d.walkInTotal) },
    { t: 'rule', heavy: true },
  )

  if (d.topItems.length) {
    lines.push({ t: 'center', text: R.topItems }, { t: 'rule' })
    d.topItems.forEach((item, i) => lines.push({ t: 'row', first: `${i + 1}. ${item.name} x${item.qty}`, second: fmt(item.revenue) }))
    lines.push({ t: 'rule', heavy: true })
  }

  if (d.byCashier.length) {
    lines.push({ t: 'center', text: R.byCashier }, { t: 'rule' })
    for (const c of d.byCashier) lines.push({ t: 'row', first: `${c.name} x${c.count}`, second: fmt(c.total) })
    lines.push({ t: 'rule', heavy: true })
  }

  lines.push(
    { t: 'center', text: R.expensesProfit },
    { t: 'rule' },
    { t: 'row', first: R.grossRevenue, second: fmt(d.totalRevenue) },
    { t: 'row', first: R.paidExpenses, second: `-${fmt(d.totalExpenses)}` },
    { t: 'rule' },
    { t: 'row', first: R.netProfit, second: fmt(d.netProfit) },
    { t: 'rule', heavy: true },

    { t: 'center', text: R.monthAvg },
    { t: 'rule' },
    { t: 'row', first: R.avgDailySales,   second: fmt(d.avgDailySalesMonth) },
    { t: 'row', first: R.avgDailyExpense, second: fmt(d.avgDailyExpenseMonth) },
    { t: 'rule', heavy: true },

    { t: 'center', text: R.endOfReport },
  )

  const bitmap = await renderKurdishBlock(lines, widthPx)
  return concat(escpos.init(), escpos.doubleStrike(true), escpos.alignLeft(), bitmap, escpos.feed(4), escpos.cut())
}
