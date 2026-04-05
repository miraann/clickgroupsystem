'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, Search, X, ChevronDown,
  Loader2, FileText, Download, Receipt, User,
  Calendar, Eye, RefreshCw, ShoppingBag, ArrowUpRight,
} from 'lucide-react'
import InvoiceModal from '@/components/restaurant/invoice-modal'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────
interface Invoice {
  id: string
  invoice_num: string
  order_num: string | null
  table_num: string | null
  guests: number | null
  cashier: string | null
  payment_method: string | null
  items: { name: string; qty: number; price: number }[] | null
  subtotal: number
  discount: number | null
  surcharge: number | null
  total: number
  amount_paid: number | null
  change_amount: number | null
  customer_name: string | null
  customer_phone: string | null
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, formatPrice }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0d1220] border border-white/15 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-white/50 mb-0.5">{label}</p>
      <p className="text-amber-400 font-bold">{formatPrice(payload[0].value)}</p>
      <p className="text-white/30">{payload[1]?.value ?? 0} invoices</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function SalesPage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [invoices, setInvoices]         = useState<Invoice[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterMethod, setFilterMethod] = useState('all')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [selected, setSelected]         = useState<Invoice | null>(null)
  const [chartData, setChartData]       = useState<{ day: string; revenue: number; count: number }[]>([])
  const [methods, setMethods]           = useState<string[]>([])

  // ── Load ──────────────────────────────────────────────────────
  const load = useCallback(async (rid: string, from = '', to = '') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from('invoices')
      .select('*')
      .eq('restaurant_id', rid)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (from) q = q.gte('created_at', `${from}T00:00:00`)
    if (to)   q = q.lte('created_at', `${to}T23:59:59`)

    const { data } = await q
    const rows = (data ?? []) as Invoice[]
    setInvoices(rows)

    // Unique payment methods
    const uniqueMethods = [...new Set(rows.map(r => r.payment_method).filter(Boolean))] as string[]
    setMethods(uniqueMethods)

    // 7-day chart
    const now = new Date()
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (6 - i))
      const dateStr = d.toISOString().slice(0, 10)
      const dayRows = rows.filter(r => r.created_at.startsWith(dateStr))
      return {
        day: d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
        revenue: dayRows.reduce((s, r) => s + (r.total ?? 0), 0),
        count:   dayRows.length,
      }
    })
    setChartData(days)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('restaurants').select('id').limit(1).maybeSingle().then(({ data: rest }) => {
      if (!rest) return
      setRestaurantId(rest.id)
      load(rest.id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time
  useEffect(() => {
    if (!restaurantId) return
    const ch = supabase.channel('sales-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoices', filter: `restaurant_id=eq.${restaurantId}` },
        () => load(restaurantId, dateFrom, dateTo))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restaurantId, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── KPIs ──────────────────────────────────────────────────────
  const totalRevenue = invoices.reduce((s, r) => s + (r.total ?? 0), 0)
  const totalCount   = invoices.length
  const avgTicket    = totalCount > 0 ? totalRevenue / totalCount : 0

  // Growth: compare last 7 days vs previous 7 days
  const now7  = new Date(); now7.setDate(now7.getDate() - 7)
  const now14 = new Date(); now14.setDate(now14.getDate() - 14)
  const last7Rev  = invoices.filter(r => new Date(r.created_at) >= now7).reduce((s, r) => s + r.total, 0)
  const prev7Rev  = invoices.filter(r => new Date(r.created_at) >= now14 && new Date(r.created_at) < now7).reduce((s, r) => s + r.total, 0)
  const growth    = prev7Rev > 0 ? ((last7Rev - prev7Rev) / prev7Rev) * 100 : 0

  // ── Filter ────────────────────────────────────────────────────
  const visible = invoices.filter(r => {
    const q = search.toLowerCase()
    if (q && !r.invoice_num?.toLowerCase().includes(q) &&
             !(r.customer_name ?? '').toLowerCase().includes(q) &&
             !(r.cashier ?? '').toLowerCase().includes(q) &&
             !(r.table_num ?? '').includes(q)) return false
    if (filterMethod !== 'all' && r.payment_method !== filterMethod) return false
    return true
  })

  // ── Export CSV ────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['Invoice','Order','Table','Cashier','Customer','Payment','Subtotal','Discount','Total','Date']
    const rows = visible.map(r => [
      r.invoice_num, r.order_num ?? '', r.table_num ?? '', r.cashier ?? '',
      r.customer_name ?? '', r.payment_method ?? '',
      r.subtotal, r.discount ?? 0, r.total,
      new Date(r.created_at).toLocaleString(),
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'sales.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/8 to-transparent border border-amber-500/25 p-5">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-amber-500/8 blur-2xl" />
          <p className="text-xs font-semibold text-amber-400/70 uppercase tracking-wider mb-1">Total Revenue</p>
          <p className="text-2xl font-extrabold text-white tabular-nums leading-tight">{formatPrice(totalRevenue)}</p>
          <p className="text-xs text-white/30 mt-1">{totalCount} invoices</p>
          <TrendingUp className="absolute bottom-4 right-4 w-8 h-8 text-amber-500/15" />
        </div>

        {/* Invoices */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/20 via-blue-500/8 to-transparent border border-blue-500/25 p-5">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-blue-500/8 blur-2xl" />
          <p className="text-xs font-semibold text-blue-400/70 uppercase tracking-wider mb-1">Total Invoices</p>
          <p className="text-2xl font-extrabold text-white tabular-nums leading-tight">{totalCount}</p>
          <p className="text-xs text-white/30 mt-1">transactions</p>
          <Receipt className="absolute bottom-4 right-4 w-8 h-8 text-blue-500/15" />
        </div>

        {/* Avg ticket */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/20 via-violet-500/8 to-transparent border border-violet-500/25 p-5">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-violet-500/8 blur-2xl" />
          <p className="text-xs font-semibold text-violet-400/70 uppercase tracking-wider mb-1">Avg. Ticket</p>
          <p className="text-2xl font-extrabold text-white tabular-nums leading-tight">{formatPrice(avgTicket)}</p>
          <p className="text-xs text-white/30 mt-1">per invoice</p>
          <ShoppingBag className="absolute bottom-4 right-4 w-8 h-8 text-violet-500/15" />
        </div>

        {/* Growth */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/8 to-transparent border border-emerald-500/25 p-5">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-emerald-500/8 blur-2xl" />
          <p className="text-xs font-semibold text-emerald-400/70 uppercase tracking-wider mb-1">7-Day Growth</p>
          <div className="flex items-end gap-2">
            <p className={cn('text-2xl font-extrabold tabular-nums leading-tight', growth >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
            </p>
            {growth >= 0
              ? <TrendingUp className="w-4 h-4 text-emerald-400 mb-1" />
              : <TrendingDown className="w-4 h-4 text-rose-400 mb-1" />
            }
          </div>
          <p className="text-xs text-white/30 mt-1">vs previous 7 days</p>
          <ArrowUpRight className="absolute bottom-4 right-4 w-8 h-8 text-emerald-500/15" />
        </div>
      </div>

      {/* ── Revenue Chart ── */}
      <div className="rounded-2xl bg-white/4 border border-white/8 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white/60">Revenue · Last 7 Days</p>
          <button
            onClick={() => restaurantId && load(restaurantId, dateFrom, dateTo)}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-amber-400 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />Refresh
          </button>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<ChartTooltip formatPrice={formatPrice} />} />
            <Area type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2}
              fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
            <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={1.5}
              fill="transparent" dot={false} activeDot={{ r: 3, fill: '#3b82f6' }} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 rounded-full inline-block" /><span className="text-[10px] text-white/30">Revenue</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-400 rounded-full inline-block border-dashed" /><span className="text-[10px] text-white/30">Invoices</span></div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoice, customer, table, cashier…"
            className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
        </div>

        {/* Date from */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl">
          <Calendar className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input type="date" value={dateFrom}
            onChange={e => { const v = e.target.value; setDateFrom(v); if (restaurantId) load(restaurantId, v, dateTo) }}
            className="bg-transparent text-sm text-white/70 focus:outline-none w-32 [color-scheme:dark] cursor-pointer" />
        </div>
        <span className="text-white/20 text-xs">to</span>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl">
          <Calendar className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input type="date" value={dateTo}
            onChange={e => { const v = e.target.value; setDateTo(v); if (restaurantId) load(restaurantId, dateFrom, v) }}
            className="bg-transparent text-sm text-white/70 focus:outline-none w-32 [color-scheme:dark] cursor-pointer" />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); if (restaurantId) load(restaurantId) }}
            className="text-white/25 hover:text-rose-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
        )}

        {/* Payment method */}
        <div className="relative">
          <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none cursor-pointer">
            <option value="all">All Methods</option>
            {methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        {/* Export */}
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-amber-500/30 hover:text-amber-400 text-white/40 text-xs font-medium transition-all active:scale-95">
          <Download className="w-3.5 h-3.5" />Export CSV
        </button>
      </div>

      {/* ── Invoices Table ── */}
      <div className="rounded-2xl border border-white/8">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-5 py-3 bg-white/3 border-b border-white/8 rounded-t-2xl text-xs font-semibold text-white/30 uppercase tracking-wider">
          <span className="w-32">Invoice</span>
          <span>Customer / Cashier</span>
          <span className="w-28 text-center">Method</span>
          <span className="w-28 text-right">Amount</span>
          <span className="w-32">Date</span>
          <span className="w-20" />
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/30 text-sm">No invoices found</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map(inv => (
              <div
                key={inv.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-5 py-3.5 items-center hover:bg-white/3 transition-colors group"
              >
                {/* Invoice num */}
                <div className="w-32">
                  <p className="text-xs font-bold text-amber-400 tabular-nums font-mono">{inv.invoice_num}</p>
                  {inv.table_num && <p className="text-[10px] text-white/30">Table {inv.table_num}</p>}
                </div>

                {/* Customer / cashier */}
                <div className="min-w-0">
                  <p className="text-sm text-white/80 truncate">{inv.customer_name ?? '—'}</p>
                  <p className="text-[10px] text-white/30 flex items-center gap-1">
                    <User className="w-2.5 h-2.5" />{inv.cashier ?? 'Staff'}
                  </p>
                </div>

                {/* Method */}
                <div className="w-28 flex justify-center">
                  <span className="px-2.5 py-1 rounded-lg bg-white/8 border border-white/10 text-xs text-white/60 font-medium">
                    {inv.payment_method ?? '—'}
                  </span>
                </div>

                {/* Amount */}
                <div className="w-28 text-right">
                  <p className="text-sm font-bold text-white tabular-nums">{formatPrice(inv.total ?? 0)}</p>
                  {inv.discount != null && inv.discount > 0 && (
                    <p className="text-[10px] text-emerald-400/70 tabular-nums">−{formatPrice(inv.discount)}</p>
                  )}
                </div>

                {/* Date */}
                <div className="w-32">
                  <p className="text-xs text-white/60">{fmtDate(inv.created_at)}</p>
                  <p className="text-[10px] text-white/30">{fmtTime(inv.created_at)}</p>
                </div>

                {/* View button */}
                <div className="w-20 flex justify-end">
                  <button
                    onClick={() => setSelected(inv)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/15 border border-white/8 hover:border-amber-500/30 text-white/40 hover:text-amber-400 text-xs font-medium transition-all active:scale-95"
                  >
                    <Eye className="w-3.5 h-3.5" />View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer count */}
      {visible.length > 0 && (
        <p className="text-xs text-white/25 text-right">
          {visible.length} invoice{visible.length !== 1 ? 's' : ''} · {formatPrice(visible.reduce((s, r) => s + r.total, 0))} total
        </p>
      )}

      {/* ── Invoice Modal ── */}
      {selected && restaurantId && (
        <InvoiceModal
          mode="payment"
          orderId={selected.id}
          restaurantId={restaurantId}
          tableNum={selected.table_num ?? ''}
          guests={selected.guests ?? 0}
          items={(selected.items ?? []) as { name: string; price: number; qty: number }[]}
          subtotal={selected.subtotal ?? 0}
          discount={selected.discount ?? 0}
          surcharge={selected.surcharge ?? 0}
          total={selected.total ?? 0}
          paymentMethod={selected.payment_method ?? ''}
          amountPaid={selected.amount_paid ?? selected.total ?? 0}
          changeAmount={selected.change_amount ?? 0}
          cashier={selected.cashier ?? 'Staff'}
          customerName={selected.customer_name ?? null}
          customerPhone={selected.customer_phone ?? null}
          invoiceNum={selected.invoice_num}
          orderNum={selected.order_num ?? ''}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
