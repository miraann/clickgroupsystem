'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  CalendarDays, Plus, X, Loader2, AlertCircle, Pencil, Trash2,
  Clock, Users, Phone, Mail, StickyNote, Check, Search,
  ChevronDown, RefreshCw, CheckCircle2, XCircle, Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────
interface Reservation {
  id: string
  guest_name: string
  guest_phone: string | null
  guest_email: string | null
  party_size: number
  date: string
  time: string
  table_id: string | null
  table_label: string | null
  note: string | null
  status: 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'
  created_at: string
}

interface TableGroup {
  id: string
  name: string
}

interface Table {
  id: string
  table_number: string
  name: string
  capacity: number
  group_id: string | null
}

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', icon: Timer },
  confirmed: { label: 'Confirmed', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: CheckCircle2 },
  seated:    { label: 'Seated',    color: 'text-blue-400',    bg: 'bg-blue-500/15',   border: 'border-blue-500/30',   icon: Users },
  cancelled: { label: 'Cancelled', color: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/30',   icon: XCircle },
  no_show:   { label: 'No Show',   color: 'text-white/40',   bg: 'bg-white/8',       border: 'border-white/15',      icon: X },
}

const EMPTY_FORM = {
  guest_name: '', guest_phone: '', guest_email: '',
  party_size: 2, date: '', time: '', table_id: '', note: '', status: 'pending' as Reservation['status'],
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

export default function ReservationPage() {
  const supabase = createClient()

  const [restaurantId, setRestaurantId]   = useState<string | null>(null)
  const [reservations, setReservations]   = useState<Reservation[]>([])
  const [tables, setTables]               = useState<Table[]>([])
  const [tableGroups, setTableGroups]     = useState<TableGroup[]>([])
  const [loading, setLoading]             = useState(true)
  const [err, setErr]                     = useState<string | null>(null)

  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter]       = useState(todayStr())

  const [modal, setModal]                 = useState(false)
  const [editId, setEditId]               = useState<string | null>(null)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [formGroupId, setFormGroupId]     = useState('')
  const [saving, setSaving]               = useState(false)
  const [saveErr, setSaveErr]             = useState<string | null>(null)
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState<string | null>(null)

  // ── Load ─────────────────────────────────────────────────────────
  const load = useCallback(async (rid: string, date: string) => {
    setLoading(true); setErr(null)
    const [{ data: resData, error }, { data: tabData }, { data: grpData }] = await Promise.all([
      supabase.from('reservations').select('*').eq('restaurant_id', rid).eq('date', date).order('time'),
      supabase.from('tables').select('id,table_number,name,capacity,group_id').eq('restaurant_id', rid).eq('active', true).order('seq'),
      supabase.from('table_groups').select('id,name').eq('restaurant_id', rid).order('sort_order'),
    ])
    if (error) { setErr(error.message); setLoading(false); return }
    setReservations((resData ?? []) as Reservation[])
    setTables((tabData ?? []) as Table[])
    setTableGroups((grpData ?? []) as TableGroup[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('restaurants').select('id').limit(1).maybeSingle().then(({ data }) => {
      if (data?.id) { setRestaurantId(data.id); load(data.id, dateFilter) }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateChange = (d: string) => {
    setDateFilter(d)
    if (restaurantId) load(restaurantId, d)
  }

  // ── Status quick-update ───────────────────────────────────────────
  const updateStatus = async (id: string, status: Reservation['status']) => {
    setStatusLoading(id)
    await supabase.from('reservations').update({ status }).eq('id', id)
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    setStatusLoading(null)
  }

  // ── Save ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, date: dateFilter })
    setFormGroupId('')
    setSaveErr(null); setModal(true)
  }
  const openEdit = (r: Reservation) => {
    setEditId(r.id)
    setForm({
      guest_name: r.guest_name, guest_phone: r.guest_phone ?? '',
      guest_email: r.guest_email ?? '', party_size: r.party_size,
      date: r.date, time: r.time, table_id: r.table_id ?? '',
      note: r.note ?? '', status: r.status,
    })
    // Pre-select the group of the currently assigned table
    const existingTable = tables.find(t => t.id === r.table_id)
    setFormGroupId(existingTable?.group_id ?? '')
    setSaveErr(null); setModal(true)
  }

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setSaveErr('Guest name is required'); return }
    if (!form.date)              { setSaveErr('Date is required'); return }
    if (!form.time)              { setSaveErr('Time is required'); return }
    if (!restaurantId)           return
    setSaving(true); setSaveErr(null)

    const payload = {
      restaurant_id: restaurantId,
      guest_name:    form.guest_name.trim(),
      guest_phone:   form.guest_phone.trim() || null,
      guest_email:   form.guest_email.trim() || null,
      party_size:    form.party_size,
      date:          form.date,
      time:          form.time,
      table_id:      form.table_id || null,
      table_label:   form.table_id ? (tables.find(t => t.id === form.table_id)?.table_number ?? null) : null,
      note:          form.note.trim() || null,
      status:        form.status,
    }

    const { error } = editId
      ? await supabase.from('reservations').update(payload).eq('id', editId)
      : await supabase.from('reservations').insert(payload)

    if (error) { setSaveErr(error.message); setSaving(false); return }
    setSaving(false); setModal(false)
    load(restaurantId, dateFilter)
  }

  // ── Delete ───────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId || !restaurantId) return
    await supabase.from('reservations').delete().eq('id', deleteId)
    setDeleteId(null)
    load(restaurantId, dateFilter)
  }

  // ── Filtered list ────────────────────────────────────────────────
  const filtered = reservations.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return r.guest_name.toLowerCase().includes(q) ||
        r.guest_phone?.includes(q) || r.guest_email?.toLowerCase().includes(q)
    }
    return true
  })

  // ── KPIs ─────────────────────────────────────────────────────────
  const total     = reservations.length
  const confirmed = reservations.filter(r => r.status === 'confirmed').length
  const pending   = reservations.filter(r => r.status === 'pending').length
  const seated    = reservations.filter(r => r.status === 'seated').length
  const totalGuests = reservations.filter(r => r.status !== 'cancelled' && r.status !== 'no_show').reduce((s, r) => s + r.party_size, 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Reservations</h1>
          <p className="text-xs text-white/35 mt-0.5">Manage table bookings and guest reservations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => restaurantId && load(restaurantId, dateFilter)}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/30 transition-all active:scale-95">
            <Plus className="w-4 h-4" />New Reservation
          </button>
        </div>
      </div>

      {/* Date picker + search + status filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
          <CalendarDays className="w-4 h-4 text-amber-400 shrink-0" />
          <input
            type="date"
            value={dateFilter}
            onChange={e => handleDateChange(e.target.value)}
            className="bg-transparent text-white/80 text-sm focus:outline-none [color-scheme:dark] cursor-pointer"
          />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guest…"
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all','pending','confirmed','seated','cancelled','no_show'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all active:scale-95',
                statusFilter === s
                  ? s === 'all' ? 'bg-white/15 border-white/25 text-white' : `${STATUS_CONFIG[s]?.bg} ${STATUS_CONFIG[s]?.border} ${STATUS_CONFIG[s]?.color}`
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60')}>
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',       value: total,       color: 'text-white',         bg: 'bg-white/5',         border: 'border-white/10' },
          { label: 'Pending',     value: pending,     color: 'text-yellow-400',    bg: 'bg-yellow-500/10',   border: 'border-yellow-500/20' },
          { label: 'Confirmed',   value: confirmed,   color: 'text-emerald-400',   bg: 'bg-emerald-500/10',  border: 'border-emerald-500/20' },
          { label: 'Exp. Guests', value: totalGuests, color: 'text-amber-400',     bg: 'bg-amber-500/10',    border: 'border-amber-500/20' },
        ].map(k => (
          <div key={k.label} className={cn('rounded-2xl border p-4', k.bg, k.border)}>
            <p className="text-xs text-white/40 mb-1">{k.label}</p>
            <p className={cn('text-2xl font-bold tabular-nums', k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{err}
        </div>
      )}

      {/* Reservation list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <CalendarDays className="w-10 h-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No reservations for {fmtDate(dateFilter)}</p>
          <button onClick={openAdd} className="mt-4 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-sm font-semibold hover:bg-amber-500/25 transition-all">
            Add First Reservation
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const sc = STATUS_CONFIG[r.status]
            const StatusIcon = sc.icon
            const table = tables.find(t => t.id === r.table_id)
            return (
              <div key={r.id} className="rounded-2xl bg-white/3 border border-white/8 hover:border-white/12 transition-all">
                <div className="flex items-center gap-4 p-4">

                  {/* Time block */}
                  <div className="w-16 shrink-0 text-center">
                    <p className="text-base font-bold text-amber-400 tabular-nums">{r.time}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{fmtDate(r.date).split(',')[0]}</p>
                  </div>

                  {/* Guest info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{r.guest_name}</p>
                      <span className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border', sc.bg, sc.border, sc.color)}>
                        <StatusIcon className="w-3 h-3" />{sc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-white/40">
                        <Users className="w-3 h-3" />{r.party_size} guest num
                      </span>
                      {table && (
                        <span className="flex items-center gap-1 text-xs text-white/40">
                          <CalendarDays className="w-3 h-3" />Table {table.table_number}
                        </span>
                      )}
                      {r.guest_phone && (
                        <span className="flex items-center gap-1 text-xs text-white/40">
                          <Phone className="w-3 h-3" />{r.guest_phone}
                        </span>
                      )}
                      {r.guest_email && (
                        <span className="flex items-center gap-1 text-xs text-white/40">
                          <Mail className="w-3 h-3" />{r.guest_email}
                        </span>
                      )}
                    </div>
                    {r.note && (
                      <p className="text-xs text-white/30 italic mt-1 flex items-center gap-1">
                        <StickyNote className="w-3 h-3 shrink-0" />{r.note}
                      </p>
                    )}
                  </div>

                  {/* Status actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {r.status === 'pending' && (
                      <button onClick={() => updateStatus(r.id, 'confirmed')} disabled={statusLoading === r.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 transition-all active:scale-95">
                        {statusLoading === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
                      </button>
                    )}
                    {r.status === 'confirmed' && (
                      <button onClick={() => updateStatus(r.id, 'seated')} disabled={statusLoading === r.id}
                        className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-400 text-xs font-semibold hover:bg-blue-500/25 transition-all active:scale-95">
                        {statusLoading === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Seat'}
                      </button>
                    )}
                    {(r.status === 'pending' || r.status === 'confirmed') && (
                      <button onClick={() => updateStatus(r.id, 'no_show')} disabled={statusLoading === r.id}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 text-xs font-semibold hover:bg-white/10 transition-all active:scale-95">
                        No Show
                      </button>
                    )}
                    <button onClick={() => openEdit(r)}
                      className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(r.id)}
                      className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-95">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/8 shrink-0">
              <h2 className="text-base font-bold text-white">{editId ? 'Edit Reservation' : 'New Reservation'}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Guest name */}
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Guest Name <span className="text-rose-400">*</span></label>
                <input value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors" />
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Phone</label>
                  <input value={form.guest_phone} onChange={e => setForm(f => ({ ...f, guest_phone: e.target.value }))}
                    placeholder="07xx…" type="tel"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Email</label>
                  <input value={form.guest_email} onChange={e => setForm(f => ({ ...f, guest_email: e.target.value }))}
                    placeholder="email@…" type="email"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors" />
                </div>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Date <span className="text-rose-400">*</span></label>
                  <input value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    type="date"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark] cursor-pointer" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Time <span className="text-rose-400">*</span></label>
                  <input value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    type="time"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark] cursor-pointer" />
                </div>
              </div>

              {/* Party size + Table */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Guest Num</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setForm(f => ({ ...f, party_size: Math.max(1, f.party_size - 1) }))}
                      className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-95 transition-all text-lg font-bold">−</button>
                    <span className="flex-1 text-center text-lg font-bold text-amber-400">{form.party_size}</span>
                    <button onClick={() => setForm(f => ({ ...f, party_size: f.party_size + 1 }))}
                      className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-95 transition-all text-lg font-bold">+</button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/50 block">Table (optional)</label>
                  {/* Step 1: Group */}
                  <select
                    value={formGroupId}
                    onChange={e => { setFormGroupId(e.target.value); setForm(f => ({ ...f, table_id: '' })) }}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark]">
                    <option value="">— Select Zone —</option>
                    {tableGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  {/* Step 2: Table filtered by group */}
                  <select
                    value={form.table_id}
                    onChange={e => setForm(f => ({ ...f, table_id: e.target.value }))}
                    disabled={!formGroupId}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark] disabled:opacity-40">
                    <option value="">— No table —</option>
                    {tables
                      .filter(t => t.group_id === formGroupId)
                      .map(t => (
                        <option key={t.id} value={t.id}>Table {t.table_number} (cap. {t.capacity})</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Status</label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.keys(STATUS_CONFIG) as Reservation['status'][]).map(s => {
                    const sc = STATUS_CONFIG[s]
                    return (
                      <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                        className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all active:scale-95',
                          form.status === s ? `${sc.bg} ${sc.border} ${sc.color}` : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60')}>
                        {sc.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Note</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Special requests, allergies, occasion…"
                  rows={2}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors resize-none" />
              </div>

              {saveErr && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{saveErr}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-white/8 shrink-0">
              <button onClick={() => setModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Check className="w-4 h-4" />{editId ? 'Update' : 'Save Reservation'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-[#0d1220] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Delete Reservation</h3>
            <p className="text-sm text-white/50 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold transition-all active:scale-95">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
