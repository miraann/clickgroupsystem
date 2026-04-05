'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, Plus, Search, X, Loader2,
  CheckCircle2, Clock, AlertCircle, ChevronDown,
  User, Phone, Hash, Calendar, Wallet, Eye,
  Trash2, DollarSign, TrendingUp, Users, ArrowDownLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

// ── Types ─────────────────────────────────────────────────────────
interface PayLater {
  id: string
  restaurant_id: string
  customer_name: string
  customer_phone: string | null
  order_ref: string | null
  table_num: string | null
  original_amount: number
  paid_amount: number
  due_date: string | null
  note: string | null
  status: 'pending' | 'partial' | 'paid'
  created_by: string | null
  created_at: string
  updated_at: string
}

interface Payment {
  id: string
  pay_later_id: string
  amount: number
  payment_method: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

const STATUS_CFG = {
  pending: { label: 'Pending', color: 'text-rose-400 bg-rose-500/15 border-rose-500/30',     icon: AlertCircle  },
  partial: { label: 'Partial', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30',  icon: Clock        },
  paid:    { label: 'Paid',    color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', icon: CheckCircle2 },
}

const PAY_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Online', 'Other']

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(rec: PayLater) {
  if (rec.status === 'paid' || !rec.due_date) return false
  return new Date(rec.due_date) < new Date()
}

// ── Page ──────────────────────────────────────────────────────────
export default function PayLaterPage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()

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
    supabase.from('restaurants').select('id').limit(1).maybeSingle().then(({ data: rest }) => {
      if (!rest) return
      setRestaurantId(rest.id)
      load(rest.id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time
  useEffect(() => {
    if (!restaurantId) return
    const ch = supabase.channel('pay-later-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pay_later', filter: `restaurant_id=eq.${restaurantId}` },
        () => load(restaurantId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stats ──────────────────────────────────────────────────────
  const outstanding   = records.filter(r => r.status !== 'paid').reduce((s, r) => s + (r.original_amount - r.paid_amount), 0)
  const totalAccounts = records.filter(r => r.status !== 'paid').length
  const overdueCount  = records.filter(r => isOverdue(r)).length
  const paidTotal     = records.filter(r => r.status === 'paid').reduce((s, r) => s + r.original_amount, 0)

  // ── Filter ─────────────────────────────────────────────────────
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
          <p className="text-xs font-semibold text-rose-400/70 uppercase tracking-wider mb-1">Outstanding</p>
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
            placeholder="Search name, phone, order ref…"
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
          <Plus className="w-4 h-4" />Add Pay Later
        </button>
      </div>

      {/* ── List ── */}
      <div className="rounded-2xl border border-white/8">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-3 bg-white/3 border-b border-white/8 text-xs font-semibold text-white/30 uppercase tracking-wider rounded-t-2xl">
          <span>Customer</span>
          <span className="w-36 text-right">Balance</span>
          <span className="w-28">Date</span>
          <span className="w-24">Status</span>
          <span className="w-16" />
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/30 text-sm">No pay later records</p>
            <button onClick={() => setShowAdd(true)} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
              + Add first record
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map(rec => {
              const balance   = rec.original_amount - rec.paid_amount
              const cfg       = STATUS_CFG[rec.status] ?? STATUS_CFG.pending
              const StatusIcon = cfg.icon
              const overdue   = isOverdue(rec)
              return (
                <div key={rec.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-3.5 items-center hover:bg-white/3 transition-colors group">
                  {/* Customer */}
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

                  {/* Balance */}
                  <div className="w-36 text-right">
                    <p className={cn('text-sm font-bold tabular-nums', rec.status === 'paid' ? 'text-emerald-400' : 'text-white')}>
                      {formatPrice(rec.status === 'paid' ? rec.original_amount : balance)}
                    </p>
                    {rec.status === 'partial' && (
                      <p className="text-[10px] text-white/30 tabular-nums">of {formatPrice(rec.original_amount)}</p>
                    )}
                  </div>

                  {/* Date */}
                  <div className="w-28">
                    <p className="text-xs text-white/60">{fmtDate(rec.created_at)}</p>
                    {rec.due_date && (
                      <p className={cn('text-[10px]', overdue ? 'text-rose-400' : 'text-white/30')}>
                        Due {fmtDate(rec.due_date)}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="w-24">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold', cfg.color)}>
                      <StatusIcon className="w-2.5 h-2.5" />{cfg.label}
                    </span>
                  </div>

                  {/* Actions */}
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

      {/* Modals */}
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

// ── Add Modal ─────────────────────────────────────────────────────
function AddPayLaterModal({ restaurantId, cashier, onClose, onSaved }: {
  restaurantId: string; cashier: string
  onClose: () => void; onSaved: (r: PayLater) => void
}) {
  const supabase = createClient()
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [amount, setAmount]   = useState('')
  const [orderRef, setOrderRef] = useState('')
  const [tableNum, setTableNum] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim())            { setErr('Customer name is required'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setErr('Enter a valid amount'); return }
    setSaving(true); setErr(null)
    const { data, error } = await supabase.from('pay_later').insert({
      restaurant_id:   restaurantId,
      customer_name:   name.trim(),
      customer_phone:  phone.trim() || null,
      order_ref:       orderRef.trim() || null,
      table_num:       tableNum.trim() || null,
      original_amount: amt,
      paid_amount:     0,
      due_date:        dueDate || null,
      note:            note.trim() || null,
      status:          'pending',
      created_by:      cashier,
    }).select().single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved(data as PayLater)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0a0f1c] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-white/3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-base font-bold text-white">Add Pay Later</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-medium">Customer Name <span className="text-rose-400">*</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
                  className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-medium">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07xx…"
                  className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors" />
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Amount Owed <span className="text-rose-400">*</span></label>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" step="0.001"
                className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors tabular-nums" />
            </div>
          </div>

          {/* Order ref + Table */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-medium">Order Ref</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="INV-1024"
                  className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-medium">Table</label>
              <input value={tableNum} onChange={e => setTableNum(e.target.value)} placeholder="e.g. 5"
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors" />
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Due Date <span className="text-white/20">(optional)</span></label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark] cursor-pointer" />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Note <span className="text-white/20">(optional)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Additional details…" rows={2}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors resize-none" />
          </div>

          {err && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/25 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-xs text-rose-400">{err}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/8 bg-white/2 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Plus className="w-4 h-4" />Save Record</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── View / Pay Modal ──────────────────────────────────────────────
function ViewPayLaterModal({ record, restaurantId, cashier, onClose, onDelete, onUpdated }: {
  record: PayLater; restaurantId: string; cashier: string
  onClose: () => void
  onDelete: (id: string) => void
  onUpdated: (r: PayLater) => void
}) {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const [payments, setPayments]   = useState<Payment[]>([])
  const [loadingPay, setLoadingPay] = useState(true)
  const [showPayForm, setShowPayForm] = useState(false)
  const [payAmount, setPayAmount]   = useState('')
  const [payMethod, setPayMethod]   = useState('Cash')
  const [payNote, setPayNote]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState<string | null>(null)

  useEffect(() => {
    supabase.from('pay_later_payments').select('*').eq('pay_later_id', record.id).order('created_at', { ascending: false })
      .then(({ data }) => { setPayments((data ?? []) as Payment[]); setLoadingPay(false) })
  }, [record.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const balance = record.original_amount - record.paid_amount
  const cfg = STATUS_CFG[record.status] ?? STATUS_CFG.pending
  const StatusIcon = cfg.icon
  const overdue = isOverdue(record)

  const handlePay = async () => {
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) { setErr('Enter a valid amount'); return }
    if (amt > balance + 0.001)  { setErr(`Amount exceeds balance (${formatPrice(balance)})`); return }
    setSaving(true); setErr(null)

    const newPaid  = record.paid_amount + amt
    const newStatus: PayLater['status'] = newPaid >= record.original_amount - 0.001 ? 'paid' : 'partial'

    // Save payment record
    await supabase.from('pay_later_payments').insert({
      pay_later_id:   record.id,
      amount:         amt,
      payment_method: payMethod,
      note:           payNote.trim() || null,
      created_by:     cashier,
    })

    // Update balance + status
    const { data: updated } = await supabase.from('pay_later')
      .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', record.id).select().single()

    setSaving(false)
    if (updated) {
      onUpdated(updated as PayLater)
      setPayments(prev => [{
        id: crypto.randomUUID(), pay_later_id: record.id,
        amount: amt, payment_method: payMethod, note: payNote || null,
        created_by: cashier, created_at: new Date().toISOString(),
      }, ...prev])
      setPayAmount('')
      setPayNote('')
      setShowPayForm(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0a0f1c] border border-white/12 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-white/3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">{record.customer_name}</h3>
              {record.customer_phone && <p className="text-xs text-white/35">{record.customer_phone}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Balance card */}
          <div className={cn('rounded-2xl p-4 border', record.status === 'paid' ? 'bg-emerald-500/10 border-emerald-500/25' : overdue ? 'bg-rose-500/10 border-rose-500/25' : 'bg-amber-500/10 border-amber-500/25')}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50 font-medium">
                {record.status === 'paid' ? 'Fully Paid' : 'Outstanding Balance'}
              </span>
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold', cfg.color)}>
                <StatusIcon className="w-2.5 h-2.5" />{cfg.label}
              </span>
            </div>
            <p className={cn('text-3xl font-extrabold tabular-nums', record.status === 'paid' ? 'text-emerald-400' : overdue ? 'text-rose-400' : 'text-amber-400')}>
              {formatPrice(record.status === 'paid' ? record.original_amount : balance)}
            </p>
            {record.status !== 'paid' && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs text-white/35">
                  <span>Original</span><span className="tabular-nums">{formatPrice(record.original_amount)}</span>
                </div>
                {record.paid_amount > 0 && (
                  <div className="flex justify-between text-xs text-emerald-400/70">
                    <span>Paid so far</span><span className="tabular-nums">−{formatPrice(record.paid_amount)}</span>
                  </div>
                )}
                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.min(100, (record.paid_amount / record.original_amount) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-2.5">
            {[
              record.order_ref  && ['Order Ref',  record.order_ref],
              record.table_num  && ['Table',      `Table ${record.table_num}`],
              record.due_date   && ['Due Date',   <span key="d" className={overdue ? 'text-rose-400 font-semibold' : 'text-white/60'}>{fmtDate(record.due_date)}{overdue ? ' — OVERDUE' : ''}</span>],
              ['Created',        fmtDate(record.created_at)],
              record.note       && ['Note',       <span key="n" className="text-white/60 text-xs">{record.note}</span>],
            ].filter(Boolean).map((row) => {
              const [label, value] = row as [string, React.ReactNode]
              return (
                <div key={label} className="flex items-center justify-between gap-4 py-1.5 border-b border-white/5">
                  <span className="text-xs text-white/35 shrink-0">{label}</span>
                  <span className="text-xs text-white/70 text-right">{value}</span>
                </div>
              )
            })}
          </div>

          {/* Payment history */}
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Payment History</p>
            {loadingPay ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-white/30 animate-spin" /></div>
            ) : payments.length === 0 ? (
              <p className="text-xs text-white/20 text-center py-4">No payments recorded yet</p>
            ) : (
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2.5 bg-white/4 border border-white/8 rounded-xl">
                    <div className="flex items-center gap-2">
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-xs text-white/70">{p.payment_method ?? 'Cash'}{p.note ? ` · ${p.note}` : ''}</p>
                        <p className="text-[10px] text-white/25">{fmtDate(p.created_at)}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-emerald-400 tabular-nums">+{formatPrice(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Record payment form */}
          {showPayForm && record.status !== 'paid' && (
            <div className="rounded-2xl bg-white/4 border border-white/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Record Payment</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/35 mb-1">Amount <span className="text-rose-400">*</span></label>
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    placeholder={formatPrice(balance)} min="0" step="0.001"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs text-white/35 mb-1">Method</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none cursor-pointer appearance-none">
                    {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Note (optional)"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors" />
              {err && <p className="text-xs text-rose-400">{err}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowPayForm(false); setErr(null) }}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/8 text-white/50 text-xs font-medium transition-all">Cancel</button>
                <button onClick={handlePay} disabled={saving}
                  className="flex-[2] py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><ArrowDownLeft className="w-3.5 h-3.5" />Confirm Payment</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 bg-white/2 flex gap-3 shrink-0">
          <button onClick={() => onDelete(record.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-sm font-medium transition-all active:scale-95">
            <Trash2 className="w-4 h-4" />Delete
          </button>
          {record.status !== 'paid' && (
            <button onClick={() => { setShowPayForm(v => !v); setErr(null) }}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
              <ArrowDownLeft className="w-4 h-4" />Record Payment
            </button>
          )}
          {record.status === 'paid' && (
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
