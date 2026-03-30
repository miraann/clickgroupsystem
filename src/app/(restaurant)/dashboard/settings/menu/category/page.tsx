'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Tag, X, Loader2, AlertCircle, GripVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Category {
  id: string
  name: string
  color: string
  icon: string | null
  sort_order: number
  active: boolean
}

const COLOR_PRESETS = [
  'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#ff9a9e,#fecfef)',
  'linear-gradient(135deg,#96fbc4,#f9f586)',
  'linear-gradient(135deg,#fddb92,#d1fdff)',
  'linear-gradient(135deg,#30cfd0,#330867)',
  'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
]

const EMOJI_PRESETS = [
  '🍕','🍔','🍣','🍜','🥩','🍗','🌮','🥗',
  '🍱','🍛','🥘','🍝','🍤','🦞','🍦','🎂',
  '🥤','☕','🍺','🧃','🍷','🥂','🧁','🍩',
  '🥪','🌯','🥙','🫔','🥞','🧇','🥓','🍟',
]

const EMPTY_FORM = { name: '', color: 'linear-gradient(135deg,#f6d365,#fda085)', icon: '', active: true }

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

function SortableRow({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing touch-none transition-colors shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div
        className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-lg"
        style={{ background: c.color }}
      >
        {c.icon ?? <div className="w-3 h-3 rounded-full bg-white/60" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', c.active ? 'text-white' : 'text-white/40')}>{c.name}</p>
        <p className="text-xs text-white/30 mt-0.5">Sort #{c.sort_order}</p>
      </div>

      <Toggle value={c.active} onChange={() => onToggle(c)} />

      <button
        onClick={() => onEdit(c)}
        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => onDelete(c.id)}
        className={cn(
          'h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium',
          deleteId === c.id
            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
            : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400'
        )}
      >
        {deleteId === c.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

export default function CategoryPage() {
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [categories, setCategories]     = useState<Category[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editId, setEditId]             = useState<string | null>(null)
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [deleteId, setDeleteId]         = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    const { data, error: err } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', rest.id)
      .order('sort_order')

    if (err) { setError(err.message); setLoading(false); return }
    setCategories((data ?? []) as Category[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Drag end ───────────────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex(c => c.id === active.id)
    const newIndex = categories.findIndex(c => c.id === over.id)
    const reordered = arrayMove(categories, oldIndex, newIndex).map((c, i) => ({ ...c, sort_order: i + 1 }))
    setCategories(reordered)

    // Persist all new sort_orders
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
      if (!error) {
        setCategories(cs => cs.map(c => c.id === editId ? { ...c, name: form.name, color: form.color, icon, active: form.active } : c))
      }
    } else {
      const nextOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) + 1 : 1
      const { data, error } = await supabase
        .from('menu_categories')
        .insert({ restaurant_id: restaurantId, name: form.name, color: form.color, icon, active: form.active, sort_order: nextOrder })
        .select()
        .single()
      if (!error && data) setCategories(cs => [...cs, data as Category])
    }

    setSaving(false)
    setModalOpen(false)
  }

  // ── Toggle active ──────────────────────────────────────────
  const toggleActive = async (c: Category) => {
    const newVal = !c.active
    setCategories(cs => cs.map(x => x.id === c.id ? { ...x, active: newVal } : x))
    await supabase.from('menu_categories').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', c.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id)
      setTimeout(() => setDeleteId(d => d === id ? null : d), 3000)
      return
    }
    const { error } = await supabase.from('menu_categories').delete().eq('id', id)
    if (!error) setCategories(cs => cs.filter(c => c.id !== id))
    setDeleteId(null)
  }

  // ── Render ─────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
    </div>
  )

  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Run <code className="text-amber-400">supabase-menu-schema.sql</code> first.</p>
        <button onClick={load} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Tag className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Categories</h1>
            <p className="text-xs text-white/40">Drag to reorder</p>
          </div>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50 font-medium">{categories.length}</span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 touch-manipulation transition-all"
        >
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {/* Sortable list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {categories.map(c => (
              <SortableRow
                key={c.id}
                c={c}
                deleteId={deleteId}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggle={toggleActive}
              />
            ))}
            {categories.length === 0 && (
              <div className="text-center py-16 text-white/25 text-sm">No categories yet. Add your first category.</div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Name *</label>
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
                <label className="block text-xs text-white/50 mb-2 font-medium">Color</label>
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
                <label className="text-xs text-white/50 font-medium">Active</label>
                <Toggle value={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Save Changes' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
