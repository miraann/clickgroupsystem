'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { AnimatedList, AnimatedItem } from '@/components/ui/AnimatedList'
import { Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useSurcharges, type CachedSurcharge } from '@/hooks/useSurcharges'
import { motion, AnimatePresence } from 'framer-motion'

type Surcharge = CachedSurcharge

function FadeSwitch({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

const APPLIED_OPTIONS = ['All', 'Dine In', 'Delivery', 'Takeout']
const APPLIED_COLORS: Record<string, string> = {
  'All':      'bg-indigo-500/15 text-indigo-400',
  'Dine In':  'bg-amber-500/15 text-amber-400',
  'Delivery': 'bg-blue-500/15 text-blue-400',
  'Takeout':  'bg-emerald-500/15 text-emerald-400',
}
const EMPTY_FORM = { name: '', type: 'percentage' as 'percentage' | 'fixed', value: 10, applied_to: 'All', active: true }

export default function SurchargePage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrData, isLoading: loading, error: swrError, mutate } = useSurcharges(restaurantId)
  const error    = swrError ? (swrError as Error).message : null
  const currency = swrData?.currency ?? { symbol: '$', decimal_places: 2 }

  const [surcharges, setSurcharges] = useState<Surcharge[]>([])
  useEffect(() => { if (swrData) setSurcharges(swrData.surcharges) }, [swrData])

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
      if (!err) {
        const updated = surcharges.map(s => s.id === editId ? { ...s, ...payload } : s)
        setSurcharges(updated)
        mutate(prev => prev ? { ...prev, surcharges: updated } : prev, false)
      }
    } else {
      const nextOrder = surcharges.length > 0 ? Math.max(...surcharges.map(s => s.sort_order)) + 1 : 0
      const { data, error: err } = await supabase
        .from('surcharges')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select().single()
      if (!err && data) {
        const updated = [...surcharges, data as Surcharge]
        setSurcharges(updated)
        mutate(prev => prev ? { ...prev, surcharges: updated } : prev, false)
      }
    }
    setSaving(false)
    setModal(false)
  }

  // ── Toggle active ──────────────────────────────────────────
  const toggleActive = async (s: Surcharge) => {
    const newVal = !s.active
    const updated = surcharges.map(x => x.id === s.id ? { ...x, active: newVal } : x)
    setSurcharges(updated)
    mutate(prev => prev ? { ...prev, surcharges: updated } : prev, false)
    await supabase.from('surcharges').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', s.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return
    }
    const { error: err } = await supabase.from('surcharges').delete().eq('id', id)
    if (!err) {
      const updated = surcharges.filter(s => s.id !== id)
      setSurcharges(updated)
      mutate(prev => prev ? { ...prev, surcharges: updated } : prev, false)
    }
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
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center">
            <span className="text-rose-400 font-bold text-base">%+</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">{t.sur_title}</h1>
            <p className="text-xs text-white/40">{t.sur_subtitle}</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{surcharges.length}</span>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
          <Plus className="w-4 h-4" /> {t.sur_add}
        </button>
      </div>

      {/* FadeSwitch: skeleton ↔ real list */}
      <FadeSwitch id={loading ? 'skel' : 'data'}>
        {loading ? (
          <SkeletonList rows={4} />
        ) : (
      <AnimatedList className="space-y-2">
        {surcharges.map(s => (
          <AnimatedItem key={s.id} className={cn('flex items-center gap-3 p-4 bg-white/5 border rounded-2xl transition-all', s.active ? 'border-white/10' : 'border-white/5 opacity-60')}>
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-rose-400">
                {s.type === 'percentage' ? `${s.value}%` : `${currency.symbol}${Number(s.value).toFixed(currency.decimal_places)}`}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-white">{s.name}</p>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0', APPLIED_COLORS[s.applied_to] ?? 'bg-white/10 text-white/50')}>
                  {s.applied_to}
                </span>
              </div>
              <p className="text-xs text-white/40 mt-0.5">
                {s.type === 'percentage' ? `${s.value}% surcharge` : `${currency.symbol}${Number(s.value).toFixed(currency.decimal_places)} flat fee`}
              </p>
            </div>
            <button onClick={() => toggleActive(s)} className="active:scale-95 shrink-0">
              {s.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
            </button>
            <button onClick={() => openEdit(s)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDelete(s.id)} className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
              deleteId === s.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
              {deleteId === s.id ? t.delete : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </AnimatedItem>
        ))}
        {surcharges.length === 0 && <div className="text-center py-16 text-white/25 text-sm">{t.sur_no_data}</div>}
      </AnimatedList>
        )}
      </FadeSwitch>

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
    </div>
  )
}
