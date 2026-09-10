/*
  SQL — run in Supabase SQL Editor to create the events_offers table:

  create table public.events_offers (
    id            uuid default uuid_generate_v4() primary key,
    restaurant_id uuid references public.restaurants(id) on delete cascade not null,
    title         text not null,
    description   text,
    date_label    text,
    image_url     text,
    active        boolean not null default true,
    sort_order    integer not null default 0,
    created_at    timestamptz default now()
  );

  alter table public.events_offers enable row level security;

  -- Allow restaurant staff to manage their own events
  create policy "Restaurant staff can manage events_offers"
    on public.events_offers for all
    using (
      restaurant_id in (
        select restaurant_id from public.profiles where id = auth.uid()
        union
        select restaurant_id from public.restaurant_users where user_id = auth.uid()
      )
    );

  -- Allow public read (for the public menu page /r/[restaurantId])
  create policy "Public can read active events_offers"
    on public.events_offers for select
    using (active = true);
*/

'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  Plus, Pencil, Trash2, CalendarDays, X,
  ToggleLeft, ToggleRight, Loader2, AlertCircle, ImageIcon, GripVertical,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, rectSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEventOffers, type CachedEventOffer } from '@/hooks/useEventOffers'
import { motion, type Variants } from 'framer-motion'

type EventOffer = CachedEventOffer

const EMPTY_FORM = {
  title: '',
  date_label: '',
  description: '',
  image_url: '',
  active: true,
}

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

function SortableEventCard({
  ev, deleteId, onEdit, onDelete, onToggle,
}: {
  ev: EventOffer
  deleteId: string | null
  onEdit: (ev: EventOffer) => void
  onDelete: (id: string) => void
  onToggle: (ev: EventOffer) => void
}) {
  const { t } = useLanguage()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ev.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }
  const armed = deleteId === ev.id

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-white/5 border-white/10 overflow-hidden transition-colors',
        ev.active ? 'hover:border-white/20' : 'opacity-55',
      )}
    >
      {/* Image (9:16 story) */}
      <div className="p-2.5 pb-0">
        <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-white/8 border border-white/10">
          {ev.image_url
            ? <img src={ev.image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><CalendarDays className="w-6 h-6 text-white/20" /></div>}
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
        <p className="w-full text-sm font-bold text-white line-clamp-1">{ev.title}</p>
        {ev.date_label && <p className="mt-0.5 text-[11px] font-medium text-amber-400/80 line-clamp-1">{ev.date_label}</p>}
        {ev.description && <p className="mt-0.5 text-[11px] text-white/35 line-clamp-1 w-full">{ev.description}</p>}

        <span className="my-2.5 h-px w-full bg-white/8" />

        {/* Actions */}
        <div className="flex items-start justify-center gap-2 card-actions">
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => onDelete(ev.id)}
              className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95',
                armed ? 'bg-rose-500/90 text-white' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}>
              <Trash2 className="w-4 h-4" />
            </button>
            <span className={cn('text-[9px] font-medium', armed ? 'text-rose-400' : 'text-white/40')}>
              {armed ? t.confirm_delete : t.delete}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => onToggle(ev)}
              className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95',
                ev.active ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/5 text-white/30 hover:bg-white/10')}>
              {ev.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <span className="text-[9px] font-medium text-white/40">{t.evt_active}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => onEdit(ev)}
              className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 flex items-center justify-center transition-all active:scale-95">
              <Pencil className="w-4 h-4" />
            </button>
            <span className="text-[9px] font-medium text-white/40">{t.edit}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EventOfferPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrEvents, error: swrError, mutate } = useEventOffers(restaurantId)

  const events = swrEvents ?? []
  const error  = swrError ? (swrError as Error).message : null

  const [modal, setModal]             = useState(false)
  const [editId, setEditId]           = useState<string | null>(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteId, setDeleteId]       = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // ── Drag end ─────────────────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = events.findIndex(e => e.id === active.id)
    const newIndex = events.findIndex(e => e.id === over.id)
    const reordered = arrayMove(events, oldIndex, newIndex).map((e, i) => ({ ...e, sort_order: i + 1 }))
    mutate(reordered, false)
    await Promise.all(
      reordered.map(e =>
        supabase.from('events_offers').update({ sort_order: e.sort_order }).eq('id', e.id)
      )
    )
  }

  // ── Modal helpers ─────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null); setForm(EMPTY_FORM); setSaveError(null); setUploadError(null); setModal(true)
  }

  const openEdit = (ev: EventOffer) => {
    setEditId(ev.id)
    setForm({
      title:       ev.title,
      date_label:  ev.date_label  ?? '',
      description: ev.description ?? '',
      image_url:   ev.image_url   ?? '',
      active:      ev.active,
    })
    setSaveError(null); setUploadError(null); setModal(true)
  }

  const closeModal = () => { setModal(false); setSaveError(null); setUploadError(null) }

  // ── Image compression + upload ────────────────────────────────
  const compressImage = (file: File): Promise<File> =>
    new Promise((resolve, reject) => {
      const MAX_PX = 1200
      const QUALITY = 0.82
      const img = new Image()
      const blobUrl = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(blobUrl)
        let { width, height } = img
        if (width > MAX_PX || height > MAX_PX) {
          if (width >= height) { height = Math.round(height * MAX_PX / width); width = MAX_PX }
          else                 { width = Math.round(width * MAX_PX / height);  height = MAX_PX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        const mime = canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg'
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Compression failed')); return }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: mime }))
        }, mime, QUALITY)
      }
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file) }
      img.src = blobUrl
    })

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0]
    if (!raw || !restaurantId) return
    const file = await compressImage(raw)
    const localUrl = URL.createObjectURL(file)
    setForm(f => ({ ...f, image_url: localUrl }))
    setUploading(true); setUploadError(null)
    const path = `events/${restaurantId}/${Date.now()}.webp`
    const { data, error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true, contentType: file.type })
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from('menu-images').getPublicUrl(data.path)
      setForm(f => ({ ...f, image_url: publicUrl }))
      URL.revokeObjectURL(localUrl)
    } else if (error) {
      setUploadError(error.message)
    }
    setUploading(false)
    e.target.value = ''
  }

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim() || !restaurantId) return
    setSaving(true); setSaveError(null)

    const payload = {
      title:       form.title.trim(),
      date_label:  form.date_label.trim()  || null,
      description: form.description.trim() || null,
      image_url:   (form.image_url && !form.image_url.startsWith('blob:')) ? form.image_url : null,
      active:      form.active,
    }

    if (editId) {
      const { error } = await supabase.from('events_offers').update(payload).eq('id', editId)
      if (error) { setSaveError(error.message); setSaving(false); return }
      mutate(events.map(e => e.id === editId ? { ...e, ...payload } : e), false)
    } else {
      const nextOrder = events.length > 0 ? Math.max(...events.map(e => e.sort_order)) + 1 : 0
      const { data, error } = await supabase
        .from('events_offers')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select()
        .single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      mutate([...events, data as EventOffer], false)
    }

    setSaving(false)
    closeModal()
  }

  // ── Toggle active ─────────────────────────────────────────────
  const toggleActive = async (ev: EventOffer) => {
    const newVal = !ev.active
    mutate(events.map(e => e.id === ev.id ? { ...e, active: newVal } : e), false)
    await supabase.from('events_offers').update({ active: newVal }).eq('id', ev.id)
  }

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id)
      setTimeout(() => setDeleteId(d => d === id ? null : d), 3000)
      return
    }
    const { error } = await supabase.from('events_offers').delete().eq('id', id)
    if (!error) mutate(events.filter(e => e.id !== id), false)
    setDeleteId(null)
  }

  // ── Render ────────────────────────────────────────────────────
  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Run the SQL at the top of this file first.</p>
        <button onClick={() => mutate()} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <motion.div key="menu-event-offer-page" variants={PAGE} initial="hidden" animate="show" exit="exit" className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.evt_title}</h1>
          <p className="text-xs text-white/40">{t.evt_subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{events.length}</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={events.map(e => e.id)} strategy={rectSortingStrategy}>
          <motion.div variants={LIST} initial="hidden" animate="visible" className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {/* Add-new card */}
            <button onClick={openAdd}
              className="min-h-[220px] rounded-2xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-3 text-white/40 hover:text-amber-400 transition-all active:scale-95">
              <span className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-semibold">{t.evt_add}</span>
            </button>
            {events.map(ev => (
              <motion.div key={ev.id} variants={ITEM_VAR}>
                <SortableEventCard
                  ev={ev}
                  deleteId={deleteId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggle={toggleActive}
                />
              </motion.div>
            ))}
          </motion.div>
        </SortableContext>
      </DndContext>

      {events.length === 0 && (
        <div className="text-center py-12 text-white/25 text-sm">{t.evt_no_data}</div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">
                {editId ? t.edit : t.evt_add}
              </h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">

              {/* Image Upload */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.evt_image}</label>
                <div className="relative">
                  {form.image_url ? (
                    <div className="relative rounded-xl overflow-hidden border border-white/10 w-40 aspect-[9/16] mx-auto">
                      <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <button
                        onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all border border-white/10"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <label className="absolute bottom-2 right-2 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/15 flex items-center gap-1.5 text-xs text-white/70 hover:text-white cursor-pointer transition-all">
                        <ImageIcon className="w-3 h-3" />Change
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-40 aspect-[9/16] mx-auto rounded-xl bg-white/3 border border-dashed border-white/15 hover:bg-white/5 hover:border-amber-500/30 cursor-pointer transition-all group">
                      <ImageIcon className="w-6 h-6 text-white/20 mb-1.5 group-hover:text-amber-400/40 transition-colors" />
                      <span className="text-xs text-white/30 group-hover:text-white/50 transition-colors text-center px-3">Tap to upload image</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl backdrop-blur-sm">
                      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-white/30 text-center">Displayed at a 9:16 (story) ratio</p>
                {uploadError && (
                  <p className="mt-1.5 text-xs text-rose-400 font-mono break-all">Upload failed: {uploadError}</p>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.evt_name} *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Happy Hour, Live Music Night"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              {/* Date label */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.evt_start} / {t.evt_end}</label>
                <input
                  value={form.date_label}
                  onChange={e => setForm(f => ({ ...f, date_label: e.target.value }))}
                  placeholder="e.g. Every Friday  ·  Dec 25, 2025  ·  Weekends"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
                <p className="mt-1 text-[11px] text-white/25">Flexible text — write any date or schedule description.</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.evt_description}</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional details about the event or offer..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                />
              </div>

              {/* Active toggle */}
              <button
                onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                className="flex items-center gap-2 text-sm"
              >
                {form.active
                  ? <ToggleRight className="w-6 h-6 text-amber-400" />
                  : <ToggleLeft className="w-6 h-6 text-white/25" />}
                <span className={form.active ? 'text-white' : 'text-white/40'}>{t.evt_active}</span>
              </button>
            </div>

            {saveError && (
              <div className="mt-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-xs text-rose-400 font-medium">Failed to save</p>
                <p className="text-xs text-white/40 mt-0.5 font-mono break-all">{saveError}</p>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? t.save_changes : t.evt_add}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
