'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, Plus, Search, X,
  TrendingUp, TrendingDown, LayoutGrid,
  Trash2, Eye, ChevronDown, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
}
const ITEM: Variants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'circOut' as const } },
}
function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-white/8', className)} />
}
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { Category, Expense } from './types'
import { BUILTIN_CATS, CAT_ICONS, STATUS_CFG } from './types'
import { AddExpenseModal } from './AddExpenseModal'
import { ExpenseDetailModal } from './ExpenseDetailModal'
import { logAudit } from '@/lib/logAudit'

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

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

    const now = new Date()
    const days: { day: string; amount: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const label   = d.toLocaleDateString('en-GB', { weekday: 'short' })
      const dateStr = d.toISOString().slice(0, 10)
      const amount  = (exps ?? []).filter((e: Expense) => e.created_at.startsWith(dateStr))
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
    const rid = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
    if (rid) { setRestaurantId(rid); load(rid) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restaurantId) return
    const ch = supabase.channel('expenses-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `restaurant_id=eq.${restaurantId}` },
        () => load(restaurantId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalAll  = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
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

  const catTotals = categories.map(c => ({
    ...c,
    total: expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + (e.amount ?? 0), 0),
  })).sort((a, b) => b.total - a.total)
  const topCat = catTotals[0]

  const visible = expenses.filter(e => {
    const q = search.toLowerCase()
    if (q && !e.title.toLowerCase().includes(q)) return false
    if (filterCat !== 'all' && e.category_id !== filterCat) return false
    if (filterStatus !== 'all' && e.status !== filterStatus) return false
    return true
  })

  const getCat = (id: string | null) => categories.find(c => c.id === id) ?? null

  const handleDelete = async (id: string) => {
    setMenuId(null)
    const exp = expenses.find(e => e.id === id)
    await supabase.from('expenses').delete().eq('id', id)
    if (restaurantId) logAudit(restaurantId, 'delete', { entity: 'expense', title: exp?.title, amount: exp?.amount }, id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-6 max-w-5xl">

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="skeleton"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skel key={i} className="h-28 rounded-2xl" />)}
            </div>
            <Skel className="h-44 rounded-2xl" />
            <div className="flex gap-3">
              <Skel className="h-10 flex-1 rounded-xl" />
              <Skel className="h-10 w-28 rounded-xl" />
            </div>
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-3.5 border-b border-white/5">
                  <Skel className="h-9 rounded-xl" />
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="content"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}
            className="space-y-6">

            {/* Summary cards */}
            <motion.div variants={CONTAINER} initial="hidden" animate="show"
              className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <motion.div variants={ITEM}>
                <div className="relative overflow-hidden rounded-2xl bg-amber-500/70 border border-white/10 p-5">
                  <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">{t.exp_total}</p>
                  <p className="text-2xl font-extrabold text-white tabular-nums">{formatPrice(totalAll)}</p>
                  <p className="text-xs text-white/60 mt-1">{expenses.length} records</p>
                  <DollarSign className="absolute bottom-4 right-4 w-8 h-8 text-white/20" />
                </div>
              </motion.div>
              <motion.div variants={ITEM}>
                <div className="relative overflow-hidden rounded-2xl bg-blue-500/70 border border-white/10 p-5">
                  <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">{t.exp_this_month}</p>
                  <p className="text-2xl font-extrabold text-white tabular-nums">{formatPrice(thisMonth)}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {monthTrend > 0
                      ? <TrendingUp className="w-3.5 h-3.5 text-white/70" />
                      : <TrendingDown className="w-3.5 h-3.5 text-white/70" />
                    }
                    <span className="text-xs font-semibold text-white/70">
                      {Math.abs(monthTrend).toFixed(1)}% vs last month
                    </span>
                  </div>
                  <TrendingUp className="absolute bottom-4 right-4 w-8 h-8 text-white/20" />
                </div>
              </motion.div>
              <motion.div variants={ITEM}>
                <div className="relative overflow-hidden rounded-2xl bg-violet-500/70 border border-white/10 p-5">
                  <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">Top Category</p>
                  {topCat ? (
                    <>
                      <p className="text-2xl font-extrabold text-white">{topCat.name}</p>
                      <p className="text-xs text-white/60 mt-1 tabular-nums">{formatPrice(topCat.total)}</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-white/50">—</p>
                  )}
                  <LayoutGrid className="absolute bottom-4 right-4 w-8 h-8 text-white/20" />
                </div>
              </motion.div>
            </motion.div>

            {/* 7-day chart */}
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: 'circOut' as const, delay: 0.14 }}>
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
            </motion.div>

            {/* Controls */}
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: 'circOut' as const, delay: 0.21 }}>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={`${t.search}…`}
                    className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors"
                  />
                </div>

                <div className="flex flex-wrap gap-3 items-center">
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

                  <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
                    <Calendar className="w-3.5 h-3.5 text-white/30 shrink-0" />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => { const v = e.target.value; setDateTo(v); if (restaurantId) load(restaurantId, dateFrom, v) }}
                      className="bg-transparent text-sm text-white/70 focus:outline-none w-32 cursor-pointer [color-scheme:dark]"
                    />
                  </div>

                  {(dateFrom || dateTo) && (
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); if (restaurantId) load(restaurantId, '', '') }}
                      className="text-xs text-white/30 hover:text-rose-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div className="h-5 w-px bg-white/10" />

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
            </motion.div>

            {/* Expense list */}
            <div>
              <motion.div variants={CONTAINER} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* Add-new card */}
                <button onClick={() => setShowAdd(true)}
                  className="min-h-[170px] rounded-2xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-amber-400 transition-all active:scale-95">
                  <span className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center"><Plus className="w-4 h-4" /></span>
                  <span className="text-[11px] font-semibold">{t.exp_add}</span>
                </button>
                {visible.map(exp => {
                  const cat        = getCat(exp.category_id)
                  const CatIcon    = cat ? (CAT_ICONS[cat.icon] ?? LayoutGrid) : LayoutGrid
                  const status     = STATUS_CFG[exp.status ?? 'paid'] ?? STATUS_CFG.paid
                  const StatusIcon = status.icon
                  return (
                    <motion.div variants={ITEM} key={exp.id}
                      className="flex flex-col items-center rounded-2xl border bg-white/5 border-white/10 hover:border-white/20 px-3 py-3 text-center transition-colors">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: cat ? `${cat.color}20` : '#ffffff10', border: `1px solid ${cat?.color ?? '#ffffff'}30` }}>
                        <CatIcon className="w-5 h-5" style={{ color: cat?.color ?? '#ffffff50' }} />
                      </div>
                      <p className="mt-1.5 w-full text-sm font-bold text-white line-clamp-1">{exp.title}</p>
                      <p className="text-[10px] text-white/35 line-clamp-1 w-full">{cat?.name ?? 'Uncategorized'}</p>
                      <p className="mt-1 text-sm font-extrabold text-white tabular-nums">{formatPrice(exp.amount ?? 0)}</p>
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[9px] font-bold', status.color)}>
                          <StatusIcon className="w-2.5 h-2.5" />{status.label}
                        </span>
                        <span className="text-[9px] text-white/30">{fmtDay(exp.created_at)}</span>
                      </div>

                      <span className="my-2 h-px w-full bg-white/8" />

                      <div className="flex items-start justify-center gap-2 card-actions">
                        <div className="flex flex-col items-center gap-1">
                          <button onClick={() => handleDelete(exp.id)}
                            className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 flex items-center justify-center transition-all active:scale-95">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[9px] font-medium text-white/40">{t.delete}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <button onClick={() => setViewExpense(exp)}
                            className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 flex items-center justify-center transition-all active:scale-95">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[9px] font-medium text-white/40">View</span>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
              {visible.length === 0 ? (
                <p className="text-center py-8 text-white/25 text-sm">{t.exp_no_data}</p>
              ) : (
                <p className="text-xs text-white/25 text-right mt-3">
                  {visible.length} expense{visible.length !== 1 ? 's' : ''} · {formatPrice(visible.reduce((s, e) => s + (e.amount ?? 0), 0))} total
                </p>
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {showAdd && restaurantId && (
        <AddExpenseModal
          restaurantId={restaurantId}
          categories={categories}
          cashier={cashierName}
          onClose={() => setShowAdd(false)}
          onSaved={exp => { setExpenses(prev => [exp, ...prev]); setShowAdd(false) }}
        />
      )}

      {menuId && <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />}

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
