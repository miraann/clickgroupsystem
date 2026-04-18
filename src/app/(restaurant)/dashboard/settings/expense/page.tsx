'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DollarSign, Plus, Search, X, Upload, Loader2,
  TrendingUp, TrendingDown, LayoutGrid, Receipt,
  ShoppingCart, Zap, Truck, Users, Wrench, Coffee,
  Trash2, Eye, ChevronDown, Calendar,
  CheckCircle2, Clock, AlertCircle, Paperclip,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────
interface Category {
  id: string
  name: string
  color: string
  icon: string
}

interface Expense {
  id: string
  restaurant_id: string
  title: string
  category_id: string | null
  amount: number
  payment_method: string | null
  status: 'paid' | 'pending' | 'scheduled'
  receipt_url: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

// ── Built-in categories (fallback if DB table missing) ───────────
const BUILTIN_CATS: Category[] = [
  { id: 'supplies',  name: 'Supplies',   color: '#f59e0b', icon: 'ShoppingCart' },
  { id: 'utilities', name: 'Utilities',  color: '#3b82f6', icon: 'Zap'          },
  { id: 'delivery',  name: 'Delivery',   color: '#10b981', icon: 'Truck'        },
  { id: 'payroll',   name: 'Payroll',    color: '#8b5cf6', icon: 'Users'        },
  { id: 'repairs',   name: 'Repairs',    color: '#ef4444', icon: 'Wrench'       },
  { id: 'food',      name: 'Food & Bev', color: '#f97316', icon: 'Coffee'       },
  { id: 'other',     name: 'Other',      color: '#6b7280', icon: 'LayoutGrid'   },
]

const CAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingCart, Zap, Truck, Users, Wrench, Coffee, LayoutGrid, Receipt,
}

const STATUS_CFG = {
  paid:      { label: 'Paid',      color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', icon: CheckCircle2 },
  pending:   { label: 'Pending',   color: 'text-amber-400   bg-amber-500/15   border-amber-500/30',   icon: Clock        },
  scheduled: { label: 'Scheduled', color: 'text-blue-400    bg-blue-500/15    border-blue-500/30',    icon: AlertCircle  },
}

const PAY_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Online', 'Other']

// ── Helpers ──────────────────────────────────────────────────────
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// ── Tooltip for chart ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, formatPrice }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0d1220] border border-white/15 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-white/50 mb-0.5">{label}</p>
      <p className="text-amber-400 font-bold">{formatPrice(payload[0].value)}</p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ExpensePage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const { t } = useLanguage()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [expenses, setExpenses]         = useState<Expense[]>([])
  const [categories, setCategories]     = useState<Category[]>(BUILTIN_CATS)
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterCat, setFilterCat]       = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showAdd, setShowAdd]           = useState(false)
  const [menuId, setMenuId]             = useState<string | null>(null)
  const [viewExpense, setViewExpense]   = useState<Expense | null>(null)
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [chartData, setChartData]       = useState<{ day: string; amount: number }[]>([])
  const [cashierName, setCashierName]   = useState('Staff')

  // ── Load ──────────────────────────────────────────────────────
  const load = useCallback(async (rid: string, from = '', to = '') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from('expenses').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(500)
    if (from) q = q.gte('created_at', `${from}T00:00:00`)
    if (to)   q = q.lte('created_at', `${to}T23:59:59`)

    const [{ data: exps }, { data: cats }] = await Promise.all([
      q,
      supabase.from('expense_categories').select('*').eq('restaurant_id', rid).order('sort_order'),
    ])
    setExpenses((exps ?? []) as Expense[])
    if (cats && cats.length > 0) setCategories(cats as Category[])

    // Build 7-day chart (always uses all data, no date filter)
    const now = new Date()
    const days: { day: string; amount: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const label = d.toLocaleDateString('en-GB', { weekday: 'short' })
      const dateStr = d.toISOString().slice(0, 10)
      const amount = (exps ?? []).filter((e: Expense) => e.created_at.startsWith(dateStr))
        .reduce((s: number, e: Expense) => s + (e.amount ?? 0), 0)
      days.push({ day: label, amount })
    }
    setChartData(days)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCashierName(user?.user_metadata?.full_name ?? user?.email ?? 'Staff')
    })
    supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle().then(({ data: rest }) => {
      if (!rest) return
      setRestaurantId(rest.id)
      load(rest.id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time subscription
  useEffect(() => {
    if (!restaurantId) return
    const ch = supabase.channel('expenses-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `restaurant_id=eq.${restaurantId}` },
        () => load(restaurantId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived stats ─────────────────────────────────────────────
  const totalAll = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const now = new Date()
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s, e) => s + (e.amount ?? 0), 0)
  const lastMonth = expenses.filter(e => {
    const d = new Date(e.created_at)
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear()
  }).reduce((s, e) => s + (e.amount ?? 0), 0)
  const monthTrend = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0

  // Top category by spend
  const catTotals = categories.map(c => ({
    ...c,
    total: expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + (e.amount ?? 0), 0),
  })).sort((a, b) => b.total - a.total)
  const topCat = catTotals[0]

  // Filtered list
  const visible = expenses.filter(e => {
    const q = search.toLowerCase()
    if (q && !e.title.toLowerCase().includes(q)) return false
    if (filterCat !== 'all' && e.category_id !== filterCat) return false
    if (filterStatus !== 'all' && e.status !== filterStatus) return false
    return true
  })

  const getCat = (id: string | null) => categories.find(c => c.id === id) ?? null

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setMenuId(null)
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Total */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/25 p-5">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-amber-500/10 blur-2xl" />
          <p className="text-xs font-semibold text-amber-400/70 uppercase tracking-wider mb-1">{t.exp_total}</p>
          <p className="text-2xl font-extrabold text-white tabular-nums">{formatPrice(totalAll)}</p>
          <p className="text-xs text-white/30 mt-1">{expenses.length} records</p>
          <DollarSign className="absolute bottom-4 right-4 w-8 h-8 text-amber-500/20" />
        </div>

        {/* Monthly trend */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-transparent border border-blue-500/25 p-5">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-blue-500/10 blur-2xl" />
          <p className="text-xs font-semibold text-blue-400/70 uppercase tracking-wider mb-1">{t.exp_this_month}</p>
          <p className="text-2xl font-extrabold text-white tabular-nums">{formatPrice(thisMonth)}</p>
          <div className="flex items-center gap-1 mt-1">
            {monthTrend > 0
              ? <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
              : <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            }
            <span className={cn('text-xs font-semibold', monthTrend > 0 ? 'text-rose-400' : 'text-emerald-400')}>
              {Math.abs(monthTrend).toFixed(1)}% vs last month
            </span>
          </div>
          <TrendingUp className="absolute bottom-4 right-4 w-8 h-8 text-blue-500/20" />
        </div>

        {/* Top category */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/20 via-violet-500/10 to-transparent border border-violet-500/25 p-5">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-violet-500/10 blur-2xl" />
          <p className="text-xs font-semibold text-violet-400/70 uppercase tracking-wider mb-1">Top Category</p>
          {topCat ? (
            <>
              <p className="text-2xl font-extrabold text-white">{topCat.name}</p>
              <p className="text-xs text-white/30 mt-1 tabular-nums">{formatPrice(topCat.total)}</p>
            </>
          ) : (
            <p className="text-lg font-bold text-white/30">—</p>
          )}
          <LayoutGrid className="absolute bottom-4 right-4 w-8 h-8 text-violet-500/20" />
        </div>
      </div>

      {/* ── 7-day chart ── */}
      <div className="rounded-2xl bg-white/4 border border-white/8 p-5">
        <p className="text-sm font-semibold text-white/60 mb-4">7-Day Expense Trend</p>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<ChartTooltip formatPrice={formatPrice} />} />
            <Area type="monotone" dataKey="amount" stroke="#f59e0b" strokeWidth={2} fill="url(#expGrad)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Controls ── */}
      <div className="space-y-3">
        {/* Row 1: Search + Add */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`${t.search}…`}
              className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold active:scale-95 transition-all shadow-lg shadow-amber-500/25 shrink-0"
          >
            <Plus className="w-4 h-4" />{t.exp_add}
          </button>
        </div>

        {/* Row 2: Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* From date */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
            <Calendar className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => { const v = e.target.value; setDateFrom(v); if (restaurantId) load(restaurantId, v, dateTo) }}
              className="bg-transparent text-sm text-white/70 focus:outline-none w-32 cursor-pointer [color-scheme:dark]"
            />
          </div>

          <span className="text-white/25 text-xs">to</span>

          {/* To date */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
            <Calendar className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input
              type="date"
              value={dateTo}
              onChange={e => { const v = e.target.value; setDateTo(v); if (restaurantId) load(restaurantId, dateFrom, v) }}
              className="bg-transparent text-sm text-white/70 focus:outline-none w-32 cursor-pointer [color-scheme:dark]"
            />
          </div>

          {/* Clear dates */}
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); if (restaurantId) load(restaurantId, '', '') }}
              className="text-xs text-white/30 hover:text-rose-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="h-5 w-px bg-white/10" />

          {/* Category */}
          <div className="relative">
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── Expense list ── */}
      <div className="rounded-2xl border border-white/8">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 bg-white/3 border-b border-white/8 text-xs font-semibold text-white/30 uppercase tracking-wider rounded-t-2xl">
          <span>{t.exp_title}</span>
          <span className="text-right w-28">{t.exp_amount}</span>
          <span className="w-32">{t.exp_date}</span>
          <span className="w-24">Status</span>
          <span className="w-8" />
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/30 text-sm">{t.exp_no_data}</p>
            <button onClick={() => setShowAdd(true)} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
              + Add your first expense
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map(exp => {
              const cat    = getCat(exp.category_id)
              const CatIcon = cat ? (CAT_ICONS[cat.icon] ?? LayoutGrid) : LayoutGrid
              const status = STATUS_CFG[exp.status ?? 'paid'] ?? STATUS_CFG.paid
              const StatusIcon = status.icon
              return (
                <div key={exp.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3.5 items-center hover:bg-white/3 transition-colors group">

                  {/* Title + category */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: cat ? `${cat.color}20` : '#ffffff10', border: `1px solid ${cat?.color ?? '#ffffff'}30` }}
                    >
                      <CatIcon className="w-4 h-4" style={{ color: cat?.color ?? '#ffffff50' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{exp.title}</p>
                      <p className="text-xs text-white/35">{cat?.name ?? 'Uncategorized'}</p>
                    </div>
                  </div>

                  {/* Amount */}
                  <span className="text-sm font-bold text-white tabular-nums w-28 text-right">{formatPrice(exp.amount ?? 0)}</span>

                  {/* Date */}
                  <div className="w-32">
                    <p className="text-xs text-white/60">{fmtDay(exp.created_at)}</p>
                    <p className="text-[10px] text-white/30">{new Date(exp.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                  </div>

                  {/* Status */}
                  <div className="w-24">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold', status.color)}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {status.label}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewExpense(exp)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/15 border border-white/8 hover:border-amber-500/30 text-white/40 hover:text-amber-400 text-xs font-medium transition-all active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">View</span>
                    </button>
                    <button
                      onClick={() => handleDelete(exp.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/15 border border-white/8 hover:border-rose-500/30 text-white/30 hover:text-rose-400 transition-all active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Count */}
      {visible.length > 0 && (
        <p className="text-xs text-white/25 text-right">{visible.length} expense{visible.length !== 1 ? 's' : ''} · {formatPrice(visible.reduce((s, e) => s + (e.amount ?? 0), 0))} total</p>
      )}

      {/* ── Add Expense Modal ── */}
      {showAdd && restaurantId && (
        <AddExpenseModal
          restaurantId={restaurantId}
          categories={categories}
          cashier={cashierName}
          onClose={() => setShowAdd(false)}
          onSaved={exp => {
            setExpenses(prev => [exp, ...prev])
            setShowAdd(false)
          }}
        />
      )}

      {/* Dismiss menu on outside click */}
      {menuId && <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />}

      {/* ── Expense Detail Modal ── */}
      {viewExpense && (
        <ExpenseDetailModal
          expense={viewExpense}
          category={categories.find(c => c.id === viewExpense.category_id) ?? null}
          onClose={() => setViewExpense(null)}
          onDelete={(id: string) => { handleDelete(id); setViewExpense(null) }}
        />
      )}
    </div>
  )
}

// ── Receipt Preview ───────────────────────────────────────────────
function ReceiptPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <a href={url} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white/50 hover:border-amber-500/30 hover:text-amber-400 transition-colors">
        <Paperclip className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">View attached file</span>
        <Eye className="w-3.5 h-3.5 shrink-0" />
      </a>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Receipt"
        onError={() => setFailed(true)}
        className="w-full max-h-72 object-contain rounded-xl border border-white/10 bg-white/5 hover:border-amber-500/30 transition-colors cursor-zoom-in"
      />
    </a>
  )
}

// ── Expense Detail Modal ──────────────────────────────────────────
function ExpenseDetailModal({
  expense, category, onClose, onDelete,
}: {
  expense: Expense
  category: Category | null
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const { formatPrice } = useDefaultCurrency()
  const { t } = useLanguage()
  const CatIcon = category ? (CAT_ICONS[category.icon] ?? LayoutGrid) : LayoutGrid
  const status  = STATUS_CFG[expense.status ?? 'paid'] ?? STATUS_CFG.paid
  const StatusIcon = status.icon

  const rows: [string, React.ReactNode][] = [
    [t.exp_title,      <span key="t" className="text-white font-semibold">{expense.title}</span>],
    [t.exp_category,   category
      ? <span key="c" className="flex items-center gap-1.5">
          <CatIcon className="w-3.5 h-3.5" style={{ color: category.color }} />
          <span style={{ color: category.color }} className="font-semibold">{category.name}</span>
        </span>
      : <span key="c" className="text-white/30">Uncategorized</span>],
    [t.exp_amount,     <span key="a" className="text-amber-400 font-bold tabular-nums text-base">{formatPrice(expense.amount ?? 0)}</span>],
    ['Status',         <span key="s" className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold', status.color)}>
                         <StatusIcon className="w-2.5 h-2.5" />{status.label}
                       </span>],
    ['Payment Method', <span key="pm" className="text-white/70">{expense.payment_method ?? '—'}</span>],
    ['Recorded By',    <span key="cb" className="text-white/70">{expense.created_by ?? '—'}</span>],
    ['Date',           <span key="d" className="text-white/70 tabular-nums">
                         {new Date(expense.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                         {' · '}
                         {new Date(expense.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                       </span>],
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0a0f1c] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-white/3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: category ? `${category.color}25` : '#ffffff10', border: `1px solid ${category?.color ?? '#ffffff'}30` }}
            >
              <CatIcon className="w-4 h-4" style={{ color: category?.color ?? '#ffffff50' }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">{expense.title}</h3>
              <p className="text-xs text-white/35">{category?.name ?? 'Uncategorized'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Detail rows */}
        <div className="px-6 py-4 space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
              <span className="text-xs text-white/35 shrink-0 w-32">{label}</span>
              <span className="text-xs text-right">{value}</span>
            </div>
          ))}

          {/* Note */}
          {expense.note && (
            <div className="pt-1">
              <p className="text-xs text-white/35 mb-1.5">{t.exp_note}</p>
              <p className="text-sm text-white/60 bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 leading-relaxed">{expense.note}</p>
            </div>
          )}

          {/* Receipt */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-white/35">Receipt</p>
              {expense.receipt_url && (
                <a href={expense.receipt_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors">
                  <Eye className="w-3 h-3" />Open full size
                </a>
              )}
            </div>
            {expense.receipt_url ? (
              <ReceiptPreview url={expense.receipt_url} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border border-dashed border-white/10 bg-white/3">
                <Paperclip className="w-6 h-6 text-white/15" />
                <p className="text-xs text-white/25">No receipt attached</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 bg-white/2 flex gap-3">
          <button
            onClick={() => onDelete(expense.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-sm font-medium transition-all active:scale-95"
          >
            <Trash2 className="w-4 h-4" />{t.delete}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Expense Modal ─────────────────────────────────────────────
interface AddProps {
  restaurantId: string
  categories: Category[]
  cashier: string
  onClose: () => void
  onSaved: (exp: Expense) => void
}

function AddExpenseModal({ restaurantId, categories, cashier, onClose, onSaved }: AddProps) {
  const supabase = createClient()
  const { t } = useLanguage()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle]         = useState('')
  const [catId, setCatId]         = useState(categories[0]?.id ?? '')
  const [amount, setAmount]       = useState('')
  const [method, setMethod]       = useState('Cash')
  const [status, setStatus]       = useState<'paid' | 'pending' | 'scheduled'>('paid')
  const [note, setNote]           = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState<string | null>(null)

  const selectedCat = categories.find(c => c.id === catId)
  const CatIcon = selectedCat ? (CAT_ICONS[selectedCat.icon] ?? LayoutGrid) : LayoutGrid

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { setErr('File too large (max 5 MB)'); return }
    setFile(f)
    setErr(null)
  }

  const handleSave = async () => {
    if (!title.trim())       { setErr('Title is required'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setErr('Enter a valid amount'); return }

    setSaving(true)
    setErr(null)

    let receipt_url: string | null = null

    // Upload receipt if selected
    if (file) {
      setUploading(true)
      const ext  = file.name.split('.').pop()
      const path = `expenses/${restaurantId}/${Date.now()}.${ext}`
      const { data: upData, error: upErr } = await supabase.storage
        .from('receipts')
        .upload(path, file, { upsert: false })
      setUploading(false)
      if (upErr) {
        setSaving(false)
        setErr(`Receipt upload failed: ${upErr.message}. Go to Supabase → Storage → Create bucket "receipts" (Public), then retry.`)
        return
      }
      const { data: pub } = supabase.storage.from('receipts').getPublicUrl(upData.path)
      receipt_url = pub.publicUrl
    }

    const { data, error } = await supabase.from('expenses').insert({
      restaurant_id:  restaurantId,
      title:          title.trim(),
      category_id:    catId || null,
      amount:         amt,
      payment_method: method,
      status,
      note:           note.trim() || null,
      receipt_url,
      created_by:     cashier,
    }).select().single()

    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved(data as Expense)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0a0f1c] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-white/3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-base font-bold text-white">{t.exp_add}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Title */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Title <span className="text-rose-400">*</span></label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Supplier Invoice, Monthly Rent"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors"
            />
          </div>

          {/* Category + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-medium">Category</label>
              <div className="relative">
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: selectedCat ? `${selectedCat.color}25` : '#ffffff10' }}
                >
                  <CatIcon className="w-3 h-3" style={{ color: selectedCat?.color ?? '#ffffff50' }} />
                </div>
                <select
                  value={catId}
                  onChange={e => setCatId(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500/40 transition-colors appearance-none cursor-pointer"
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-medium">Amount <span className="text-rose-400">*</span></label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors tabular-nums"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Payment Method</label>
            <div className="flex gap-2 flex-wrap">
              {PAY_METHODS.map(m => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95',
                    method === m
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:border-amber-500/20 hover:text-amber-300'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Status</label>
            <div className="flex gap-2">
              {(Object.entries(STATUS_CFG) as [string, typeof STATUS_CFG['paid']][]).map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button
                    key={key}
                    onClick={() => setStatus(key as typeof status)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95',
                      status === key ? cfg.color : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/8'
                    )}
                  >
                    <Icon className="w-3 h-3" />{cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Note <span className="text-white/20">(optional)</span></label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Additional details…"
              rows={2}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors resize-none"
            />
          </div>

          {/* Receipt upload */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Receipt <span className="text-white/20">(optional · max 5 MB)</span></label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
            {file ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
                <Paperclip className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs text-emerald-300 truncate flex-1">{file.name}</span>
                <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-white/30 hover:text-rose-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/4 border border-dashed border-white/15 rounded-xl text-xs text-white/35 hover:border-amber-500/30 hover:text-amber-400/70 hover:bg-amber-500/5 transition-all"
              >
                <Upload className="w-4 h-4" />
                Upload receipt image or PDF
              </button>
            )}
          </div>

          {/* Error */}
          {err && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/25 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-xs text-rose-400">{err}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 bg-white/2 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            {saving || uploading
              ? <><Loader2 className="w-4 h-4 animate-spin" />{uploading ? 'Uploading…' : t.loading}</>
              : <><Plus className="w-4 h-4" />{t.exp_add}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
