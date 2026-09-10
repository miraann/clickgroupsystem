'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { Plus, Pencil, Trash2, Layers, X, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTableGroups, type CachedTableGroup } from '@/hooks/useTableGroups'
import { motion, type Variants } from 'framer-motion'

type TableGroup = CachedTableGroup

const COLOR_PRESETS = [
  { value: '#f59e0b', label: 'Amber' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#f97316', label: 'Orange' },
]

const EMPTY_FORM = { name: '', color: '#f59e0b' }

const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.55, ease: 'circOut' as const } },
  exit:   { opacity: 0, y: -10, transition: { duration: 0.3 } },
}

export default function TableGroupPage() {
  const { t } = useLanguage()
  const supabase = createClient()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrGroups, error: swrError, mutate } = useTableGroups(restaurantId)
  const groups = swrGroups ?? []
  const error = swrError ? (swrError as Error).message : null

  const [modalOpen, setModalOpen]       = useState(false)
  const [editId, setEditId]             = useState<string | null>(null)
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [deleteId, setDeleteId]         = useState<string | null>(null)

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (g: TableGroup) => {
    setEditId(g.id)
    setForm({ name: g.name, color: g.color })
    setModalOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)

    if (editId) {
      const { error } = await supabase
        .from('table_groups')
        .update({ name: form.name, color: form.color })
        .eq('id', editId)
      if (!error) mutate(groups.map(g => g.id === editId ? { ...g, name: form.name, color: form.color } : g), false)
    } else {
      const nextOrder = groups.length > 0 ? Math.max(...groups.map(g => g.sort_order)) + 1 : 0
      const { data, error } = await supabase
        .from('table_groups')
        .insert({ restaurant_id: restaurantId, name: form.name, color: form.color, sort_order: nextOrder })
        .select()
        .single()
      if (!error && data) mutate([...groups, data as TableGroup], false)
    }

    setSaving(false)
    setModalOpen(false)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id)
      setTimeout(() => setDeleteId(d => d === id ? null : d), 3000)
      return
    }
    const { error } = await supabase.from('table_groups').delete().eq('id', id)
    if (!error) mutate(groups.filter(g => g.id !== id), false)
    setDeleteId(null)
  }

  // ── Render ─────────────────────────────────────────────────
  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <button onClick={() => mutate()} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <motion.div key="menu-table-group-page" variants={PAGE} initial="hidden" animate="show" exit="exit">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <Layers className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.tg_title}</h1>
          <p className="text-xs text-white/40">{t.tg_subtitle}</p>
        </div>
        <span className="ml-1 px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50 font-medium">{groups.length}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
        {/* Add-new card */}
        <button onClick={openAdd}
          className="min-h-[132px] rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-amber-400 transition-all active:scale-95">
          <span className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </span>
          <span className="text-[11px] font-semibold">{t.tg_add}</span>
        </button>
        {groups.map(g => {
          const armed = deleteId === g.id
          return (
            <div key={g.id} className="flex flex-col items-center rounded-xl border bg-white/5 border-white/10 px-2.5 py-2.5 text-center hover:border-white/20 transition-colors">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: g.color + '22', border: `1.5px solid ${g.color}55` }}>
                <Layers className="w-5 h-5" style={{ color: g.color }} />
              </div>
              <p className="mt-1.5 w-full text-sm font-bold text-white line-clamp-1">{g.name}</p>

              <span className="my-2 h-px w-full bg-white/8" />

              <div className="flex items-start justify-center gap-2 card-actions">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => handleDelete(g.id)}
                    className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                      armed ? 'bg-rose-500/90 text-white' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span className={cn('text-[9px] font-medium', armed ? 'text-rose-400' : 'text-white/40')}>
                    {armed ? t.confirm_delete : t.delete}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => openEdit(g)}
                    className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 flex items-center justify-center transition-all active:scale-95">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[9px] font-medium text-white/40">{t.edit}</span>
                </div>
              </div>
            </div>
          )
        })}
        {groups.length === 0 && (
          <div className="col-span-full text-center py-12 text-white/25 text-sm">{t.tg_no_data}</div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? t.edit : t.tg_add}</h2>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.tg_name} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Ground Floor"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">{t.tg_color}</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={cn(
                        'w-8 h-8 rounded-full transition-all active:scale-95',
                        form.color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d1220] scale-110' : ''
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                {t.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? t.save_changes : t.tg_add}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
