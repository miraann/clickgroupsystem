'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Printer, Loader2, BarChart2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface InvoiceRow {
  id: string
  subtotal: number
  discount: number
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
export function DailySalesModal({ restaurantId, restaurantName, formatPrice, onClose }: Props) {
  const supabase = createClient()
  const receiptRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading]   = useState(true)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])

  useEffect(() => {
    const load = async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const [{ data: inv }, { data: exp }] = await Promise.all([
        supabase
          .from('invoices')
          .select('id,subtotal,discount,total,amount_paid,change_amount,payment_method,cashier,table_num,guests,customer_id,items')
          .eq('restaurant_id', restaurantId)
          .gte('created_at', start.toISOString()),
        supabase
          .from('expenses')
          .select('id,amount')
          .eq('restaurant_id', restaurantId)
          .eq('status', 'paid')
          .gte('created_at', start.toISOString()),
      ])
      setInvoices((inv ?? []) as InvoiceRow[])
      setExpenses((exp ?? []) as ExpenseRow[])
      setLoading(false)
    }
    load()
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Metrics ───────────────────────────────────────────────────
  const totalRevenue  = invoices.reduce((s, i) => s + i.total, 0)
  const totalSubtotal = invoices.reduce((s, i) => s + i.subtotal, 0)
  const totalDiscount = invoices.reduce((s, i) => s + (i.discount ?? 0), 0)
  const totalChange   = invoices.reduce((s, i) => s + (i.change_amount ?? 0), 0)
  const txCount       = invoices.length
  const avgOrder      = txCount ? totalRevenue / txCount : 0
  const totalGuests   = invoices.reduce((s, i) => s + (i.guests ?? 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit     = totalRevenue - totalExpenses

  // Payment methods
  const payMap = new Map<string, { total: number; count: number }>()
  for (const inv of invoices) {
    const m = inv.payment_method || 'Unknown'
    const c = payMap.get(m) ?? { total: 0, count: 0 }
    payMap.set(m, { total: c.total + inv.total, count: c.count + 1 })
  }
  const byPayment = [...payMap.entries()].map(([m, d]) => ({ method: m, ...d })).sort((a, b) => b.total - a.total)

  // Order types
  const typeAcc = { dineIn: 0, dineInN: 0, takeout: 0, takeoutN: 0, delivery: 0, deliveryN: 0 }
  for (const inv of invoices) {
    const t = (inv.table_num ?? '').toLowerCase().trim()
    if (t === 'takeout' || t === 'take out' || t === 'take-out') { typeAcc.takeout += inv.total; typeAcc.takeoutN++ }
    else if (t.includes('delivery') || t.includes('deliver'))    { typeAcc.delivery += inv.total; typeAcc.deliveryN++ }
    else                                                          { typeAcc.dineIn  += inv.total; typeAcc.dineInN++  }
  }
  const orderTypes = [
    { label: 'Dine-in',  total: typeAcc.dineIn,   count: typeAcc.dineInN   },
    { label: 'Takeout',  total: typeAcc.takeout,  count: typeAcc.takeoutN  },
    { label: 'Delivery', total: typeAcc.delivery, count: typeAcc.deliveryN },
  ].filter(t => t.count > 0)

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
    const c = inv.cashier || 'Unknown'
    const cur = cashierMap.get(c) ?? { total: 0, count: 0 }
    cashierMap.set(c, { total: cur.total + inv.total, count: cur.count + 1 })
  }
  const byCashier = [...cashierMap.entries()].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total)

  const now       = new Date()
  const dateStr   = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr   = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })

  const handlePrint = () => {
    const el = receiptRef.current
    if (!el) return
    const win = window.open('', '_blank', 'width=400,height=800')
    if (!win) return
    win.document.write(`
      <html><head><title>Daily Sales - ${dateStr}</title>
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
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Daily Sales</span>
              </div>
              <div className="flex items-center gap-2">
                {!loading && txCount > 0 && (
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 active:scale-95 transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print
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
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black mt-0.5">Daily Sales Report</p>
                    <p className="text-xs font-bold text-black mt-1">{dateStr} &nbsp;·&nbsp; {timeStr}</p>
                  </div>

                  <DoubleLine />

                  {txCount === 0 ? (
                    <p className="text-center text-xs font-bold text-black py-8">No sales recorded today.</p>
                  ) : (
                    <>
                      {/* ── Summary ────────────────────────────── */}
                      <Row label="Transactions"    value={String(txCount)} />
                      <Row label="Total Revenue"   value={formatPrice(totalRevenue)} large />
                      <Row label="Avg Order Value" value={formatPrice(avgOrder)} />
                      <Row label="Guests Served"   value={String(totalGuests)} />

                      <Divider dashed />
                      <Row label="Total Discounts" value={formatPrice(totalDiscount)} hiColor="text-rose-600" />
                      <Row label="Change Given"    value={formatPrice(totalChange)} />

                      {/* ── Payment Methods ────────────────────── */}
                      <DoubleLine />
                      <SectionTitle>Payment Methods</SectionTitle>
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
                          <SectionTitle>Order Types</SectionTitle>
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
                      <SectionTitle>Customer Split</SectionTitle>
                      <Divider dashed />
                      <div className="flex items-baseline justify-between py-[3px]">
                        <span className="text-xs font-bold text-black">Member</span>
                        <span className="text-xs font-bold text-black mx-2">{memberInvs.length}×</span>
                        <span className="text-xs tabular-nums font-mono font-bold text-black ml-auto">{formatPrice(memberTotal)}</span>
                      </div>
                      <div className="flex items-baseline justify-between py-[3px]">
                        <span className="text-xs font-bold text-black">Walk-in</span>
                        <span className="text-xs font-bold text-black mx-2">{walkInInvs.length}×</span>
                        <span className="text-xs tabular-nums font-mono font-bold text-black ml-auto">{formatPrice(walkInTotal)}</span>
                      </div>

                      {/* ── Top Items ──────────────────────────── */}
                      {topItems.length > 0 && (
                        <>
                          <DoubleLine />
                          <SectionTitle>Top Selling Items</SectionTitle>
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
                          <SectionTitle>By Cashier</SectionTitle>
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
                      <SectionTitle>Expenses & Net Profit</SectionTitle>
                      <Divider dashed />
                      <Row label="Gross Revenue" value={formatPrice(totalRevenue)} />
                      <Row label="Paid Expenses" value={`- ${formatPrice(totalExpenses)}`} hiColor="text-rose-600" />
                      <Divider />
                      <Row label="NET PROFIT" value={formatPrice(netProfit)} large hiColor={netProfit >= 0 ? 'text-green-700' : 'text-red-600'} />

                      <DoubleLine />

                      {/* Footer */}
                      <p className="text-center text-[9px] font-black text-black mt-3 tracking-widest uppercase">End of Report</p>
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
