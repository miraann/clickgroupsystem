'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Gift, X, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useComboDiscounts, type CachedCombo } from '@/hooks/useComboDiscounts'
import { motion, type Variants } from 'framer-motion'

type Combo = CachedCombo

const EMPTY_FORM = { name: '', description: '', buy_qty: 2, get_qty: 1, discount_pct: 100, active: true }

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

export default function ComboDiscountPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrCombos, error: swrError, mutate } = useComboDiscounts(restaurantId)
  const combos = swrCombos ?? []
  const error  = swrError ? (swrError as Error).message : null

  const [modal,    setModal]    = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setModal(true) }
  const openEdit = (c: Combo) => {
    setEditId(c.id)
    setForm({ name: c.name, description: c.description ?? '', buy_qty: c.buy_qty, get_qty: c.get_qty, discount_pct: c.discount_pct, active: c.active })
    setModal(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)
    const payload = { name: form.name, description: form.description, buy_qty: form.buy_qty, get_qty: form.get_qty, discount_pct: form.discount_pct, active: form.active, updated_at: new Date().toISOString() }

    if (editId) {
      const { error: err } = await supabase.from('combo_discounts').update(payload).eq('id', editId)
      if (!err) mutate(combos.map(c => c.id === editId ? { ...c, ...payload } : c), false)
    } else {
      const nextOrder = combos.length > 0 ? Math.max(...combos.map(c => c.sort_order)) + 1 : 0
      const { data, error: err } = await supabase
        .from('combo_discounts')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select().single()
      if (!err && data) mutate([...combos, data as Combo], false)
    }
    setSaving(false)
    setModal(false)
  }

  // ── Toggle active ──────────────────────────────────────────
  const toggleActive = async (c: Combo) => {
    const newVal = !c.active
    mutate(combos.map(x => x.id === c.id ? { ...x, active: newVal } : x), false)
    await supabase.from('combo_discounts').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', c.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return
    }
    const { error: err } = await supabase.from('combo_discounts').delete().eq('id', id)
    if (!err) mutate(combos.filter(c => c.id !== id), false)
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
    <motion.div key="menu-combo-discount-page" variants={PAGE} initial="hidden" animate="show" exit="exit" className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
          <Gift className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.combo_title}</h1>
          <p className="text-xs text-white/40">{t.combo_subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{combos.length}</span>
      </div>

      <motion.div variants={LIST} initial="hidden" animate="visible" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Add-new card */}
        <button onClick={openAdd}
          className="min-h-[170px] rounded-2xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-amber-400 transition-all active:scale-95">
          <span className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </span>
          <span className="text-[11px] font-semibold">{t.combo_add}</span>
        </button>
        {combos.map(c => {
          const armed = deleteId === c.id
          return (
            <motion.div key={c.id} variants={ITEM_VAR} className={cn('flex flex-col items-center rounded-2xl border bg-white/5 px-3 py-3 text-center transition-colors',
              c.active ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-55')}>
              <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5 text-violet-400" />
              </div>
              <p className="mt-1.5 w-full text-sm font-bold text-white line-clamp-1">{c.name}</p>
              {c.description && <p className="text-[11px] text-white/35 line-clamp-1 w-full">{c.description}</p>}
              <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400">Buy {c.buy_qty}</span>
                {c.get_qty > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">Get {c.get_qty}</span>}
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400">{c.discount_pct}%</span>
              </div>

              <span className="my-2.5 h-px w-full bg-white/8" />

              <div className="flex items-start justify-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => handleDelete(c.id)}
                    className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                      armed ? 'bg-rose-500/90 text-white' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span className={cn('text-[9px] font-medium', armed ? 'text-rose-400' : 'text-white/40')}>
                    {armed ? t.confirm_delete : t.delete}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => toggleActive(c)}
                    className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                      c.active ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/5 text-white/30 hover:bg-white/10')}>
                    {c.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <span className="text-[9px] font-medium text-white/40">{t.disc_active}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => openEdit(c)}
                    className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 flex items-center justify-center transition-all active:scale-95">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[9px] font-medium text-white/40">{t.edit}</span>
                </div>
              </div>
            </motion.div>
          )
        })}
        {combos.length === 0 && <div className="col-span-full text-center py-12 text-white/25 text-sm">{t.combo_no_data}</div>}
      </motion.div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? `${t.edit} ${t.combo_title}` : `${t.add} ${t.combo_title}`}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.combo_name} *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Buy 2 Get 1 Free"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([{ k: 'buy_qty', label: t.combo_items }, { k: 'get_qty', label: t.combo_items }, { k: 'discount_pct', label: t.combo_discount }] as const).map(({ k, label }) => (
                  <div key={k}>
                    <label className="block text-xs text-white/50 mb-1.5 font-medium">{label}</label>
                    <input type="number" min="0" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                  </div>
                ))}
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
                {editId ? t.save_changes : t.combo_add}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
