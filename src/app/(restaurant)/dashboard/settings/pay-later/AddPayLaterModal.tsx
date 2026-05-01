'use client'
import { useState } from 'react'
import { CreditCard, Plus, X, Loader2, AlertCircle, User, Phone, Hash, Calendar, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { PayLater } from './types'

interface Props {
  restaurantId: string
  cashier: string
  onClose: () => void
  onSaved: (r: PayLater) => void
}

export function AddPayLaterModal({ restaurantId, cashier, onClose, onSaved }: Props) {
  const supabase = createClient()
  const { t } = useLanguage()

  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [amount, setAmount]     = useState('')
  const [orderRef, setOrderRef] = useState('')
  const [tableNum, setTableNum] = useState('')
  const [dueDate, setDueDate]   = useState('')
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)

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
            <h3 className="text-base font-bold text-white">{t.pl_title}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
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

          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Amount Owed <span className="text-rose-400">*</span></label>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" step="0.001"
                className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors tabular-nums" />
            </div>
          </div>

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

          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Due Date <span className="text-white/20">(optional)</span></label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark] cursor-pointer" />
            </div>
          </div>

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
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />{t.loading}</> : <><Plus className="w-4 h-4" />{t.save_changes}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
