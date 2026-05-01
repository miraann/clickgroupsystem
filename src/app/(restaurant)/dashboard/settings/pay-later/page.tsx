'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, Plus, Search, Loader2,
  AlertCircle, ChevronDown,
  User, Phone, Hash, Eye,
  DollarSign, TrendingUp, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
    supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle().then(({ data: rest }) => {
      if (!rest) return
      setRestaurantId(rest.id)
      load(rest.id)
    })
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500/20 via-rose-500/10 to-transparent border border-rose-500/25 p-4">
          <p className="text-xs font-semibold text-rose-400/70 uppercase tracking-wider mb-1">{t.pl_outstanding}</p>
          <p className="text-xl font-extrabold text-white tabular-nums">{formatPrice(outstanding)}</p>
          <p className="text-xs text-white/30 mt-0.5">{totalAccounts} account{totalAccounts !== 1 ? 's' : ''}</p>
          <DollarSign className="absolute bottom-3 right-3 w-7 h-7 text-rose-500/15" />
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/25 p-4">
          <p className="text-xs font-semibold text-amber-400/70 uppercase tracking-wider mb-1">Overdue</p>
          <p className="text-xl font-extrabold text-white tabular-nums">{overdueCount}</p>
          <p className="text-xs text-white/30 mt-0.5">past due date</p>
          <AlertCircle className="absolute bottom-3 right-3 w-7 h-7 text-amber-500/15" />
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent border border-emerald-500/25 p-4">
          <p className="text-xs font-semibold text-emerald-400/70 uppercase tracking-wider mb-1">Total Collected</p>
          <p className="text-xl font-extrabold text-white tabular-nums">{formatPrice(paidTotal)}</p>
          <p className="text-xs text-white/30 mt-0.5">fully paid</p>
          <TrendingUp className="absolute bottom-3 right-3 w-7 h-7 text-emerald-500/15" />
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-transparent border border-blue-500/25 p-4">
          <p className="text-xs font-semibold text-blue-400/70 uppercase tracking-wider mb-1">Total Records</p>
          <p className="text-xl font-extrabold text-white tabular-nums">{records.length}</p>
          <p className="text-xs text-white/30 mt-0.5">all time</p>
          <Users className="absolute bottom-3 right-3 w-7 h-7 text-blue-500/15" />
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-3 items-center">
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
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold active:scale-95 transition-all shadow-lg shadow-amber-500/25 shrink-0"
        >
          <Plus className="w-4 h-4" />{t.pl_title}
        </button>
      </div>

      {/* ── List ── */}
      <div className="rounded-2xl border border-white/8">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-3 bg-white/3 border-b border-white/8 text-xs font-semibold text-white/30 uppercase tracking-wider rounded-t-2xl">
          <span>{t.pl_customer}</span>
          <span className="w-36 text-right">{t.pl_amount}</span>
          <span className="w-28">{t.pl_due}</span>
          <span className="w-24">Status</span>
          <span className="w-16" />
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/30 text-sm">{t.pl_no_data}</p>
            <button onClick={() => setShowAdd(true)} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
              + Add first record
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map(rec => {
              const balance    = rec.original_amount - rec.paid_amount
              const cfg        = STATUS_CFG[rec.status] ?? STATUS_CFG.pending
              const StatusIcon = cfg.icon
              const overdue    = isOverdue(rec)
              return (
                <div key={rec.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-3.5 items-center hover:bg-white/3 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{rec.customer_name}</p>
                        {overdue && <span className="text-[9px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.5 rounded-md shrink-0">OVERDUE</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {rec.customer_phone && <span className="text-[10px] text-white/30 flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{rec.customer_phone}</span>}
                        {rec.order_ref && <span className="text-[10px] text-white/30 flex items-center gap-0.5"><Hash className="w-2.5 h-2.5" />{rec.order_ref}</span>}
                        {rec.table_num && <span className="text-[10px] text-white/30">Table {rec.table_num}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="w-36 text-right">
                    <p className={cn('text-sm font-bold tabular-nums', rec.status === 'paid' ? 'text-emerald-400' : 'text-white')}>
                      {formatPrice(rec.status === 'paid' ? rec.original_amount : balance)}
                    </p>
                    {rec.status === 'partial' && (
                      <p className="text-[10px] text-white/30 tabular-nums">of {formatPrice(rec.original_amount)}</p>
                    )}
                  </div>

                  <div className="w-28">
                    <p className="text-xs text-white/60">{fmtDate(rec.created_at)}</p>
                    {rec.due_date && (
                      <p className={cn('text-[10px]', overdue ? 'text-rose-400' : 'text-white/30')}>
                        Due {fmtDate(rec.due_date)}
                      </p>
                    )}
                  </div>

                  <div className="w-24">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold', cfg.color)}>
                      <StatusIcon className="w-2.5 h-2.5" />{cfg.label}
                    </span>
                  </div>

                  <div className="w-16 flex items-center gap-1">
                    <button
                      onClick={() => setViewRec(rec)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/15 border border-white/8 hover:border-amber-500/30 text-white/40 hover:text-amber-400 text-xs font-medium transition-all active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">View</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <p className="text-xs text-white/25 text-right">
          {visible.length} record{visible.length !== 1 ? 's' : ''} · {formatPrice(visible.reduce((s, r) => s + (r.original_amount - r.paid_amount), 0))} outstanding
        </p>
      )}

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
          restaurantId={restaurantId}
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
