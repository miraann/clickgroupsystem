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
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
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
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface EventOffer {
  id: string
  restaurant_id: string
  title: string
  description: string | null
  date_label: string | null
  image_url: string | null
  active: boolean
  sort_order: number
}

const EMPTY_FORM = {
  title: '',
  date_label: '',
  description: '',
  image_url: '',
  active: true,
}

function SortableEventRow({
  ev, deleteId, onEdit, onDelete, onToggle,
}: {
  ev: EventOffer
  deleteId: string | null
  onEdit: (ev: EventOffer) => void
  onDelete: (id: string) => void
  onToggle: (ev: EventOffer) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ev.id })
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
      className={cn(
        'flex items-center gap-3 p-4 bg-white/5 border rounded-2xl hover:border-white/15 transition-all',
        ev.active ? 'border-white/10' : 'border-white/5 opacity-60'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing touch-none transition-colors shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="w-14 h-14 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
        {ev.image_url
          ? <img src={ev.image_url} alt="" className="w-full h-full object-cover" />
          : <CalendarDays className="w-6 h-6 text-white/20" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{ev.title}</p>
        {ev.date_label && <p className="text-xs text-amber-400/70 mt-0.5 truncate">{ev.date_label}</p>}
        {ev.description && <p className="text-xs text-white/35 truncate mt-0.5">{ev.description}</p>}
      </div>

      <button onClick={() => onToggle(ev)} className="active:scale-95 shrink-0 transition-all">
        {ev.active
          ? <ToggleRight className="w-6 h-6 text-amber-400" />
          : <ToggleLeft className="w-6 h-6 text-white/25" />}
      </button>

      <button
        onClick={() => onEdit(ev)}
        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => onDelete(ev.id)}
        className={cn(
          'h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 shrink-0 text-xs font-medium',
          deleteId === ev.id
            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
            : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400'
        )}
      >
        {deleteId === ev.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

export default function EventOfferPage() {
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [events, setEvents]             = useState<EventOffer[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const [modal, setModal]               = useState(false)
  const [editId, setEditId]             = useState<string | null>(null)
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState<string | null>(null)
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState<string | null>(null)
  const [deleteId, setDeleteId]         = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // ── Load ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    const { data, error: err } = await supabase
      .from('events_offers')
      .select('*')
      .eq('restaurant_id', rest.id)
      .order('sort_order')

    if (err) { setError(err.message); setLoading(false); return }
    setEvents((data ?? []) as EventOffer[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Drag end ─────────────────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = events.findIndex(e => e.id === active.id)
    const newIndex = events.findIndex(e => e.id === over.id)
    const reordered = arrayMove(events, oldIndex, newIndex).map((e, i) => ({ ...e, sort_order: i + 1 }))
    setEvents(reordered)
    await Promise.all(
      reordered.map(e =>
        supabase.from('events_offers').update({ sort_order: e.sort_order }).eq('id', e.id)
      )
    )
  }

  // ── Modal helpers ─────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setSaveError(null)
    setUploadError(null)
    setModal(true)
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
    setSaveError(null)
    setUploadError(null)
    setModal(true)
  }

  const closeModal = () => { setModal(false); setSaveError(null); setUploadError(null) }

  // ── Image upload ──────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !restaurantId) return
    const localUrl = URL.createObjectURL(file)
    setForm(f => ({ ...f, image_url: localUrl }))
    setUploading(true)
    setUploadError(null)
    const ext = file.name.split('.').pop()
    const path = `events/${restaurantId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true })
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
      setEvents(es => es.map(e => e.id === editId ? { ...e, ...payload } : e))
    } else {
      const nextOrder = events.length > 0 ? Math.max(...events.map(e => e.sort_order)) + 1 : 0
      const { data, error } = await supabase
        .from('events_offers')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select()
        .single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      setEvents(es => [...es, data as EventOffer])
    }

    setSaving(false)
    closeModal()
  }

  // ── Toggle active ─────────────────────────────────────────────
  const toggleActive = async (ev: EventOffer) => {
    const newVal = !ev.active
    setEvents(es => es.map(e => e.id === ev.id ? { ...e, active: newVal } : e))
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
    if (!error) setEvents(es => es.filter(e => e.id !== id))
    setDeleteId(null)
  }

  // ── Render ────────────────────────────────────────────────────
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
        <p className="text-xs text-white/30 mt-1">Run the SQL at the top of this file first.</p>
        <button onClick={load} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Events & Offers</h1>
            <p className="text-xs text-white/40">Drag to reorder</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{events.length}</span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 touch-manipulation transition-all"
        >
          <Plus className="w-4 h-4" /> Add Event
        </button>
      </div>

      {/* Sortable list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={events.map(e => e.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {events.map(ev => (
              <SortableEventRow
                key={ev.id}
                ev={ev}
                deleteId={deleteId}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggle={toggleActive}
              />
            ))}
            {events.length === 0 && (
              <div className="text-center py-16 text-white/25 text-sm">
                No events or offers yet. Add your first one.
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">
                {editId ? 'Edit Event / Offer' : 'Add Event / Offer'}
              </h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">

              {/* Title */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Happy Hour, Live Music Night"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              {/* Date label */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Date / Schedule</label>
                <input
                  value={form.date_label}
                  onChange={e => setForm(f => ({ ...f, date_label: e.target.value }))}
                  placeholder="e.g. Every Friday  ·  Dec 25, 2025  ·  Weekends"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
                <p className="mt-1 text-[11px] text-white/25">Flexible text — write any date or schedule description.</p>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Image</label>
                <div className="relative">
                  {form.image_url ? (
                    <div className="relative rounded-xl overflow-hidden border border-white/10 w-32 h-40 mx-auto">
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
                    <label className="flex flex-col items-center justify-center h-32 rounded-xl bg-white/3 border border-dashed border-white/15 hover:bg-white/5 hover:border-amber-500/30 cursor-pointer transition-all group">
                      <ImageIcon className="w-6 h-6 text-white/20 mb-1.5 group-hover:text-amber-400/40 transition-colors" />
                      <span className="text-xs text-white/30 group-hover:text-white/50 transition-colors">Tap to upload image</span>
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
                <span className={form.active ? 'text-white' : 'text-white/40'}>Active</span>
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
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Save Changes' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
