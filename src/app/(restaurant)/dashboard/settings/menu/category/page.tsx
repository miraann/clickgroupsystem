'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { Plus, Pencil, Trash2, Tag, X, Loader2, AlertCircle, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/logAudit'
import { useMenuCategories, type CachedCategory } from '@/hooks/useMenuCategories'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, type Variants } from 'framer-motion'

type Category = CachedCategory

const COLOR_PRESETS = [
  'linear-gradient(160deg,#c2185b,#7b0033)',
  'linear-gradient(160deg,#e65100,#bf360c)',
  'linear-gradient(160deg,#004d40,#00251a)',
  'linear-gradient(160deg,#1b5e20,#003300)',
  'linear-gradient(160deg,#b71c1c,#7f0000)',
  'linear-gradient(160deg,#006064,#002b2e)',
  'linear-gradient(160deg,#283593,#1a237e)',
  'linear-gradient(160deg,#ad1457,#880e4f)',
  'linear-gradient(160deg,#827717,#524a00)',
  'linear-gradient(160deg,#6a1b9a,#4a0072)',
  'linear-gradient(160deg,#1a237e,#0d1457)',
  'linear-gradient(160deg,#558b2f,#33691e)',
]

const EMOJI_PRESETS = [
  '🍕','🍔','🍣','🍜','🥩','🍗','🌮','🥗',
  '🍱','🍛','🥘','🍝','🍤','🦞','🍦','🎂',
  '🥤','☕','🍺','🧃','🍷','🥂','🧁','🍩',
  '🥪','🌯','🥙','🫔','🥞','🧇','🥓','🍟',
]

const EMPTY_FORM = { name: '', color: 'linear-gradient(160deg,#c2185b,#7b0033)', icon: '', active: true }

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn('w-10 h-6 rounded-full transition-all duration-200 relative active:scale-95', value ? 'bg-amber-500' : 'bg-white/10')}
    >
      <div className={cn('absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 shadow', value ? 'left-5' : 'left-1')} />
    </button>
  )
}

function SortableCard({
  c,
  deleteId,
  onEdit,
  onDelete,
  onToggle,
}: {
  c: Category
  deleteId: string | null
  onEdit: (c: Category) => void
  onDelete: (id: string) => void
  onToggle: (c: Category) => void
}) {
  const { t } = useLanguage()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }
  const armed = deleteId === c.id

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex flex-col items-center rounded-xl border bg-white/5 border-white/10 px-2.5 py-2.5 text-center transition-colors',
        c.active ? 'hover:border-white/20' : 'opacity-55',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1.5 end-1.5 w-6 h-6 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 cursor-grab active:cursor-grabbing touch-none transition-colors"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <div className="w-11 h-11 rounded-xl border border-white/10 flex items-center justify-center text-xl shrink-0"
        style={{ background: c.color }}>
        {c.icon || <span className="text-sm font-bold text-white/80">{c.name.charAt(0).toUpperCase()}</span>}
      </div>
      <p className="mt-1.5 w-full text-sm font-bold text-white line-clamp-1">{c.name}</p>
      <p className="text-[10px] text-white/35">Sort #{c.sort_order}</p>

      <span className="my-2 h-px w-full bg-white/8" />

      {/* Actions */}
      <div className="flex items-start justify-center gap-2">
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => onDelete(c.id)}
            className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
              armed ? 'bg-rose-500/90 text-white' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <span className={cn('text-[9px] font-medium', armed ? 'text-rose-400' : 'text-white/40')}>
            {armed ? t.confirm_delete : t.delete}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => onToggle(c)}
            className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
              c.active ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/5 text-white/30 hover:bg-white/10')}>
            {c.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <span className="text-[9px] font-medium text-white/40">{t.dev_active}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => onEdit(c)}
            className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 flex items-center justify-center transition-all active:scale-95">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <span className="text-[9px] font-medium text-white/40">{t.edit}</span>
        </div>
      </div>
    </div>
  )
}

const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.55, ease: 'circOut' as const } },
  exit:   { opacity: 0, y: -10, transition: { duration: 0.3 } },
}

export default function CategoryPage() {
  const { t } = useLanguage()
  const supabase = createClient()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrCategories, error: swrError, mutate } = useMenuCategories(restaurantId)
  const categories = swrCategories ?? []
  const error = swrError ? (swrError as Error).message : null

  const [modalOpen, setModalOpen]       = useState(false)
  const [editId, setEditId]             = useState<string | null>(null)
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [deleteId, setDeleteId]         = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // ── Drag end ───────────────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex(c => c.id === active.id)
    const newIndex = categories.findIndex(c => c.id === over.id)
    const reordered = arrayMove(categories, oldIndex, newIndex).map((c, i) => ({ ...c, sort_order: i + 1 }))
    mutate(reordered, false)

    await Promise.all(
      reordered.map(c =>
        supabase.from('menu_categories').update({ sort_order: c.sort_order, updated_at: new Date().toISOString() }).eq('id', c.id)
      )
    )
  }

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit = (c: Category) => {
    setEditId(c.id)
    setForm({ name: c.name, color: c.color, icon: c.icon ?? '', active: c.active })
    setModalOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)
    const icon = form.icon.trim() || null

    if (editId) {
      const { error } = await supabase
        .from('menu_categories')
        .update({ name: form.name, color: form.color, icon, active: form.active, updated_at: new Date().toISOString() })
        .eq('id', editId)
      if (!error) mutate(categories.map(c => c.id === editId ? { ...c, name: form.name, color: form.color, icon, active: form.active } : c), false)
    } else {
      const nextOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) + 1 : 1
      const { data, error } = await supabase
        .from('menu_categories')
        .insert({ restaurant_id: restaurantId, name: form.name, color: form.color, icon, active: form.active, sort_order: nextOrder })
        .select()
        .single()
      if (!error && data) mutate([...categories, data as Category], false)
    }

    logAudit(restaurantId, editId ? 'edit' : 'add', { entity: 'menu_category', name: form.name }, editId ?? undefined)
    setSaving(false)
    setModalOpen(false)
  }

  // ── Toggle active ──────────────────────────────────────────
  const toggleActive = async (c: Category) => {
    const newVal = !c.active
    mutate(categories.map(x => x.id === c.id ? { ...x, active: newVal } : x), false)
    await supabase.from('menu_categories').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', c.id)
    logAudit(restaurantId!, 'toggle', { entity: 'menu_category', name: c.name, active: newVal }, c.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id)
      setTimeout(() => setDeleteId(d => d === id ? null : d), 3000)
      return
    }
    const name = categories.find(c => c.id === id)?.name
    const { error } = await supabase.from('menu_categories').delete().eq('id', id)
    if (!error) { logAudit(restaurantId!, 'delete', { entity: 'menu_category', name }, id); mutate(categories.filter(c => c.id !== id), false) }
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
    <motion.div key="menu-category-page" variants={PAGE} initial="hidden" animate="show" exit="exit">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <Tag className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.cat_title}</h1>
          <p className="text-xs text-white/40">{t.cat_subtitle}</p>
        </div>
        <span className="ml-1 px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50 font-medium">{categories.length}</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories.map(c => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
            {/* Add-new card */}
            <button onClick={openAdd}
              className="min-h-[132px] rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-amber-400 transition-all active:scale-95">
              <span className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-semibold">{t.cat_add}</span>
            </button>
            {categories.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'circOut', delay: 0.08 + i * 0.05 }}
              >
                <SortableCard
                  c={c}
                  deleteId={deleteId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggle={toggleActive}
                />
              </motion.div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {categories.length === 0 && (
        <div className="text-center py-12 text-white/25 text-sm">{t.cat_no_data}</div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? t.edit : t.cat_add}</h2>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.cat_name} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Main Course"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              {/* Icon */}
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">Icon (emoji)</label>
                <div className="grid grid-cols-8 gap-1.5 mb-2">
                  {EMOJI_PRESETS.map(e => (
                    <button
                      key={e}
                      onClick={() => setForm(f => ({ ...f, icon: f.icon === e ? '' : e }))}
                      className={cn(
                        'h-9 rounded-lg text-lg flex items-center justify-center transition-all active:scale-90',
                        form.icon === e
                          ? 'bg-amber-500/30 ring-1 ring-amber-400 scale-110'
                          : 'bg-white/5 hover:bg-white/10'
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={form.icon}
                  onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  placeholder="Or type any emoji…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">{t.cat_color}</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={cn('w-9 h-9 rounded-full transition-all active:scale-95 shadow-md', form.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d1220] scale-110' : '')}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Active */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-white/50 font-medium">{t.dev_active}</label>
                <Toggle value={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} />
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
                {editId ? t.save_changes : t.cat_add}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
