'use client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { useInventoryData } from '@/hooks/useInventoryData'
import { useMenuCategories } from '@/hooks/useMenuCategories'
import { useMenuItems } from '@/hooks/useMenuItems'
import { useMenuModifiers } from '@/hooks/useMenuModifiers'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { logAudit } from '@/lib/logAudit'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  closestCenter,
  DndContext,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, type Variants } from 'framer-motion'
import { AlertCircle, GripVertical, ImageIcon, Loader2, Package, Pencil, Plus, Sliders, ToggleLeft, ToggleRight, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { useState } from 'react'


interface Category  { id: string; name: string; color: string }
interface Ingredient { inventory_item_id: string; quantity: number }
interface Item {
  id: string
  category_id: string | null
  name: string
  description: string
  price: number
  cost: number
  image_url: string | null
  available: boolean
  available_delivery: boolean
  available_guest: boolean
  has_modifiers: boolean
  sort_order: number
}

const EMPTY_FORM = { name: '', category_id: '', price: 0, cost: 0, description: '', image_url: '', available: true, available_delivery: true, available_guest: true, has_modifiers: false }

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

export default function ItemPage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const { symbol: cur, formatPrice } = useDefaultCurrency()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrCats }                       = useMenuCategories(restaurantId)
  const { data: swrMods }                       = useMenuModifiers(restaurantId)
  const { data: swrItems, mutate: mutateItems } = useMenuItems(restaurantId)
  const { data: swrInv }                        = useInventoryData(restaurantId)

  const error      = null
  const categories = swrCats ?? []
  const modifiers  = (swrMods  ?? []).map(m => ({ id: m.id, name: m.name, required: m.required }))
  const items      = (swrItems?.items ?? []) as Item[]
  const itemModMap = swrItems?.modMap ?? new Map<string, string[]>()
  const invItems   = (swrInv?.items ?? []).filter(i => i.active).map(i => ({ id: i.id, name: i.name, sku: i.sku, unit_id: i.unit_id }))
  const invUnits   = (swrInv?.units ?? []).map(u => ({ id: u.id, abbreviation: u.abbreviation }))

  const [modal, setModal]                   = useState(false)
  const [editId, setEditId]                 = useState<string | null>(null)
  const [form, setForm]                     = useState(EMPTY_FORM)
  const [selectedModIds, setSelectedModIds] = useState<string[]>([])
  const [saving, setSaving]                 = useState(false)
  const [saveError, setSaveError]           = useState<string | null>(null)
  const [uploading, setUploading]           = useState(false)
  const [uploadError, setUploadError]       = useState<string | null>(null)
  const [deleteId, setDeleteId]             = useState<string | null>(null)
  const [filterCatId, setFilterCatId]       = useState<string | 'all'>('all')

  // Inventory
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [addIngId, setAddIngId]       = useState('')

  const catById = (id: string | null) => categories.find(c => c.id === id)

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? '' })
    setSelectedModIds([])
    setIngredients([])
    setAddIngId('')
    setSaveError(null)
    setModal(true)
  }

  const openEdit = async (item: Item) => {
    setEditId(item.id)
    setForm({ name: item.name, category_id: item.category_id ?? '', price: item.price, cost: item.cost ?? 0, description: item.description ?? '', image_url: item.image_url ?? '', available: item.available, available_delivery: item.available_delivery ?? true, available_guest: item.available_guest ?? true, has_modifiers: item.has_modifiers })
    setSelectedModIds(itemModMap.get(item.id) ?? [])
    setAddIngId('')
    setSaveError(null)
    // Load existing ingredients
    const { data: ings } = await supabase.from('menu_item_ingredients').select('inventory_item_id, quantity').eq('menu_item_id', item.id)
    setIngredients((ings ?? []) as Ingredient[])
    setModal(true)
  }

  // Shrink an uploaded photo before it ever hits storage. A menu image renders
  // at most ~512 CSS px (a menu card), so 800px on the long edge stays crisp on
  // retina. Re-encode to WebP and step the quality — then, if still heavy, the
  // dimension — down until the file fits a tight byte budget: a multi-MB phone
  // photo lands around 40–90 KB with no visible loss at display size. An image
  // that's already smaller than anything we'd produce is passed through as-is.
  const compressImage = (file: File): Promise<File> =>
    new Promise((resolve) => {
      const TARGET_BYTES = 90 * 1024
      const SIZE_LADDER  = [800, 640, 512]
      const MIN_QUALITY  = 0.55

      const img = new Image()
      const blobUrl = URL.createObjectURL(file)

      img.onload = async () => {
        URL.revokeObjectURL(blobUrl)
        try {
          const canWebp = document.createElement('canvas')
            .toDataURL('image/webp').startsWith('data:image/webp')
          const mime = canWebp ? 'image/webp' : 'image/jpeg'
          const ext  = canWebp ? '.webp' : '.jpg'

          const renderAt = (maxPx: number): HTMLCanvasElement => {
            let { width, height } = img
            if (width > maxPx || height > maxPx) {
              if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx }
              else                 { width = Math.round(width * maxPx / height);  height = maxPx }
            }
            const c = document.createElement('canvas')
            c.width = width; c.height = height
            c.getContext('2d')!.drawImage(img, 0, 0, width, height)
            return c
          }
          const encode = (c: HTMLCanvasElement, q: number): Promise<Blob | null> =>
            new Promise(res => c.toBlob(res, mime, q))

          let best: Blob | null = null
          for (const maxPx of SIZE_LADDER) {
            const canvas = renderAt(maxPx)
            for (let q = 0.8; q >= MIN_QUALITY - 1e-9; q -= 0.1) {
              const blob = await encode(canvas, q)
              if (!blob) continue
              best = blob
              if (blob.size <= TARGET_BYTES) break
            }
            if (best && best.size <= TARGET_BYTES) break
          }

          if (!best || best.size >= file.size) { resolve(file); return }
          resolve(new File([best], file.name.replace(/\.[^.]+$/, ext), { type: mime }))
        } catch {
          resolve(file)
        }
      }
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file) }
      img.src = blobUrl
    })

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0]
    if (!raw || !restaurantId) return

    const file = await compressImage(raw)

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setForm(f => ({ ...f, image_url: localUrl }))
    setUploading(true); setUploadError(null)

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
    const path = `${restaurantId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true, contentType: file.type })
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from('menu-images').getPublicUrl(data.path)
      setForm(f => ({ ...f, image_url: publicUrl }))
      URL.revokeObjectURL(localUrl)
      // Persist public URL to DB immediately if editing
      if (editId) {
        await supabase.from('menu_items').update({ image_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', editId)
        mutateItems({ items: items.map(i => i.id === editId ? { ...i, image_url: publicUrl } : i), modMap: itemModMap }, false)
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
      name:               form.name,
      category_id:        form.category_id || null,
      price:              form.price,
      cost:               form.cost,
      description:        form.description,
      image_url:          (form.image_url && !form.image_url.startsWith('blob:')) ? form.image_url : null,
      available:          form.available,
      available_delivery: form.available_delivery,
      available_guest:    form.available_guest,
      has_modifiers:      hasModifiers,
      updated_at:         new Date().toISOString(),
    }

    let itemId = editId
    let _newItems: Item[] = items

    if (editId) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', editId)
      if (error) { setSaveError(error.message); setSaving(false); return }
      _newItems = items.map(i => i.id === editId ? { ...i, ...payload } as Item : i)
    } else {
      const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 1
      const { data, error } = await supabase
        .from('menu_items')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      _newItems = [...items, data as Item]
      itemId = data.id
    }

    // Sync modifiers: delete old, insert new
    const _newMap = new Map(itemModMap)
    if (itemId) {
      await supabase.from('menu_item_modifiers').delete().eq('item_id', itemId)
      if (selectedModIds.length > 0) {
        await supabase.from('menu_item_modifiers').insert(
          selectedModIds.map(mid => ({ item_id: itemId, modifier_id: mid }))
        )
      }
      _newMap.set(itemId!, selectedModIds)

      // Sync ingredients: delete old, insert new
      await supabase.from('menu_item_ingredients').delete().eq('menu_item_id', itemId)
      if (ingredients.length > 0) {
        await supabase.from('menu_item_ingredients').insert(
          ingredients.map(ing => ({ restaurant_id: restaurantId, menu_item_id: itemId, inventory_item_id: ing.inventory_item_id, quantity: ing.quantity }))
        )
      }
    }
    mutateItems({ items: _newItems, modMap: _newMap }, false)

    logAudit(restaurantId, editId ? 'edit' : 'add', { entity: 'menu_item', name: form.name, price: form.price }, editId ?? undefined)
    setSaving(false)
    setModal(false)
  }

  // ── Toggle available ───────────────────────────────────────
  const toggleAvailable = async (item: Item) => {
    const newVal = !item.available
    mutateItems({ items: items.map(i => i.id === item.id ? { ...i, available: newVal } : i), modMap: itemModMap }, false)
    await supabase.from('menu_items').update({ available: newVal, updated_at: new Date().toISOString() }).eq('id', item.id)
    logAudit(restaurantId!, 'toggle', { entity: 'menu_item', name: item.name, available: newVal }, item.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return
    }
    const name = items.find(i => i.id === id)?.name
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (!error) { logAudit(restaurantId!, 'delete', { entity: 'menu_item', name }, id); mutateItems({ items: items.filter(i => i.id !== id), modMap: itemModMap }, false) }
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
    mutateItems({ items: reordered, modMap: itemModMap }, false)

    // Persist new sort_order values
    const updates = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }))
    await Promise.all(
      updates.map(u => supabase.from('menu_items').update({ sort_order: u.sort_order }).eq('id', u.id))
    )
  }

  const filtered = filterCatId === 'all' ? items : items.filter(i => i.category_id === filterCatId)

  // ── Render ─────────────────────────────────────────────────
  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Run <code className="text-amber-400">supabase-menu-schema.sql</code> first.</p>
        <button onClick={() => mutateItems()} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <motion.div key="menu-item-page" variants={PAGE} initial="hidden" animate="show" exit="exit" className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <UtensilsCrossed className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.item_title}</h1>
          <p className="text-xs text-white/40">{t.item_subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{items.length}</span>
      </div>

      {/* Category filter — tap a chip to filter, tap it again to clear */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4" style={{ scrollbarWidth: 'none' }}>
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map(i => i.id)} strategy={rectSortingStrategy}>
          <motion.div key={filterCatId} variants={LIST} initial="hidden" animate="visible"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Add-new card */}
            <button onClick={openAdd}
              className="min-h-[220px] rounded-2xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-3 text-white/40 hover:text-amber-400 transition-all active:scale-95">
              <span className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </span>
              <span className="text-xs font-semibold">{t.item_add}</span>
            </button>
            {filtered.map(item => (
              <motion.div key={item.id} variants={ITEM_VAR}>
                <SortableItemCard
                  item={item}
                  cat={catById(item.category_id)}
                  modCount={(itemModMap.get(item.id) ?? []).length}
                  deleteId={deleteId}
                  formatPrice={formatPrice}
                  onToggle={toggleAvailable}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              </motion.div>
            ))}
          </motion.div>
        </SortableContext>
      </DndContext>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-white/25 text-sm">{t.item_no_data}</div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? t.edit : t.item_add}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.item_name} *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t.item_name}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              {/* Category + Price + Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.item_category}</label>
                  <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                    className="w-full bg-[#0d1220] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors">
                    <option value="">{t.item_no_category}</option>
                    {categories.map(c => <option key={c.id} value={c.id} className="bg-[#0d1220]">{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.item_price} ({cur})</label>
                  <input type="number" min="0" step="0.5" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.item_cost} ({cur})</label>
                  <input type="number" min="0" step="0.5" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                {form.price > 0 && form.cost > 0 && (
                  <div className="flex flex-col justify-end pb-2.5">
                    <p className="text-xs text-white/40">{t.item_margin}</p>
                    <p className={form.price > form.cost ? 'text-sm font-semibold text-emerald-400' : 'text-sm font-semibold text-rose-400'}>
                      {Math.round(((form.price - form.cost) / form.price) * 100)}%
                    </p>
                  </div>
                )}
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.item_photo_label}</label>
                <div className="relative">
                  {form.image_url ? (
                    <div className="relative rounded-xl overflow-hidden border border-white/10 w-48 h-32 mx-auto">
                      <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <button
                        onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all border border-white/10">
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <label className="absolute bottom-2 right-2 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/15 flex items-center gap-1.5 text-xs text-white/70 hover:text-white cursor-pointer transition-all">
                        <ImageIcon className="w-3 h-3" />{t.item_photo_change}
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-48 h-32 mx-auto rounded-xl bg-white/3 border border-dashed border-white/15 hover:bg-white/5 hover:border-amber-500/30 cursor-pointer transition-all group">
                      <ImageIcon className="w-5 h-5 text-white/20 mb-1 group-hover:text-amber-400/40 transition-colors" />
                      <span className="text-xs text-white/30 group-hover:text-white/50 transition-colors">{t.item_photo_tap}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl backdrop-blur-sm">
                      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-white/30 text-center">{t.item_photo_ratio}</p>
                {uploadError && (
                  <p className="mt-1.5 text-xs text-rose-400 font-mono break-all">{t.item_upload_fail}: {uploadError}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.item_description}</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder={t.item_desc_ph}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors resize-none" />
              </div>

              {/* Availability toggles */}
              <div className="space-y-2">
                <button onClick={() => setForm(f => ({ ...f, available: !f.available }))} className="flex items-center gap-2 text-sm w-full">
                  {form.available ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                  <span className={form.available ? 'text-white' : 'text-white/40'}>{t.item_avail_inhouse}</span>
                </button>
                <button onClick={() => setForm(f => ({ ...f, available_delivery: !f.available_delivery }))} className="flex items-center gap-2 text-sm w-full">
                  {form.available_delivery ? <ToggleRight className="w-6 h-6 text-sky-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                  <span className={form.available_delivery ? 'text-white' : 'text-white/40'}>{t.item_avail_delivery}</span>
                </button>
                <button onClick={() => setForm(f => ({ ...f, available_guest: !f.available_guest }))} className="flex items-center gap-2 text-sm w-full">
                  {form.available_guest ? <ToggleRight className="w-6 h-6 text-violet-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                  <span className={form.available_guest ? 'text-white' : 'text-white/40'}>{t.item_avail_guest}</span>
                </button>
              </div>

              {/* Modifiers */}
              {modifiers.length > 0 && (
                <div>
                  <label className="block text-xs text-white/50 mb-2 font-medium">
                    {t.item_modifiers}
                    {selectedModIds.length > 0 && <span className="ml-1.5 text-violet-400">{selectedModIds.length} {t.item_mod_selected}</span>}
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

              {/* Inventory Ingredients */}
              {invItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-3.5 h-3.5 text-emerald-400" />
                    <label className="text-xs text-white/50 font-medium">
                      {t.item_ing_title}
                      {ingredients.length > 0 && <span className="ml-1.5 text-emerald-400">{ingredients.length} {t.item_ing_linked}</span>}
                    </label>
                  </div>

                  {/* Current ingredients list */}
                  {ingredients.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {ingredients.map(ing => {
                        const inv = invItems.find(i => i.id === ing.inventory_item_id)
                        const unit = invUnits.find(u => u.id === inv?.unit_id)
                        return (
                          <div key={ing.inventory_item_id} className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                            <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="flex-1 text-xs text-white font-medium truncate">{inv?.name ?? '—'}</span>
                            <input
                              type="number" min="0.01" step="0.01"
                              value={ing.quantity}
                              onChange={e => setIngredients(gs => gs.map(g => g.inventory_item_id === ing.inventory_item_id ? { ...g, quantity: parseFloat(e.target.value) || 1 } : g))}
                              className="w-16 bg-white/8 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-emerald-500/50"
                            />
                            {unit && <span className="text-[10px] text-white/40 w-6 shrink-0">{unit.abbreviation}</span>}
                            <button
                              onClick={() => setIngredients(gs => gs.filter(g => g.inventory_item_id !== ing.inventory_item_id))}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-95 shrink-0">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Add ingredient */}
                  <div className="flex gap-2">
                    <select
                      value={addIngId}
                      onChange={e => setAddIngId(e.target.value)}
                      className="flex-1 bg-[#0d1220] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                    >
                      <option value="">{t.item_ing_select_ph}</option>
                      {invItems.filter(i => !ingredients.find(g => g.inventory_item_id === i.id)).map(i => (
                        <option key={i.id} value={i.id}>{i.name}{i.sku ? ` (${i.sku})` : ''}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!addIngId) return
                        setIngredients(gs => [...gs, { inventory_item_id: addIngId, quantity: 1 }])
                        setAddIngId('')
                      }}
                      disabled={!addIngId}
                      className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white text-xs font-medium transition-all active:scale-95 flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t.add}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {saveError && (
              <div className="mt-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-xs text-rose-400 font-medium">{t.item_save_fail}</p>
                <p className="text-xs text-white/40 mt-0.5 font-mono break-all">{saveError}</p>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => { setModal(false); setSaveError(null) }} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                {t.cancel}
              </button>
              <button onClick={handleSave} disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? t.save_changes : t.item_add}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ── Sortable item card ────────────────────────────────────────
function SortableItemCard({
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
  const { t } = useLanguage()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  const price  = Number(item.price)
  const cost   = Number(item.cost)
  const margin = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 100) : null
  const accent = cat?.color ?? '#f59e0b'
  const armed  = deleteId === item.id

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-white/5 border-white/10 overflow-hidden transition-colors',
        item.available ? 'hover:border-white/20' : 'opacity-55',
      )}
    >
      {/* Image (3:2) */}
      <div className="p-2.5 pb-0">
        <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden bg-white/8 border border-white/10">
          {item.image_url
            ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-3xl opacity-20 select-none">🍽</div>}
          {modCount > 0 && (
            <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-violet-500/90 text-white text-[10px] font-bold">
              <Sliders className="w-2.5 h-2.5" />{modCount}
            </span>
          )}
          <button
            {...attributes}
            {...listeners}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/45 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white cursor-grab active:cursor-grabbing touch-none transition-colors"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center px-3 pt-2.5 pb-3 text-center">
        <p className="w-full text-sm font-bold text-white line-clamp-1">{item.name}</p>
        <p className="mt-1 text-base font-extrabold tabular-nums" style={{ color: accent }}>
          {formatPrice(price)}
        </p>
        {cat && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-white/45">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
            {cat.name}
          </span>
        )}

        <span className="my-2.5 h-px w-full bg-white/8" />

        {/* Actions */}
        <div className="flex items-start justify-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => onDelete(item.id)}
              className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95',
                armed ? 'bg-rose-500/90 text-white' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}>
              <Trash2 className="w-4 h-4" />
            </button>
            <span className={cn('text-[9px] font-medium', armed ? 'text-rose-400' : 'text-white/40')}>
              {armed ? t.confirm_delete : t.delete}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => onToggle(item)}
              className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95',
                item.available ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/5 text-white/30 hover:bg-white/10')}>
              {item.available ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <span className="text-[9px] font-medium text-white/40">{t.item_available}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => onEdit(item)}
              className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 flex items-center justify-center transition-all active:scale-95">
              <Pencil className="w-4 h-4" />
            </button>
            <span className="text-[9px] font-medium text-white/40">{t.edit}</span>
          </div>
        </div>

        {/* Cost / margin */}
        {cost > 0 && (
          <>
            <span className="my-2.5 h-px w-full bg-white/8" />
            <p className="text-[11px] tabular-nums text-emerald-400/80">
              {t.item_cost}: {formatPrice(cost)}
              {margin !== null && <span className="text-white/35"> · {t.item_margin} {margin}%</span>}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
