'use client'
import { useState, useRef } from 'react'
import { Plus, X, Upload, Loader2, AlertCircle, Paperclip, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Category, Expense } from './types'
import { CAT_ICONS, STATUS_CFG, PAY_METHODS } from './types'

interface Props {
  restaurantId: string
  categories: Category[]
  cashier: string
  onClose: () => void
  onSaved: (exp: Expense) => void
}

export function AddExpenseModal({ restaurantId, categories, cashier, onClose, onSaved }: Props) {
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
    if (!title.trim())          { setErr('Title is required'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setErr('Enter a valid amount'); return }

    setSaving(true)
    setErr(null)

    let receipt_url: string | null = null

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
              <Plus className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-base font-bold text-white">{t.exp_add}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          <div>
            <label className="block text-xs text-white/40 mb-1.5 font-medium">Title <span className="text-rose-400">*</span></label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Supplier Invoice, Monthly Rent"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors"
            />
          </div>

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
