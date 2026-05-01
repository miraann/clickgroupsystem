'use client'
import { useState, useEffect } from 'react'
import { X, User, Loader2, Trash2, ArrowDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { PayLater, Payment } from './types'
import { STATUS_CFG, PAY_METHODS, fmtDate, isOverdue } from './types'

interface Props {
  record:     PayLater
  restaurantId: string
  cashier:    string
  onClose:    () => void
  onDelete:   (id: string) => void
  onUpdated:  (r: PayLater) => void
}

export function ViewPayLaterModal({ record, restaurantId, cashier, onClose, onDelete, onUpdated }: Props) {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const { t } = useLanguage()

  const [payments, setPayments]       = useState<Payment[]>([])
  const [loadingPay, setLoadingPay]   = useState(true)
  const [showPayForm, setShowPayForm] = useState(false)
  const [payAmount, setPayAmount]     = useState('')
  const [payMethod, setPayMethod]     = useState('Cash')
  const [payNote, setPayNote]         = useState('')
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState<string | null>(null)

  useEffect(() => {
    supabase.from('pay_later_payments').select('*').eq('pay_later_id', record.id).order('created_at', { ascending: false })
      .then(({ data }) => { setPayments((data ?? []) as Payment[]); setLoadingPay(false) })
  }, [record.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const balance    = record.original_amount - record.paid_amount
  const cfg        = STATUS_CFG[record.status] ?? STATUS_CFG.pending
  const StatusIcon = cfg.icon
  const overdue    = isOverdue(record)

  const handlePay = async () => {
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) { setErr('Enter a valid amount'); return }
    if (amt > balance + 0.001)  { setErr(`Amount exceeds balance (${formatPrice(balance)})`); return }
    setSaving(true); setErr(null)

    const newPaid   = record.paid_amount + amt
    const newStatus: PayLater['status'] = newPaid >= record.original_amount - 0.001 ? 'paid' : 'partial'

    await supabase.from('pay_later_payments').insert({
      pay_later_id:   record.id,
      amount:         amt,
      payment_method: payMethod,
      note:           payNote.trim() || null,
      created_by:     cashier,
    })

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
      setPayAmount(''); setPayNote(''); setShowPayForm(false)
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
              record.order_ref && ['Order Ref', record.order_ref],
              record.table_num && ['Table',     `Table ${record.table_num}`],
              record.due_date  && ['Due Date',  <span key="d" className={overdue ? 'text-rose-400 font-semibold' : 'text-white/60'}>{fmtDate(record.due_date)}{overdue ? ' — OVERDUE' : ''}</span>],
              ['Created',        fmtDate(record.created_at)],
              record.note      && ['Note',      <span key="n" className="text-white/60 text-xs">{record.note}</span>],
            ].filter(Boolean).map(row => {
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
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/8 text-white/50 text-xs font-medium transition-all">{t.cancel}</button>
                <button onClick={handlePay} disabled={saving}
                  className="flex-[2] py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><ArrowDownLeft className="w-3.5 h-3.5" />{t.pl_mark_paid}</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 bg-white/2 flex gap-3 shrink-0">
          <button onClick={() => onDelete(record.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-sm font-medium transition-all active:scale-95">
            <Trash2 className="w-4 h-4" />{t.delete}
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
