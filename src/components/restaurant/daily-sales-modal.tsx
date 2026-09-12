'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Printer, Loader2, BarChart2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { enqueuePrint } from '@/lib/printQueue'
import { sendPrinterBytes } from '@/lib/sendToPrinter'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface InvoiceRow {
  id: string
  subtotal: number
  discount: number
  tip_amount: number | null
  total: number
  amount_paid: number
  change_amount: number
  payment_method: string
  cashier: string
  table_num: string
  guests: number
  customer_id: string | null
  items: { name: string; price: number; qty: number }[] | null
}

interface ExpenseRow { id: string; amount: number }

interface Props {
  restaurantId: string
  restaurantName?: string
  /** "HH:MM" — when the restaurant's business day starts (Settings → Restaurant Info). Default '00:00' = real midnight. */
  dayStartTime?: string
  /** "YYYY-MM-DD" — view a specific past business day instead of the one still open right now. */
  date?: string
  formatPrice: (n: number) => string
  onClose: () => void
}

// ── Receipt primitives ────────────────────────────────────────
function Row({ label, value, large, hiColor }: {
  label: string; value: string; large?: boolean; hiColor?: string
}) {
  return (
    <div className="flex items-baseline justify-between py-[3px]">
      <span className={`font-bold text-black ${large ? 'text-sm' : 'text-xs'}`}>{label}</span>
      <span className={`tabular-nums font-mono font-bold ${large ? 'text-sm' : 'text-xs'} ${hiColor ?? 'text-black'}`}>{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-black mt-3 mb-0.5">{children}</p>
  )
}

function Divider({ dashed }: { dashed?: boolean }) {
  return <div className={`my-1.5 border-t ${dashed ? 'border-dashed border-gray-400' : 'border-gray-600'}`} />
}

function DoubleLine() {
  return <div className="my-1.5 border-t-2 border-double border-gray-600" />
}

// ── Main component ────────────────────────────────────────────
export function DailySalesModal({ restaurantId, restaurantName, dayStartTime = '00:00', date, formatPrice, onClose }: Props) {
  const { t } = useLanguage()
  const supabase = createClient()
  const receiptRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading]   = useState(true)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])

  const [mtdRevenue, setMtdRevenue]   = useState(0)
  const [mtdExpenses, setMtdExpenses] = useState(0)
  const [dayOfMonth, setDayOfMonth]   = useState(1)
  const [printStatus, setPrintStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [printError,  setPrintError]  = useState('')

  useEffect(() => {
    const load = async () => {
      const now = new Date()
      const [dayStartH, dayStartM] = dayStartTime.split(':').map(Number)

      // The business day runs from the configured start time to the same time
      // the next day — a restaurant open past midnight sets this later than
      // 00:00 so a 1am sale still counts toward the day that's still open.
      let start: Date
      if (date) {
        // A specific past day was picked — anchor to it exactly, no "hasn't
        // started yet" rollback (that only applies to the live/open day).
        const [y, mo, d] = date.split('-').map(Number)
        start = new Date(y, mo - 1, d, dayStartH || 0, dayStartM || 0, 0, 0)
      } else {
        start = new Date()
        start.setHours(dayStartH || 0, dayStartM || 0, 0, 0)
        if (now < start) start.setDate(start.getDate() - 1)
      }
      const end = new Date(start)
      end.setDate(end.getDate() + 1)

      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1, dayStartH || 0, dayStartM || 0, 0, 0)

      // tip_amount is a recent column — fall back to the select without it if
      // the migration hasn't been applied yet, instead of silently returning
      // no rows at all (Supabase errors the whole query on an unknown column).
      const loadInvoices = async () => {
        const cols = 'id,subtotal,discount,tip_amount,total,amount_paid,change_amount,payment_method,cashier,table_num,guests,customer_id,items'
        const { data, error } = await supabase
          .from('invoices')
          .select(cols)
          .eq('restaurant_id', restaurantId)
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
        if (!error) return data
        const fallback = await supabase
          .from('invoices')
          .select(cols.replace('tip_amount,', ''))
          .eq('restaurant_id', restaurantId)
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
        return fallback.data
      }

      const [inv, { data: exp }, { data: mtdInv }, { data: mtdExp }] = await Promise.all([
        loadInvoices(),
        supabase
          .from('expenses')
          .select('id,amount')
          .eq('restaurant_id', restaurantId)
          .eq('status', 'paid')
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString()),
        // Month-to-date totals (day 1 of the report's month -> end of the reported day), used for the daily-avg section below
        supabase
          .from('invoices')
          .select('total')
          .eq('restaurant_id', restaurantId)
          .gte('created_at', monthStart.toISOString())
          .lt('created_at', end.toISOString()),
        supabase
          .from('expenses')
          .select('amount')
          .eq('restaurant_id', restaurantId)
          .eq('status', 'paid')
          .gte('created_at', monthStart.toISOString())
          .lt('created_at', end.toISOString()),
      ])
      setInvoices((inv ?? []) as InvoiceRow[])
      setExpenses((exp ?? []) as ExpenseRow[])
      setMtdRevenue((mtdInv ?? []).reduce((s, r) => s + (r.total ?? 0), 0))
      setMtdExpenses((mtdExp ?? []).reduce((s, r) => s + (r.amount ?? 0), 0))
      setDayOfMonth(start.getDate())
      setLoading(false)
    }
    load()
  }, [restaurantId, dayStartTime, date]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Metrics ───────────────────────────────────────────────────
  const totalRevenue  = invoices.reduce((s, i) => s + i.total, 0)
  const totalDiscount = invoices.reduce((s, i) => s + (i.discount ?? 0), 0)
  const totalTips      = invoices.reduce((s, i) => s + (i.tip_amount ?? 0), 0)
  const totalChange   = invoices.reduce((s, i) => s + (i.change_amount ?? 0), 0)
  const txCount       = invoices.length
  const avgOrder      = txCount ? totalRevenue / txCount : 0
  const totalGuests   = invoices.reduce((s, i) => s + (i.guests ?? 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit     = totalRevenue - totalExpenses

  // Month-to-date daily averages (MTD total / elapsed days including today)
  const avgDailySalesMonth   = dayOfMonth > 0 ? mtdRevenue / dayOfMonth : 0
  const avgDailyExpenseMonth = dayOfMonth > 0 ? mtdExpenses / dayOfMonth : 0

  // Payment methods
  const payMap = new Map<string, { total: number; count: number }>()
  for (const inv of invoices) {
    const m = inv.payment_method || t.dsr_unknown
    const c = payMap.get(m) ?? { total: 0, count: 0 }
    payMap.set(m, { total: c.total + inv.total, count: c.count + 1 })
  }
  const byPayment = [...payMap.entries()].map(([m, d]) => ({ method: m, ...d })).sort((a, b) => b.total - a.total)

  // Order types
  const typeAcc = { dineIn: 0, dineInN: 0, takeout: 0, takeoutN: 0, delivery: 0, deliveryN: 0 }
  for (const inv of invoices) {
    const tbl = (inv.table_num ?? '').toLowerCase().trim()
    if (tbl === 'takeout' || tbl === 'take out' || tbl === 'take-out') { typeAcc.takeout += inv.total; typeAcc.takeoutN++ }
    else if (tbl.includes('delivery') || tbl.includes('deliver'))      { typeAcc.delivery += inv.total; typeAcc.deliveryN++ }
    else                                                                { typeAcc.dineIn  += inv.total; typeAcc.dineInN++  }
  }
  const orderTypes = [
    { label: t.dsr_dine_in,  total: typeAcc.dineIn,   count: typeAcc.dineInN   },
    { label: t.dsr_takeout,  total: typeAcc.takeout,  count: typeAcc.takeoutN  },
    { label: t.dsr_delivery, total: typeAcc.delivery, count: typeAcc.deliveryN },
  ].filter(ot => ot.count > 0)

  // Customer split
  const memberInvs  = invoices.filter(i => i.customer_id)
  const walkInInvs  = invoices.filter(i => !i.customer_id)
  const memberTotal = memberInvs.reduce((s, i) => s + i.total, 0)
  const walkInTotal = walkInInvs.reduce((s, i) => s + i.total, 0)

  // Top items
  const itemMap = new Map<string, { qty: number; revenue: number }>()
  for (const inv of invoices) {
    for (const item of (inv.items ?? [])) {
      const c = itemMap.get(item.name) ?? { qty: 0, revenue: 0 }
      itemMap.set(item.name, { qty: c.qty + item.qty, revenue: c.revenue + item.price * item.qty })
    }
  }
  const topItems = [...itemMap.entries()].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.qty - a.qty).slice(0, 8)

  // By cashier
  const cashierMap = new Map<string, { total: number; count: number }>()
  for (const inv of invoices) {
    const c = inv.cashier || t.dsr_unknown
    const cur = cashierMap.get(c) ?? { total: 0, count: 0 }
    cashierMap.set(c, { total: cur.total + inv.total, count: cur.count + 1 })
  }
  const byCashier = [...cashierMap.entries()].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total)

  const now       = new Date()
  // Label the report by the business day it covers, not the calendar date —
  // before the day-start cutoff (e.g. 2am with a 6am cutoff) "today" is still
  // yesterday's business day. A picked past date is shown as-is.
  let businessDate: Date
  if (date) {
    const [y, mo, d] = date.split('-').map(Number)
    businessDate = new Date(y, mo - 1, d)
  } else {
    const [dsH, dsM] = dayStartTime.split(':').map(Number)
    businessDate = new Date()
    businessDate.setHours(dsH || 0, dsM || 0, 0, 0)
    if (now < businessDate) businessDate.setDate(businessDate.getDate() - 1)
  }
  const dateStr   = businessDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr   = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })

  const handlePrint = () => {
    const el = receiptRef.current
    if (!el) return
    const win = window.open('', '_blank', 'width=400,height=800')
    if (!win) return
    win.document.write(`
      <html><head><title>${t.dsr_title} - ${dateStr}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 11px; color: #111; background: #fff; padding: 12px; }
        .receipt { max-width: 320px; margin: 0 auto; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .row .label { color: #555; }
        .row .val { font-weight: bold; }
        .row.sub { padding-left: 12px; }
        .divider { border-top: 1px solid #aaa; margin: 6px 0; }
        .divider.dashed { border-style: dashed; border-color: #ccc; }
        .double { border-top: 3px double #aaa; margin: 6px 0; }
        .section-title { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: #888; margin-top: 10px; margin-bottom: 2px; }
        .hi { font-weight: bold; }
        .green { color: #16a34a; }
        .red { color: #dc2626; }
        .rose { color: #e11d48; }
      </style></head><body>
      <div class="receipt">${el.innerHTML}</div>
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  // ── ESC/POS hardware print via the Receipt / Cashier printer ───
  const handleHardwarePrint = async (): Promise<boolean> => {
    setPrintStatus('sending')
    setPrintError('')

    const { done } = enqueuePrint({
      kind:   'report',
      title:  'Daily sales report',
      detail: dateStr,
      run: async () => {
        const res = await fetch('/api/print/daily-sales', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantId, dateStr, timeStr,
            txCount, totalRevenue, avgOrder, totalGuests, totalDiscount, totalTips, totalChange,
            byPayment, orderTypes,
            memberCount: memberInvs.length, memberTotal,
            walkInCount: walkInInvs.length, walkInTotal,
            topItems, byCashier,
            totalExpenses, netProfit,
            avgDailySalesMonth, avgDailyExpenseMonth,
          }),
        })
        const json = await res.json().catch(() => null)
        if (!json?.ok || !json.bytes) throw new Error(json?.error ?? 'Report printer is not set up')

        await sendPrinterBytes({
          bytes:          json.bytes,
          connectionType: json.connectionType ?? '',
          printerName:    json.printerName ?? null,
          ipAddress:      json.ipAddress ?? null,
          btAddress:      json.btAddress ?? null,
          port:           json.port ?? 9100,
        })
      },
    })

    const ok = await done
    if (ok) {
      setPrintStatus('ok')
      setTimeout(() => setPrintStatus('idle'), 3000)
    } else {
      setPrintError(t.dsr_print_failed)
      setPrintStatus('error')
    }
    return ok
  }

  const handlePrintClick = async () => {
    const hw = await handleHardwarePrint()
    if (!hw) handlePrint()
  }

  return (
    <>
      {/* Print-only styles (no global pollution) */}
      <style>{`@media print { body > *:not(#daily-receipt-root) { display: none !important; } }`}</style>

      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

          <motion.div
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative w-full sm:max-w-sm max-h-[92dvh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden bg-gray-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Pull handle */}
            <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0 bg-gray-100">
              <div className="w-8 h-1 bg-gray-400/60 rounded-full" />
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t.dsr_title}</span>
              </div>
              <div className="flex items-center gap-2">
                {!loading && txCount > 0 && (
                  <button
                    onClick={handlePrintClick}
                    disabled={printStatus === 'sending'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {printStatus === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : printStatus === 'ok'    ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : printStatus === 'error' ? <AlertCircle className="w-3.5 h-3.5" />
                      : <Printer className="w-3.5 h-3.5" />}
                    {printStatus === 'sending' ? t.dsr_sending : printStatus === 'ok' ? t.dsr_sent : t.dsr_print}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 active:scale-95 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Hardware print error hint */}
            {printStatus === 'error' && printError && (
              <div className="shrink-0 mx-4 mt-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] space-y-1">
                <p>{printError}</p>
                <p className="text-gray-500">{t.dsr_print_fallback_hint}</p>
              </div>
            )}

            {/* Receipt paper */}
            <div className="flex-1 overflow-y-auto bg-white">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-7 h-7 text-gray-400 animate-spin" />
                </div>
              ) : (
                <div ref={receiptRef} className="px-5 pt-5 pb-8">

                  {/* ── Header ─────────────────────────────────── */}
                  <div className="text-center mb-4">
                    {restaurantName && (
                      <p className="text-base font-black text-black tracking-wide uppercase">{restaurantName}</p>
                    )}
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black mt-0.5">{t.dsr_report_title}</p>
                    <p className="text-xs font-bold text-black mt-1">{dateStr} &nbsp;·&nbsp; {timeStr}</p>
                  </div>

                  <DoubleLine />

                  {txCount === 0 ? (
                    <p className="text-center text-xs font-bold text-black py-8">{t.dsr_no_sales}</p>
                  ) : (
                    <>
                      {/* ── Summary ────────────────────────────── */}
                      <Row label={t.dsr_transactions}  value={String(txCount)} />
                      <Row label={t.dsr_total_revenue} value={formatPrice(totalRevenue)} large />
                      <Row label={t.dsr_avg_order}     value={formatPrice(avgOrder)} />
                      <Row label={t.dsr_guests_served} value={String(totalGuests)} />

                      <Divider dashed />
                      <Row label={t.dsr_total_discounts} value={formatPrice(totalDiscount)} hiColor="text-rose-600" />
                      <Row label={t.dsr_total_tips}      value={formatPrice(totalTips)} />
                      <Row label={t.dsr_change_given}    value={formatPrice(totalChange)} />

                      {/* ── Payment Methods ────────────────────── */}
                      <DoubleLine />
                      <SectionTitle>{t.dsr_payment_methods}</SectionTitle>
                      <Divider dashed />
                      {byPayment.map(pm => (
                        <div key={pm.method} className="flex items-baseline justify-between py-[3px]">
                          <span className="text-xs font-bold text-black">{pm.method}</span>
                          <span className="text-xs font-bold text-black mx-2">{pm.count}×</span>
                          <span className="text-xs tabular-nums font-mono font-bold text-black ml-auto">{formatPrice(pm.total)}</span>
                        </div>
                      ))}

                      {/* ── Order Types ────────────────────────── */}
                      {orderTypes.length > 0 && (
                        <>
                          <DoubleLine />
                          <SectionTitle>{t.dsr_order_types}</SectionTitle>
                          <Divider dashed />
                          {orderTypes.map(ot => (
                            <div key={ot.label} className="flex items-baseline justify-between py-[3px]">
                              <span className="text-xs font-bold text-black">{ot.label}</span>
                              <span className="text-xs font-bold text-black mx-2">{ot.count}×</span>
                              <span className="text-xs tabular-nums font-mono font-bold text-black ml-auto">{formatPrice(ot.total)}</span>
                            </div>
                          ))}
                        </>
                      )}

                      {/* ── Customer Split ─────────────────────── */}
                      <DoubleLine />
                      <SectionTitle>{t.dsr_customer_split}</SectionTitle>
                      <Divider dashed />
                      <div className="flex items-baseline justify-between py-[3px]">
                        <span className="text-xs font-bold text-black">{t.dsr_member}</span>
                        <span className="text-xs font-bold text-black mx-2">{memberInvs.length}×</span>
                        <span className="text-xs tabular-nums font-mono font-bold text-black ml-auto">{formatPrice(memberTotal)}</span>
                      </div>
                      <div className="flex items-baseline justify-between py-[3px]">
                        <span className="text-xs font-bold text-black">{t.dsr_walk_in}</span>
                        <span className="text-xs font-bold text-black mx-2">{walkInInvs.length}×</span>
                        <span className="text-xs tabular-nums font-mono font-bold text-black ml-auto">{formatPrice(walkInTotal)}</span>
                      </div>

                      {/* ── Top Items ──────────────────────────── */}
                      {topItems.length > 0 && (
                        <>
                          <DoubleLine />
                          <SectionTitle>{t.dsr_top_items}</SectionTitle>
                          <Divider dashed />
                          {topItems.map((item, idx) => (
                            <div key={item.name} className="flex items-baseline justify-between py-[3px]">
                              <span className="text-xs font-bold text-black w-4 shrink-0">{idx + 1}.</span>
                              <span className="text-xs font-bold text-black flex-1 truncate mx-1">{item.name}</span>
                              <span className="text-xs font-bold text-black mx-2 shrink-0">{item.qty}×</span>
                              <span className="text-xs tabular-nums font-mono font-bold text-black shrink-0">{formatPrice(item.revenue)}</span>
                            </div>
                          ))}
                        </>
                      )}

                      {/* ── By Cashier ─────────────────────────── */}
                      {byCashier.length > 0 && (
                        <>
                          <DoubleLine />
                          <SectionTitle>{t.dsr_by_cashier}</SectionTitle>
                          <Divider dashed />
                          {byCashier.map(c => (
                            <div key={c.name} className="flex items-baseline justify-between py-[3px]">
                              <span className="text-xs font-bold text-black">{c.name}</span>
                              <span className="text-xs font-bold text-black mx-2">{c.count}×</span>
                              <span className="text-xs tabular-nums font-mono font-bold text-black ml-auto">{formatPrice(c.total)}</span>
                            </div>
                          ))}
                        </>
                      )}

                      {/* ── Expenses & Profit ──────────────────── */}
                      <DoubleLine />
                      <SectionTitle>{t.dsr_expenses_profit}</SectionTitle>
                      <Divider dashed />
                      <Row label={t.dsr_gross_revenue} value={formatPrice(totalRevenue)} />
                      <Row label={t.dsr_paid_expenses} value={`- ${formatPrice(totalExpenses)}`} hiColor="text-rose-600" />
                      <Divider />
                      <Row label={t.dsr_net_profit} value={formatPrice(netProfit)} large hiColor={netProfit >= 0 ? 'text-green-700' : 'text-red-600'} />

                      {/* ── Month-to-Date Daily Averages ───────── */}
                      <DoubleLine />
                      <SectionTitle>{t.dsr_month_avg}</SectionTitle>
                      <Divider dashed />
                      <Row label={t.dsr_avg_daily_sales}   value={formatPrice(avgDailySalesMonth)} />
                      <Row label={t.dsr_avg_daily_expense} value={formatPrice(avgDailyExpenseMonth)} hiColor="text-rose-600" />

                      <DoubleLine />

                      {/* Footer */}
                      <p className="text-center text-[9px] font-black text-black mt-3 tracking-widest uppercase">{t.dsr_end_of_report}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
