'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, Download, Loader2,
  DollarSign, ShoppingBag, Wallet,
  ArrowUpRight, ArrowDownRight, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { BUILTIN_CATS } from '../expense/types'
import type { Expense, Category } from '../expense/types'

// ── Types ─────────────────────────────────────────────────────────
interface Invoice {
  id: string
  invoice_num: string
  payment_method: string | null
  total: number
  created_at: string
}

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today'      },
  { key: 'week',  label: 'This Week'  },
  { key: 'month', label: 'This Month' },
  { key: 'year',  label: 'This Year'  },
  { key: 'custom',label: 'Custom'     },
]

// ── Date helpers ──────────────────────────────────────────────────
function getBounds(p: Period, from: string, to: string) {
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  if (p === 'today')  return { from: today, to: today }
  if (p === 'week')   { const d = new Date(now); d.setDate(d.getDate() - 6);            return { from: d.toISOString().slice(0, 10), to: today } }
  if (p === 'month')  { const d = new Date(now); d.setDate(d.getDate() - 29);           return { from: d.toISOString().slice(0, 10), to: today } }
  if (p === 'year')   { const d = new Date(now); d.setFullYear(d.getFullYear() - 1);    return { from: d.toISOString().slice(0, 10), to: today } }
  return { from, to }
}

function getPrevBounds(p: Period, curFrom: string, curTo: string) {
  if (p === 'today') {
    const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().slice(0, 10)
    return { from: s, to: s }
  }
  if (p === 'week') {
    const f = new Date(); f.setDate(f.getDate() - 13)
    const t = new Date(); t.setDate(t.getDate() - 7)
    return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) }
  }
  if (p === 'month') {
    const f = new Date(); f.setDate(f.getDate() - 59)
    const t = new Date(); t.setDate(t.getDate() - 30)
    return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) }
  }
  if (p === 'year') {
    const f = new Date(); f.setFullYear(f.getFullYear() - 2)
    const t = new Date(); t.setFullYear(t.getFullYear() - 1)
    return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) }
  }
  // custom: same duration shifted back by one day before curFrom
  const ms   = new Date(curTo).getTime() - new Date(curFrom).getTime() + 86400000
  const tEnd = new Date(new Date(curFrom).getTime() - 86400000)
  const fStr = new Date(tEnd.getTime() - ms + 86400000)
  return { from: fStr.toISOString().slice(0, 10), to: tEnd.toISOString().slice(0, 10) }
}

function fmtShort(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// ── Tooltip ───────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, formatPrice }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0d1220] border border-white/15 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-white/50 mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {formatPrice(p.value)}
        </p>
      ))}
    </div>
  )
}

// ── Trend badge ───────────────────────────────────────────────────
function Trend({ pct, inverse = false }: { pct: number | null; inverse?: boolean }) {
  if (pct === null) return <span className="text-[11px] text-white/25">No prev data</span>
  const positive = inverse ? pct <= 0 : pct >= 0
  return (
    <span className={cn('flex items-center gap-0.5 text-[11px] font-semibold', positive ? 'text-emerald-400' : 'text-rose-400')}>
      {pct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}% vs prev period
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function FinancePage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [period, setPeriod]             = useState<Period>('month')
  const [customFrom, setCustomFrom]     = useState('')
  const [customTo, setCustomTo]         = useState('')
  const [loading, setLoading]           = useState(true)

  const [invoices, setInvoices]         = useState<Invoice[]>([])
  const [expenses, setExpenses]         = useState<Expense[]>([])
  const [categories, setCategories]     = useState<Category[]>(BUILTIN_CATS)
  const [prevRevenue, setPrevRevenue]   = useState(0)
  const [prevExpTotal, setPrevExpTotal] = useState(0)

  const load = useCallback(async (rid: string, p: Period, from: string, to: string) => {
    setLoading(true)
    const { from: f, to: t } = getBounds(p, from, to)
    const { from: pf, to: pt } = getPrevBounds(p, f, t)

    const [
      { data: invData },
      { data: expData },
      { data: prevInvData },
      { data: prevExpData },
      { data: catData },
    ] = await Promise.all([
      supabase.from('invoices').select('id,invoice_num,payment_method,total,created_at')
        .eq('restaurant_id', rid).gte('created_at', `${f}T00:00:00`).lte('created_at', `${t}T23:59:59`).order('created_at'),
      supabase.from('expenses').select('*')
        .eq('restaurant_id', rid).gte('created_at', `${f}T00:00:00`).lte('created_at', `${t}T23:59:59`).order('created_at', { ascending: false }),
      supabase.from('invoices').select('total')
        .eq('restaurant_id', rid).gte('created_at', `${pf}T00:00:00`).lte('created_at', `${pt}T23:59:59`),
      supabase.from('expenses').select('amount')
        .eq('restaurant_id', rid).gte('created_at', `${pf}T00:00:00`).lte('created_at', `${pt}T23:59:59`),
      supabase.from('expense_categories').select('id,name,color').eq('restaurant_id', rid),
    ])

    setInvoices((invData ?? []) as Invoice[])
    setExpenses((expData ?? []) as Expense[])
    setPrevRevenue((prevInvData ?? []).reduce((s: number, i: { total: number }) => s + (i.total ?? 0), 0))
    setPrevExpTotal((prevExpData ?? []).reduce((s: number, e: { amount: number }) => s + (e.amount ?? 0), 0))
    if (catData && catData.length > 0) setCategories(catData as Category[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const rid = localStorage.getItem('restaurant_id')
    if (rid) { setRestaurantId(rid); load(rid, 'month', '', '') }
    else setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePeriod = (p: Period) => {
    setPeriod(p)
    if (restaurantId && p !== 'custom') load(restaurantId, p, '', '')
  }

  // ── KPIs ──────────────────────────────────────────────────────
  const totalRevenue  = invoices.reduce((s, i) => s + (i.total  ?? 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const netProfit     = totalRevenue - totalExpenses
  const prevProfit    = prevRevenue - prevExpTotal

  const revGrowth  = prevRevenue  > 0           ? ((totalRevenue  - prevRevenue)  / prevRevenue)          * 100 : null
  const expGrowth  = prevExpTotal > 0           ? ((totalExpenses - prevExpTotal) / prevExpTotal)          * 100 : null
  const profGrowth = prevProfit   !== 0         ? ((netProfit     - prevProfit)   / Math.abs(prevProfit))  * 100 : null

  // ── Chart ──────────────────────────────────────────────────────
  const salesByDay = new Map<string, number>()
  invoices.forEach(i => { const d = i.created_at.slice(0, 10); salesByDay.set(d, (salesByDay.get(d) ?? 0) + i.total) })
  const expByDay   = new Map<string, number>()
  expenses.forEach(e => { const d = e.created_at.slice(0, 10); expByDay.set(d, (expByDay.get(d) ?? 0) + e.amount) })

  const allDates  = new Set([...salesByDay.keys(), ...expByDay.keys()])
  const chartData = Array.from(allDates).sort().map(date => ({
    date:     fmtShort(date),
    Revenue:  salesByDay.get(date) ?? 0,
    Expenses: expByDay.get(date)   ?? 0,
  }))

  // ── Payment method breakdown ───────────────────────────────────
  const pmMap = new Map<string, number>()
  invoices.forEach(i => { const pm = i.payment_method ?? 'Other'; pmMap.set(pm, (pmMap.get(pm) ?? 0) + i.total) })
  const pmData = Array.from(pmMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const pmMax  = pmData[0]?.value ?? 1

  // ── Expense category breakdown ─────────────────────────────────
  const allCats = [...BUILTIN_CATS, ...categories.filter(c => !BUILTIN_CATS.find(b => b.id === c.id))]
  const catMap  = new Map<string, { name: string; color: string; value: number }>()
  expenses.forEach(e => {
    const cat = allCats.find(c => c.id === e.category_id) ?? { id: 'other', name: 'Other', color: '#6b7280' }
    const ex  = catMap.get(cat.id)
    if (ex) ex.value += e.amount
    else catMap.set(cat.id, { name: cat.name, color: cat.color, value: e.amount })
  })
  const catData = Array.from(catMap.values()).sort((a, b) => b.value - a.value)
  const catMax  = catData[0]?.value ?? 1

  // ── Transaction timeline ───────────────────────────────────────
  type TxRow = { kind: 'sale' | 'expense'; id: string; label: string; sub: string; amount: number; date: string }
  const timeline: TxRow[] = [
    ...invoices.map(i => ({ kind: 'sale'    as const, id: i.id, label: i.invoice_num ?? 'Invoice', sub: i.payment_method ?? 'Cash', amount: i.total,  date: i.created_at })),
    ...expenses.map(e => {
      const cat = allCats.find(c => c.id === e.category_id)
      return { kind: 'expense' as const, id: e.id, label: e.title, sub: cat?.name ?? 'Expense', amount: e.amount, date: e.created_at }
    }),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60)

  // ── CSV export ─────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Type', 'Description', 'Category / Method', 'Amount', 'Date'],
      ...invoices.map(i => ['Sale',    i.invoice_num ?? '', i.payment_method ?? '',                                    String(i.total),  i.created_at.slice(0, 10)]),
      ...expenses.map(e => ['Expense', e.title,             allCats.find(c => c.id === e.category_id)?.name ?? 'Other', String(e.amount), e.created_at.slice(0, 10)]),
    ]
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `finance-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Financial Overview</h1>
          <p className="text-xs text-white/40 mt-0.5">Sales · Expenses · Net Profit</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 text-xs text-white/50 hover:text-white/70 transition-all active:scale-95">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-white/4 border border-white/8">
          {PERIODS.map(({ key, label }) => (
            <button key={key} onClick={() => handlePeriod(key)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                period === key
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-white/40 hover:text-white/70')}>
              {label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="bg-transparent text-xs text-white/70 focus:outline-none w-28 cursor-pointer [color-scheme:dark]" />
            </div>
            <span className="text-white/25 text-xs">to</span>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="bg-transparent text-xs text-white/70 focus:outline-none w-28 cursor-pointer [color-scheme:dark]" />
            </div>
            <button
              onClick={() => { if (restaurantId && customFrom && customTo) load(restaurantId, 'custom', customFrom, customTo) }}
              disabled={!customFrom || !customTo}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-xs text-white font-medium transition-all active:scale-95">
              Apply
            </button>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Revenue */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent border border-emerald-500/25 p-5">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-emerald-400/70 uppercase tracking-wider">Total Revenue</p>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-white tabular-nums">{formatPrice(totalRevenue)}</p>
          <div className="mt-2 flex items-center justify-between">
            <Trend pct={revGrowth} />
            <span className="text-[10px] text-white/25">{invoices.length} invoices</span>
          </div>
          {invoices.length > 0 && (
            <p className="text-[10px] text-white/30 mt-1">
              Avg {formatPrice(totalRevenue / invoices.length)} / order
            </p>
          )}
        </div>

        {/* Expenses */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500/20 via-rose-500/10 to-transparent border border-rose-500/25 p-5">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-rose-500/10 blur-2xl" />
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-rose-400/70 uppercase tracking-wider">Total Expenses</p>
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-white tabular-nums">{formatPrice(totalExpenses)}</p>
          <div className="mt-2 flex items-center justify-between">
            <Trend pct={expGrowth} inverse />
            <span className="text-[10px] text-white/25">{expenses.length} entries</span>
          </div>
          {totalRevenue > 0 && (
            <p className="text-[10px] text-white/30 mt-1">
              {((totalExpenses / totalRevenue) * 100).toFixed(1)}% of revenue
            </p>
          )}
        </div>

        {/* Net Profit */}
        <div className={cn('relative overflow-hidden rounded-2xl p-5 border',
          netProfit >= 0
            ? 'bg-gradient-to-br from-violet-500/20 via-violet-500/10 to-transparent border-violet-500/25'
            : 'bg-gradient-to-br from-rose-900/30 via-rose-900/10 to-transparent border-rose-900/40')}>
          <div className={cn('absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl',
            netProfit >= 0 ? 'bg-violet-500/10' : 'bg-rose-900/20')} />
          <div className="flex items-center justify-between mb-3">
            <p className={cn('text-xs font-semibold uppercase tracking-wider',
              netProfit >= 0 ? 'text-violet-400/70' : 'text-rose-400/70')}>Net Profit</p>
            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center',
              netProfit >= 0 ? 'bg-violet-500/15' : 'bg-rose-500/15')}>
              <Wallet className={cn('w-4 h-4', netProfit >= 0 ? 'text-violet-400' : 'text-rose-400')} />
            </div>
          </div>
          <p className={cn('text-2xl font-extrabold tabular-nums', netProfit >= 0 ? 'text-white' : 'text-rose-400')}>
            {netProfit < 0 ? '−' : ''}{formatPrice(Math.abs(netProfit))}
          </p>
          <div className="mt-2">
            <Trend pct={profGrowth} />
          </div>
          {totalRevenue > 0 && (
            <p className="text-[10px] text-white/30 mt-1">
              {((netProfit / totalRevenue) * 100).toFixed(1)}% profit margin
            </p>
          )}
        </div>
      </div>

      {/* Revenue vs Expenses chart */}
      {chartData.length > 0 && (
        <div className="rounded-2xl bg-white/4 border border-white/8 p-5">
          <p className="text-sm font-semibold text-white/60 mb-4">Revenue vs Expenses</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="expGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip content={<ChartTooltip formatPrice={formatPrice} />} />
              <Area type="monotone" dataKey="Revenue"  stroke="#10b981" strokeWidth={2}
                fill="url(#revGrad)"  dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
              <Area type="monotone" dataKey="Expenses" stroke="#f43f5e" strokeWidth={2}
                fill="url(#expGrad2)" dot={false} activeDot={{ r: 4, fill: '#f43f5e' }} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-5 mt-3">
            <span className="flex items-center gap-1.5 text-[11px] text-white/40">
              <span className="w-6 h-0.5 rounded-full bg-emerald-400 inline-block" />Revenue
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-white/40">
              <span className="w-6 h-0.5 rounded-full bg-rose-400 inline-block" />Expenses
            </span>
          </div>
        </div>
      )}

      {/* Breakdown panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Sales by payment method */}
        <div className="rounded-2xl bg-white/4 border border-white/8 p-5">
          <p className="text-sm font-semibold text-white/60 mb-4">Sales by Payment Method</p>
          {pmData.length === 0 ? (
            <p className="text-xs text-white/25 text-center py-8">No sales in this period</p>
          ) : (
            <div className="space-y-3.5">
              {pmData.map(({ name, value }) => (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-white/60">{name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/30">{((value / totalRevenue) * 100).toFixed(0)}%</span>
                      <span className="text-xs font-bold text-white tabular-nums">{formatPrice(value)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${(value / pmMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expenses by category */}
        <div className="rounded-2xl bg-white/4 border border-white/8 p-5">
          <p className="text-sm font-semibold text-white/60 mb-4">Expenses by Category</p>
          {catData.length === 0 ? (
            <p className="text-xs text-white/25 text-center py-8">No expenses in this period</p>
          ) : (
            <div className="space-y-3.5">
              {catData.map(({ name, color, value }) => (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-white/60">{name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/30">{((value / totalExpenses) * 100).toFixed(0)}%</span>
                      <span className="text-xs font-bold text-white tabular-nums">{formatPrice(value)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(value / catMax) * 100}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaction timeline */}
      {timeline.length > 0 && (
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-white/3 border-b border-white/8">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Transactions</p>
            <div className="flex items-center gap-4 text-[11px] text-white/30">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Sales</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />Expenses</span>
              <span>{timeline.length} entries</span>
            </div>
          </div>
          <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
            {timeline.map(tx => (
              <div key={`${tx.kind}-${tx.id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-white/3 transition-colors">
                <div className={cn('w-1 h-9 rounded-full shrink-0',
                  tx.kind === 'sale' ? 'bg-emerald-500' : 'bg-rose-500')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{tx.label}</p>
                  <p className="text-[11px] text-white/35">{tx.sub}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-sm font-bold tabular-nums',
                    tx.kind === 'sale' ? 'text-emerald-400' : 'text-rose-400')}>
                    {tx.kind === 'sale' ? '+' : '−'}{formatPrice(tx.amount)}
                  </p>
                  <p className="text-[10px] text-white/30">
                    {new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    {' · '}
                    {new Date(tx.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {timeline.length === 0 && !loading && (
        <div className="text-center py-16 text-white/25 text-sm">
          No transactions found for this period
        </div>
      )}
    </div>
  )
}
