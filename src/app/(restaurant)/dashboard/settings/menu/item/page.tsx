'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, UtensilsCrossed, X, ToggleLeft, ToggleRight, Loader2, AlertCircle, Sliders, ImageIcon, GripVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Category { id: string; name: string; color: string }
interface Modifier  { id: string; name: string; required: boolean }
interface Item {
  id: string
  category_id: string | null
  name: string
  description: string
  price: number
  cost: number
  image_url: string | null
  available: boolean
  has_modifiers: boolean
  sort_order: number
}

const EMPTY_FORM = { name: '', category_id: '', price: 0, cost: 0, description: '', image_url: '', available: true, has_modifiers: false }

export default function ItemPage() {
  const supabase = createClient()
  const { symbol: cur, decimalPlaces, formatPrice } = useDefaultCurrency()

  const [restaurantId, setRestaurantId]   = useState<string | null>(null)
  const [categories, setCategories]       = useState<Category[]>([])
  const [modifiers, setModifiers]         = useState<Modifier[]>([])
  const [items, setItems]                 = useState<Item[]>([])
  const [itemModMap, setItemModMap]       = useState<Map<string, string[]>>(new Map()) // item_id → modifier_id[]
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)

  const [modal, setModal]                 = useState(false)
  const [editId, setEditId]               = useState<string | null>(null)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [selectedModIds, setSelectedModIds] = useState<string[]>([])
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)
  const [uploading, setUploading]         = useState(false)
  const [uploadError, setUploadError]     = useState<string | null>(null)
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [filterCatId, setFilterCatId]     = useState<string | 'all'>('all')

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    const [{ data: cats, error: e1 }, { data: its, error: e2 }, { data: mods, error: e3 }, { data: itemMods, error: e4 }] = await Promise.all([
      supabase.from('menu_categories').select('id, name, color').eq('restaurant_id', rest.id).order('sort_order'),
      supabase.from('menu_items').select('*').eq('restaurant_id', rest.id).order('sort_order'),
      supabase.from('menu_modifiers').select('id, name, required').eq('restaurant_id', rest.id).order('sort_order'),
      supabase.from('menu_item_modifiers').select('item_id, modifier_id'),
    ])

    if (e1 || e2 || e3 || e4) { setError((e1 || e2 || e3 || e4)!.message); setLoading(false); return }

    setCategories((cats ?? []) as Category[])
    setItems((its ?? []) as Item[])
    setModifiers((mods ?? []) as Modifier[])

    // Build item → modifier_ids map
    const map = new Map<string, string[]>()
    ;(itemMods ?? []).forEach((r: { item_id: string; modifier_id: string }) => {
      const arr = map.get(r.item_id) ?? []
      arr.push(r.modifier_id)
      map.set(r.item_id, arr)
    })
    setItemModMap(map)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const catById = (id: string | null) => categories.find(c => c.id === id)

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? '' })
    setSelectedModIds([])
    setSaveError(null)
    setModal(true)
  }

  const openEdit = (item: Item) => {
    setEditId(item.id)
    setForm({ name: item.name, category_id: item.category_id ?? '', price: item.price, cost: item.cost ?? 0, description: item.description ?? '', image_url: item.image_url ?? '', available: item.available, has_modifiers: item.has_modifiers })
    setSelectedModIds(itemModMap.get(item.id) ?? [])
    setSaveError(null)
    setModal(true)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !restaurantId) return

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setForm(f => ({ ...f, image_url: localUrl }))
    setUploading(true); setUploadError(null)

    const ext = file.name.split('.').pop()
    const path = `${restaurantId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from('menu-images').getPublicUrl(data.path)
      setForm(f => ({ ...f, image_url: publicUrl }))
      URL.revokeObjectURL(localUrl)
      // Persist public URL to DB immediately if editing
      if (editId) {
        await supabase.from('menu_items').update({ image_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', editId)
        setItems(is => is.map(i => i.id === editId ? { ...i, image_url: publicUrl } : i))
      }
    } else if (error) {
      setUploadError(error.message)
    }
    setUploading(false)
    e.target.value = ''
  }

  const toggleMod = (id: string) =>
    setSelectedModIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true); setSaveError(null)

    const hasModifiers = selectedModIds.length > 0
    const payload = {
      name:          form.name,
      category_id:   form.category_id || null,
      price:         form.price,
      cost:          form.cost,
      description:   form.description,
      image_url:     (form.image_url && !form.image_url.startsWith('blob:')) ? form.image_url : null,
      available:     form.available,
      has_modifiers: hasModifiers,
      updated_at:    new Date().toISOString(),
    }

    let itemId = editId

    if (editId) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', editId)
      if (error) { setSaveError(error.message); setSaving(false); return }
      setItems(is => is.map(i => i.id === editId ? { ...i, ...payload } : i))
    } else {
      const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 1
      const { data, error } = await supabase
        .from('menu_items')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      setItems(is => [...is, data as Item])
      itemId = data.id
    }

    // Sync modifiers: delete old, insert new
    if (itemId) {
      await supabase.from('menu_item_modifiers').delete().eq('item_id', itemId)
      if (selectedModIds.length > 0) {
        await supabase.from('menu_item_modifiers').insert(
          selectedModIds.map(mid => ({ item_id: itemId, modifier_id: mid }))
        )
      }
      setItemModMap(m => new Map(m).set(itemId!, selectedModIds))
    }

    setSaving(false)
    setModal(false)
  }

  // ── Toggle available ───────────────────────────────────────
  const toggleAvailable = async (item: Item) => {
    const newVal = !item.available
    setItems(is => is.map(i => i.id === item.id ? { ...i, available: newVal } : i))
    await supabase.from('menu_items').update({ available: newVal, updated_at: new Date().toISOString() }).eq('id', item.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return
    }
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (!error) setItems(is => is.filter(i => i.id !== id))
    setDeleteId(null)
  }

  // ── Drag & drop reorder ────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Reorder within the full items list (not the filtered view)
    const oldIndex = items.findIndex(i => i.id === active.id)
    const newIndex = items.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(items, oldIndex, newIndex)
    setItems(reordered)

    // Persist new sort_order values
    const updates = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }))
    await Promise.all(
      updates.map(u => supabase.from('menu_items').update({ sort_order: u.sort_order }).eq('id', u.id))
    )
  }

  const filtered = filterCatId === 'all' ? items : items.filter(i => i.category_id === filterCatId)

  // ── Render ─────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>

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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Items</h1>
            <p className="text-xs text-white/40">Menu items and dishes</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{items.length}</span>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 touch-manipulation transition-all">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setFilterCatId('all')}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all active:scale-95 shrink-0',
            filterCatId === 'all' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/70')}
        >
          All ({items.length})
        </button>
        {categories.map(c => (
          <button key={c.id} onClick={() => setFilterCatId(filterCatId === c.id ? 'all' : c.id)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all active:scale-95 shrink-0 border',
              filterCatId === c.id ? '' : 'bg-white/5 text-white/40 border-white/8 hover:text-white/70')}
            style={filterCatId === c.id ? { backgroundColor: c.color + '25', borderColor: c.color + '60', color: c.color } : {}}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
            {c.name} ({items.filter(i => i.category_id === c.id).length})
          </button>
        ))}
      </div>

      {/* List */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {filtered.map(item => (
              <SortableItemRow
                key={item.id}
                item={item}
                cat={catById(item.category_id)}
                modCount={(itemModMap.get(item.id) ?? []).length}
                deleteId={deleteId}
                formatPrice={formatPrice}
                onToggle={toggleAvailable}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-16 text-white/25 text-sm">
                {categories.length === 0 ? 'Add categories first before adding items.' : 'No items yet. Add your first item.'}
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? 'Edit Item' : 'Add Item'}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Item name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              {/* Category + Price + Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Category</label>
                  <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                    className="w-full bg-[#0d1220] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors">
                    <option value="">No Category</option>
                    {categories.map(c => <option key={c.id} value={c.id} className="bg-[#0d1220]">{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Price ({cur})</label>
                  <input type="number" min="0" step="0.5" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Cost ({cur})</label>
                  <input type="number" min="0" step="0.5" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                {form.price > 0 && form.cost > 0 && (
                  <div className="flex flex-col justify-end pb-2.5">
                    <p className="text-xs text-white/40">Margin</p>
                    <p className={form.price > form.cost ? 'text-sm font-semibold text-emerald-400' : 'text-sm font-semibold text-rose-400'}>
                      {Math.round(((form.price - form.cost) / form.price) * 100)}%
                    </p>
                  </div>
                )}
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Item Photo</label>
                <div className="relative">
                  {form.image_url ? (
                    <div className="relative rounded-xl overflow-hidden border border-white/10 w-32 h-40 mx-auto">
                      <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <button
                        onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all border border-white/10">
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <label className="absolute bottom-2 right-2 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/15 flex items-center gap-1.5 text-xs text-white/70 hover:text-white cursor-pointer transition-all">
                        <ImageIcon className="w-3 h-3" />Change
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-20 rounded-xl bg-white/3 border border-dashed border-white/15 hover:bg-white/5 hover:border-amber-500/30 cursor-pointer transition-all group">
                      <ImageIcon className="w-5 h-5 text-white/20 mb-1 group-hover:text-amber-400/40 transition-colors" />
                      <span className="text-xs text-white/30 group-hover:text-white/50 transition-colors">Tap to upload photo</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl backdrop-blur-sm">
                      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    </div>
                  )}
                </div>
                {uploadError && (
                  <p className="mt-1.5 text-xs text-rose-400 font-mono break-all">Upload failed: {uploadError}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional description"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors resize-none" />
              </div>

              {/* Available */}
              <button onClick={() => setForm(f => ({ ...f, available: !f.available }))} className="flex items-center gap-2 text-sm">
                {form.available ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                <span className={form.available ? 'text-white' : 'text-white/40'}>Available</span>
              </button>

              {/* Modifiers */}
              {modifiers.length > 0 && (
                <div>
                  <label className="block text-xs text-white/50 mb-2 font-medium">
                    Modifiers
                    {selectedModIds.length > 0 && <span className="ml-1.5 text-violet-400">{selectedModIds.length} selected</span>}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {modifiers.map(m => {
                      const active = selectedModIds.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleMod(m.id)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all active:scale-95',
                            active
                              ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                              : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:bg-white/8'
                          )}
                        >
                          <Sliders className="w-3 h-3" />
                          {m.name}
                          {m.required && <span className="text-rose-400/70 text-[9px]">req</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {saveError && (
              <div className="mt-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-xs text-rose-400 font-medium">Failed to save</p>
                <p className="text-xs text-white/40 mt-0.5 font-mono break-all">{saveError}</p>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => { setModal(false); setSaveError(null) }} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={handleSave} disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sortable item row ──────────────────────────────────────────
function SortableItemRow({
  item, cat, modCount, deleteId, formatPrice, onToggle, onEdit, onDelete,
}: {
  item: Item
  cat: Category | undefined
  modCount: number
  deleteId: string | null
  formatPrice: (n: number) => string
  onToggle: (item: Item) => void
  onEdit: (item: Item) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-white/15 transition-colors"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing transition-colors touch-none"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-lg shrink-0 overflow-hidden">
        {item.image_url
          ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
          : <span>🍽</span>}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-white truncate">{item.name}</p>
          {cat && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0" style={{ backgroundColor: cat.color + '25', color: cat.color }}>
              {cat.name}
            </span>
          )}
          {modCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 shrink-0 flex items-center gap-0.5">
              <Sliders className="w-2.5 h-2.5" />{modCount} mod{modCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {item.description && <p className="text-xs text-white/35 truncate mt-0.5">{item.description}</p>}
      </div>

      <div className="text-sm font-bold text-white shrink-0">{formatPrice(Number(item.price))}</div>

      <button onClick={() => onToggle(item)} className={cn('shrink-0 transition-all active:scale-95', item.available ? 'text-emerald-400' : 'text-white/25')}>
        {item.available ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
      </button>

      <button onClick={() => onEdit(item)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
        <Pencil className="w-3.5 h-3.5" />
      </button>

      <button onClick={() => onDelete(item.id)} className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 shrink-0 text-xs font-medium',
        deleteId === item.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
        {deleteId === item.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}
