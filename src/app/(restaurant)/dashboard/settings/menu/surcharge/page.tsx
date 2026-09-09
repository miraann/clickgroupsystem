'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useSurcharges, type CachedSurcharge } from '@/hooks/useSurcharges'
import { motion, type Variants } from 'framer-motion'

type Surcharge = CachedSurcharge

const APPLIED_OPTIONS = ['All', 'Dine In', 'Delivery', 'Takeout']
const APPLIED_COLORS: Record<string, string> = {
  'All':      'bg-indigo-500/15 text-indigo-400',
  'Dine In':  'bg-amber-500/15 text-amber-400',
  'Delivery': 'bg-blue-500/15 text-blue-400',
  'Takeout':  'bg-emerald-500/15 text-emerald-400',
}
const EMPTY_FORM = { name: '', type: 'percentage' as 'percentage' | 'fixed', value: 10, applied_to: 'All', active: true }

const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.55, ease: 'circOut' as const } },
  exit:   { opacity: 0, y: -10, transition: { duration: 0.3 } },
}
const LIST: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const ITEM_VAR: Variants = {
  hidden:  { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'circOut' as const } },
}

export default function SurchargePage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrData, error: swrError, mutate } = useSurcharges(restaurantId)
  const surcharges = swrData?.surcharges ?? []
  const currency   = swrData?.currency ?? { symbol: '$', decimal_places: 2 }
  const error      = swrError ? (swrError as Error).message : null

  const [modal,    setModal]    = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setModal(true) }
  const openEdit = (s: Surcharge) => {
    setEditId(s.id)
    setForm({ name: s.name, type: s.type, value: s.value, applied_to: s.applied_to, active: s.active })
    setModal(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)
    const payload = { name: form.name, type: form.type, value: form.value, applied_to: form.applied_to, active: form.active, updated_at: new Date().toISOString() }

    if (editId) {
      const { error: err } = await supabase.from('surcharges').update(payload).eq('id', editId)
      if (!err) mutate(prev => prev ? { ...prev, surcharges: surcharges.map(s => s.id === editId ? { ...s, ...payload } : s) } : prev, false)
    } else {
      const nextOrder = surcharges.length > 0 ? Math.max(...surcharges.map(s => s.sort_order)) + 1 : 0
      const { data, error: err } = await supabase
        .from('surcharges')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select().single()
      if (!err && data) mutate(prev => prev ? { ...prev, surcharges: [...surcharges, data as Surcharge] } : prev, false)
    }
    setSaving(false)
    setModal(false)
  }

  // ── Toggle active ──────────────────────────────────────────
  const toggleActive = async (s: Surcharge) => {
    const newVal = !s.active
    mutate(prev => prev ? { ...prev, surcharges: surcharges.map(x => x.id === s.id ? { ...x, active: newVal } : x) } : prev, false)
    await supabase.from('surcharges').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', s.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return
    }
    const { error: err } = await supabase.from('surcharges').delete().eq('id', id)
    if (!err) mutate(prev => prev ? { ...prev, surcharges: surcharges.filter(s => s.id !== id) } : prev, false)
    setDeleteId(null)
  }

  // ── Render ─────────────────────────────────────────────────
  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Run <code className="text-amber-400">supabase-menu-schema.sql</code> first.</p>
        <button onClick={() => mutate()} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <motion.div key="menu-surcharge-page" variants={PAGE} initial="hidden" animate="show" exit="exit" className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center">
          <span className="text-rose-400 font-bold text-base">%+</span>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.sur_title}</h1>
          <p className="text-xs text-white/40">{t.sur_subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{surcharges.length}</span>
      </div>

      <motion.div variants={LIST} initial="hidden" animate="visible" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {/* Add-new card */}
        <button onClick={openAdd}
          className="min-h-[160px] rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-amber-400 transition-all active:scale-95">
          <span className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </span>
          <span className="text-[11px] font-semibold">{t.sur_add}</span>
        </button>
        {surcharges.map(s => {
          const armed = deleteId === s.id
          return (
            <motion.div key={s.id} variants={ITEM_VAR} className={cn('flex flex-col items-center rounded-xl border bg-white/5 px-2.5 py-2.5 text-center transition-colors',
              s.active ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-55')}>
              <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-rose-400 tabular-nums">
                  {s.type === 'percentage' ? `${s.value}%` : `${currency.symbol}${Number(s.value).toFixed(currency.decimal_places)}`}
                </span>
              </div>
              <p className="mt-1.5 w-full text-sm font-bold text-white line-clamp-1">{s.name}</p>
              <span className={cn('mt-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium', APPLIED_COLORS[s.applied_to] ?? 'bg-white/10 text-white/50')}>
                {s.applied_to}
              </span>
              <p className="mt-0.5 text-[10px] text-white/35 line-clamp-1 w-full">
                {s.type === 'percentage' ? `${s.value}% surcharge` : `${currency.symbol}${Number(s.value).toFixed(currency.decimal_places)} flat fee`}
              </p>

              <span className="my-2 h-px w-full bg-white/8" />

              <div className="flex items-start justify-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => handleDelete(s.id)}
                    className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                      armed ? 'bg-rose-500/90 text-white' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span className={cn('text-[9px] font-medium', armed ? 'text-rose-400' : 'text-white/40')}>
                    {armed ? t.confirm_delete : t.delete}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => toggleActive(s)}
                    className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                      s.active ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/5 text-white/30 hover:bg-white/10')}>
                    {s.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <span className="text-[9px] font-medium text-white/40">{t.disc_active}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => openEdit(s)}
                    className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 flex items-center justify-center transition-all active:scale-95">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[9px] font-medium text-white/40">{t.edit}</span>
                </div>
              </div>
            </motion.div>
          )
        })}
        {surcharges.length === 0 && <div className="col-span-full text-center py-12 text-white/25 text-sm">{t.sur_no_data}</div>}
      </motion.div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? `${t.edit} ${t.sur_title}` : `${t.add} ${t.sur_title}`}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.sur_name} *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Service Charge"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">{t.sur_type}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['percentage', 'fixed'] as const).map(stype => (
                    <button key={stype} onClick={() => setForm(f => ({ ...f, type: stype }))}
                      className={cn('py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95',
                        form.type === stype ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/8')}>
                      {stype === 'percentage' ? t.disc_pct : `${t.disc_fixed} (${currency.symbol})`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.sur_value} {form.type === 'percentage' ? '(%)' : `(${currency.symbol})`}</label>
                  <input type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Applied To</label>
                  <select value={form.applied_to} onChange={e => setForm(f => ({ ...f, applied_to: e.target.value }))}
                    className="w-full bg-[#0d1220] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors">
                    {APPLIED_OPTIONS.map(o => <option key={o} value={o} className="bg-[#0d1220]">{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">{t.disc_active}</span>
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))} className="active:scale-95">
                  {form.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
              <button onClick={handleSave} disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? t.save_changes : t.sur_add}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
