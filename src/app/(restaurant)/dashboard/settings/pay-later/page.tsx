'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search,
  AlertCircle, ChevronDown,
  User, Eye,
  DollarSign, TrendingUp, Users,
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
import type { PayLater } from './types'
import { STATUS_CFG, fmtDate, isOverdue } from './types'
import { AddPayLaterModal } from './AddPayLaterModal'
import { ViewPayLaterModal } from './ViewPayLaterModal'

export default function PayLaterPage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const { t } = useLanguage()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [records, setRecords]           = useState<PayLater[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showAdd, setShowAdd]           = useState(false)
  const [viewRec, setViewRec]           = useState<PayLater | null>(null)
  const [cashier, setCashier]           = useState('Staff')

  const load = useCallback(async (rid: string) => {
    const { data } = await supabase
      .from('pay_later')
      .select('*')
      .eq('restaurant_id', rid)
      .order('created_at', { ascending: false })
      .limit(500)
    setRecords((data ?? []) as PayLater[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCashier(user?.user_metadata?.full_name ?? user?.email ?? 'Staff')
    })
    const rid = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
    if (rid) { setRestaurantId(rid); load(rid) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restaurantId) return
    const ch = supabase.channel('pay-later-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pay_later', filter: `restaurant_id=eq.${restaurantId}` },
        () => load(restaurantId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const outstanding   = records.filter(r => r.status !== 'paid').reduce((s, r) => s + (r.original_amount - r.paid_amount), 0)
  const totalAccounts = records.filter(r => r.status !== 'paid').length
  const overdueCount  = records.filter(r => isOverdue(r)).length
  const paidTotal     = records.filter(r => r.status === 'paid').reduce((s, r) => s + r.original_amount, 0)

  const visible = records.filter(r => {
    const q = search.toLowerCase()
    if (q && !r.customer_name.toLowerCase().includes(q) && !(r.customer_phone ?? '').includes(q) && !(r.order_ref ?? '').toLowerCase().includes(q)) return false
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    return true
  })

  const handleDelete = async (id: string) => {
    await supabase.from('pay_later').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
    setViewRec(null)
  }

  return (
    <div className="space-y-6 max-w-5xl">

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-24 rounded-2xl" />)}
            </div>
            <Skel className="h-10 w-full rounded-xl" />
            <div className="rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/5">
              {Array.from({ length: 5 }).map((_, i) => <Skel key={i} className="h-14 rounded-none" />)}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {/* ── Summary cards ── */}
            <motion.div variants={CONTAINER} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <motion.div variants={ITEM} className="relative overflow-hidden rounded-2xl bg-rose-500/70 border border-white/10 p-4">
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">{t.pl_outstanding}</p>
                <p className="text-xl font-extrabold text-white tabular-nums">{formatPrice(outstanding)}</p>
                <p className="text-xs text-white/60 mt-0.5">{totalAccounts} account{totalAccounts !== 1 ? 's' : ''}</p>
                <DollarSign className="absolute bottom-3 right-3 w-7 h-7 text-white/20" />
              </motion.div>
              <motion.div variants={ITEM} className="relative overflow-hidden rounded-2xl bg-amber-500/70 border border-white/10 p-4">
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">Overdue</p>
                <p className="text-xl font-extrabold text-white tabular-nums">{overdueCount}</p>
                <p className="text-xs text-white/60 mt-0.5">past due date</p>
                <AlertCircle className="absolute bottom-3 right-3 w-7 h-7 text-white/20" />
              </motion.div>
              <motion.div variants={ITEM} className="relative overflow-hidden rounded-2xl bg-emerald-500/70 border border-white/10 p-4">
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">Total Collected</p>
                <p className="text-xl font-extrabold text-white tabular-nums">{formatPrice(paidTotal)}</p>
                <p className="text-xs text-white/60 mt-0.5">fully paid</p>
                <TrendingUp className="absolute bottom-3 right-3 w-7 h-7 text-white/20" />
              </motion.div>
              <motion.div variants={ITEM} className="relative overflow-hidden rounded-2xl bg-blue-500/70 border border-white/10 p-4">
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">Total Records</p>
                <p className="text-xl font-extrabold text-white tabular-nums">{records.length}</p>
                <p className="text-xs text-white/60 mt-0.5">all time</p>
                <Users className="absolute bottom-3 right-3 w-7 h-7 text-white/20" />
              </motion.div>
            </motion.div>

            {/* ── Controls ── */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.21, duration: 0.42, ease: 'circOut' }}
              className="flex flex-wrap gap-3 items-center"
            >
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`${t.search}…`}
                  className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors"
                />
              </div>
              <div className="relative">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none cursor-pointer">
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              </div>
            </motion.div>

            {/* ── List ── */}
            <div>
              <motion.div variants={CONTAINER} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* Add-new card */}
                <button onClick={() => setShowAdd(true)}
                  className="min-h-[170px] rounded-2xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-amber-400 transition-all active:scale-95">
                  <span className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center"><Plus className="w-4 h-4" /></span>
                  <span className="text-[11px] font-semibold">{t.pl_title}</span>
                </button>
                {visible.map(rec => {
                  const balance    = rec.original_amount - rec.paid_amount
                  const cfg        = STATUS_CFG[rec.status] ?? STATUS_CFG.pending
                  const StatusIcon = cfg.icon
                  const overdue    = isOverdue(rec)
                  return (
                    <motion.div key={rec.id} variants={ITEM}
                      className={cn('flex flex-col items-center rounded-2xl border bg-white/5 px-3 py-3 text-center transition-colors',
                        overdue ? 'border-rose-500/25' : 'border-white/10 hover:border-white/20')}>
                      <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 max-w-full">
                        <p className="text-sm font-bold text-white line-clamp-1">{rec.customer_name}</p>
                        {overdue && <span className="text-[8px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/25 px-1 py-0.5 rounded shrink-0">OVERDUE</span>}
                      </div>
                      {(rec.customer_phone || rec.order_ref) && (
                        <p className="text-[10px] text-white/30 line-clamp-1 w-full">{rec.customer_phone || rec.order_ref}</p>
                      )}
                      <p className={cn('mt-1 text-sm font-extrabold tabular-nums', rec.status === 'paid' ? 'text-emerald-400' : 'text-white')}>
                        {formatPrice(rec.status === 'paid' ? rec.original_amount : balance)}
                      </p>
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[9px] font-bold', cfg.color)}>
                          <StatusIcon className="w-2.5 h-2.5" />{cfg.label}
                        </span>
                        {rec.due_date && <span className={cn('text-[9px]', overdue ? 'text-rose-400' : 'text-white/30')}>{fmtDate(rec.due_date)}</span>}
                      </div>

                      <span className="my-2 h-px w-full bg-white/8" />

                      <button onClick={() => setViewRec(rec)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 text-xs font-semibold transition-all active:scale-95">
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </motion.div>
                  )
                })}
              </motion.div>
              {visible.length === 0 ? (
                <p className="text-center py-8 text-white/25 text-sm">{t.pl_no_data}</p>
              ) : (
                <p className="text-xs text-white/25 text-right mt-3">
                  {visible.length} record{visible.length !== 1 ? 's' : ''} · {formatPrice(visible.reduce((s, r) => s + (r.original_amount - r.paid_amount), 0))} outstanding
                </p>
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {showAdd && restaurantId && (
        <AddPayLaterModal
          restaurantId={restaurantId}
          cashier={cashier}
          onClose={() => setShowAdd(false)}
          onSaved={rec => { setRecords(prev => [rec, ...prev]); setShowAdd(false) }}
        />
      )}

      {viewRec && restaurantId && (
        <ViewPayLaterModal
          record={viewRec}
          cashier={cashier}
          onClose={() => setViewRec(null)}
          onDelete={handleDelete}
          onUpdated={updated => {
            setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
            setViewRec(updated)
          }}
        />
      )}
    </div>
  )
}
