'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3, TrendingUp, TrendingDown, Download, RefreshCw,
  Loader2, DollarSign, Receipt, ShoppingBag, Users,
  CreditCard, Calendar, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────
interface Invoice {
  id: string
  total: number
  subtotal: number
  discount: number | null
  payment_method: string | null
  items: { name: string; qty: number; price: number }[] | null
  cashier: string | null
  guests: number | null
  created_at: string
}
interface Expense {
  id: string
  amount: number
  category: string | null
  date: string
}

type Range = 'today' | 'week' | 'month' | 'custom'

const RANGE_LABELS: Record<Range, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', custom: 'Custom',
}

const PIE_COLORS = ['#f59e0b','#6366f1','#10b981','#ec4899','#3b82f6','#f97316','#8b5cf6']

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, formatPrice }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0d1220] border border-white/15 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue') ? formatPrice(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function ReportPage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [range, setRange]               = useState<Range>('month')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [loading, setLoading]           = useState(true)

  const [invoices, setInvoices]         = useState<Invoice[]>([])
  const [expenses, setExpenses]         = useState<Expense[]>([])

  // ── Date bounds ──────────────────────────────────────────────────
  const getBounds = useCallback((r: Range, from: string, to: string) => {
    const now   = new Date()
    const today = now.toISOString().slice(0, 10)
    if (r === 'today')  return { from: today, to: today }
    if (r === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { from: d.toISOString().slice(0, 10), to: today }
    }
    if (r === 'month') {
      const d = new Date(now); d.setDate(d.getDate() - 29)
      return { from: d.toISOString().slice(0, 10), to: today }
    }
    return { from, to }
  }, [])

  const load = useCallback(async (rid: string, r: Range, from: string, to: string) => {
    setLoading(true)
    const { from: f, to: t } = getBounds(r, from, to)
    const fromISO = f ? `${f}T00:00:00` : ''
    const toISO   = t ? `${t}T23:59:59` : ''

    let invQ = supabase.from('invoices').select('id,total,subtotal,discount,payment_method,items,cashier,guests,created_at').eq('restaurant_id', rid).order('created_at')
    if (fromISO) invQ = invQ.gte('created_at', fromISO)
    if (toISO)   invQ = invQ.lte('created_at', toISO)

    let expQ = supabase.from('expenses').select('id,amount,category,date').eq('restaurant_id', rid)
    if (f) expQ = expQ.gte('date', f)
    if (t) expQ = expQ.lte('date', t)

    const [{ data: invData }, { data: expData }] = await Promise.all([invQ, expQ])
    setInvoices((invData ?? []) as Invoice[])
    setExpenses((expData ?? []) as Expense[])
    setLoading(false)
  }, [getBounds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('restaurants').select('id').limit(1).maybeSingle().then(({ data }) => {
      if (data?.id) { setRestaurantId(data.id); load(data.id, range, dateFrom, dateTo) }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRange = (r: Range) => { setRange(r); if (restaurantId) load(restaurantId, r, dateFrom, dateTo) }
  const handleSearch = () => { if (restaurantId) load(restaurantId, 'custom', dateFrom, dateTo) }

  // ── Computed metrics ─────────────────────────────────────────────
  const totalRevenue  = invoices.reduce((s, i) => s + (i.total ?? 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const netProfit     = totalRevenue - totalExpenses
  const totalOrders   = invoices.length
  const avgTicket     = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const totalGuests   = invoices.reduce((s, i) => s + (i.guests ?? 0), 0)
  const totalDiscount = invoices.reduce((s, i) => s + (i.discount ?? 0), 0)

  // Daily revenue chart
  const dailyMap = new Map<string, number>()
  invoices.forEach(inv => {
    const d = fmtDay(inv.created_at)
    dailyMap.set(d, (dailyMap.get(d) ?? 0) + inv.total)
  })
  const dailyData = Array.from(dailyMap.entries()).map(([date, revenue]) => ({ date, revenue }))

  // Payment method breakdown
  const pmMap = new Map<string, number>()
  invoices.forEach(inv => {
    const pm = inv.payment_method ?? 'Unknown'
    pmMap.set(pm, (pmMap.get(pm) ?? 0) + inv.total)
  })
  const pmData = Array.from(pmMap.entries()).map(([name, value]) => ({ name, value }))

  // Top items
  const itemMap = new Map<string, { qty: number; revenue: number }>()
  invoices.forEach(inv => {
    (inv.items ?? []).forEach(item => {
      const cur = itemMap.get(item.name) ?? { qty: 0, revenue: 0 }
      itemMap.set(item.name, { qty: cur.qty + item.qty, revenue: cur.revenue + item.price * item.qty })
    })
  })
  const topItems = Array.from(itemMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)

  // Cashier performance
  const cashierMap = new Map<string, { orders: number; revenue: number }>()
  invoices.forEach(inv => {
    const c = inv.cashier ?? 'Staff'
    const cur = cashierMap.get(c) ?? { orders: 0, revenue: 0 }
    cashierMap.set(c, { orders: cur.orders + 1, revenue: cur.revenue + inv.total })
  })
  const cashierData = Array.from(cashierMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)

  // Expense by category
  const expCatMap = new Map<string, number>()
  expenses.forEach(e => {
    const cat = e.category ?? 'Other'
    expCatMap.set(cat, (expCatMap.get(cat) ?? 0) + e.amount)
  })
  const expCatData = Array.from(expCatMap.entries()).map(([name, value]) => ({ name, value }))

  // CSV export
  const exportCSV = () => {
    const rows = [
      ['Date', 'Invoice', 'Payment', 'Cashier', 'Guests', 'Subtotal', 'Discount', 'Total'],
      ...invoices.map(i => [
        new Date(i.created_at).toLocaleDateString('en-GB'),
        i.id.slice(-6).toUpperCase(),
        i.payment_method ?? '',
        i.cashier ?? '',
        i.guests ?? 0,
        i.subtotal ?? 0,
        i.discount ?? 0,
        i.total,
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  const KPIs = [
    { label: 'Total Revenue',   value: formatPrice(totalRevenue),   icon: DollarSign,  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20', trend: null },
    { label: 'Net Profit',      value: formatPrice(netProfit),      icon: TrendingUp,  color: netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400', bg: netProfit >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10', border: netProfit >= 0 ? 'border-emerald-500/20' : 'border-rose-500/20', trend: null },
    { label: 'Total Orders',    value: totalOrders,                  icon: Receipt,     color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', trend: null },
    { label: 'Avg Ticket',      value: formatPrice(avgTicket),      icon: BarChart3,   color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   trend: null },
    { label: 'Total Guests',    value: totalGuests,                  icon: Users,       color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',   trend: null },
    { label: 'Total Expenses',  value: formatPrice(totalExpenses),  icon: ShoppingBag, color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20',   trend: null },
    { label: 'Total Discounts', value: formatPrice(totalDiscount),  icon: ArrowDownRight, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', trend: null },
    { label: 'Payment Methods', value: pmData.length,               icon: CreditCard,  color: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/20',   trend: null },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Report</h1>
          <p className="text-xs text-white/35 mt-0.5">Financial overview and performance analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => restaurantId && load(restaurantId, range, dateFrom, dateTo)}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/25 transition-all active:scale-95">
            <Download className="w-4 h-4" />Export CSV
          </button>
        </div>
      </div>

      {/* Date range */}
      <div className="rounded-2xl bg-white/3 border border-white/8 p-4 space-y-3">
        {/* Quick range buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['today','week','month'] as Range[]).map(r => (
            <button key={r} onClick={() => handleRange(r)}
              className={cn('px-4 py-2 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                range === r ? 'bg-amber-500/20 border-amber-500/35 text-amber-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70')}>
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        {/* Always-visible from / to date pickers */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-white/30 shrink-0" />
            <span className="text-xs text-white/40 shrink-0">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm focus:outline-none focus:border-amber-500/40 [color-scheme:dark] cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 shrink-0">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm focus:outline-none focus:border-amber-500/40 [color-scheme:dark] cursor-pointer"
            />
          </div>
          <button
            onClick={() => { setRange('custom'); handleSearch() }}
            className="px-5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/30 transition-all active:scale-95"
          >
            Apply
          </button>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); handleRange('month') }}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {KPIs.map(kpi => (
              <div key={kpi.label} className={cn('rounded-2xl border p-4', kpi.bg, kpi.border)}>
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-3', kpi.bg, 'border', kpi.border)}>
                  <kpi.icon className={cn('w-4 h-4', kpi.color)} />
                </div>
                <p className="text-xs text-white/40 mb-0.5">{kpi.label}</p>
                <p className={cn('text-xl font-bold tabular-nums', kpi.color)}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Revenue chart */}
          {dailyData.length > 0 && (
            <div className="rounded-2xl bg-white/3 border border-white/8 p-5">
              <p className="text-sm font-semibold text-white/70 mb-4">Daily Revenue</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatPrice(v)} width={70} />
                  <Tooltip content={<ChartTooltip formatPrice={formatPrice} />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#f59e0b" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Payment method breakdown */}
            {pmData.length > 0 && (
              <div className="rounded-2xl bg-white/3 border border-white/8 p-5">
                <p className="text-sm font-semibold text-white/70 mb-4">Revenue by Payment Method</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pmData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {pmData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatPrice(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {pmData.map((pm, i) => (
                    <div key={pm.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-white/60">{pm.name}</span>
                      </div>
                      <span className="text-white/80 font-semibold tabular-nums">{formatPrice(pm.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expense by category */}
            {expCatData.length > 0 && (
              <div className="rounded-2xl bg-white/3 border border-white/8 p-5">
                <p className="text-sm font-semibold text-white/70 mb-4">Expenses by Category</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={expCatData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatPrice(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip formatter={(v) => formatPrice(Number(v))} />
                    <Bar dataKey="value" name="Amount" radius={[0, 6, 6, 0]}>
                      {expCatData.map((_, i) => <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Top selling items */}
          {topItems.length > 0 && (
            <div className="rounded-2xl bg-white/3 border border-white/8 p-5">
              <p className="text-sm font-semibold text-white/70 mb-4">Top Selling Items</p>
              <div className="space-y-2">
                {topItems.map((item, i) => {
                  const pct = topItems[0].revenue > 0 ? (item.revenue / topItems[0].revenue) * 100 : 0
                  return (
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-white/25 w-5 text-right shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-white/80 truncate">{item.name}</span>
                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            <span className="text-xs text-white/40">{item.qty} sold</span>
                            <span className="text-sm font-bold text-amber-400 tabular-nums">{formatPrice(item.revenue)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500/60 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Cashier performance */}
          {cashierData.length > 0 && (
            <div className="rounded-2xl bg-white/3 border border-white/8 p-5">
              <p className="text-sm font-semibold text-white/70 mb-4">Staff Performance</p>
              <div className="divide-y divide-white/5">
                {cashierData.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400 shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white/80 truncate">{c.name}</p>
                        <p className="text-xs text-white/35">{c.orders} orders</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-violet-400 tabular-nums">{formatPrice(c.revenue)}</p>
                      <p className="text-xs text-white/35">{formatPrice(c.orders > 0 ? c.revenue / c.orders : 0)} avg</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoices.length === 0 && expenses.length === 0 && (
            <div className="text-center py-16">
              <BarChart3 className="w-10 h-10 text-white/15 mx-auto mb-3" />
              <p className="text-white/30 text-sm">No data for selected period</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
