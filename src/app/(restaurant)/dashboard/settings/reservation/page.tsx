'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  CalendarDays, Plus, Loader2, AlertCircle, Pencil, Trash2,
  Users, Phone, Mail, StickyNote, Search, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Reservation, Table, TableGroup, StatusFilter } from './types'
import { STATUS_CONFIG, fmtDate, todayStr } from './types'
import { ReservationModal } from './ReservationModal'

export default function ReservationPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId, setRestaurantId]   = useState<string | null>(null)
  const [reservations, setReservations]   = useState<Reservation[]>([])
  const [tables, setTables]               = useState<Table[]>([])
  const [tableGroups, setTableGroups]     = useState<TableGroup[]>([])
  const [loading, setLoading]             = useState(true)
  const [err, setErr]                     = useState<string | null>(null)

  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter]       = useState(todayStr())

  const [editRsv, setEditRsv]             = useState<Reservation | null>(null)
  const [showModal, setShowModal]         = useState(false)
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState<string | null>(null)

  const load = useCallback(async (rid: string) => {
    setLoading(true); setErr(null)
    const [{ data: resData, error }, { data: tabData }, { data: grpData }] = await Promise.all([
      supabase.from('reservations').select('*').eq('restaurant_id', rid).order('date').order('time'),
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
    const storedId = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
    if (storedId) {
      setRestaurantId(storedId); load(storedId)
    } else {
      supabase.from('restaurants').select('id').limit(1).maybeSingle().then(({ data }) => {
        if (data?.id) { setRestaurantId(data.id); load(data.id) }
        else setLoading(false)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (id: string, status: Reservation['status']) => {
    setStatusLoading(id)
    await supabase.from('reservations').update({ status }).eq('id', id)
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    setStatusLoading(null)
  }

  const handleDelete = async () => {
    if (!deleteId || !restaurantId) return
    await supabase.from('reservations').delete().eq('id', deleteId)
    setDeleteId(null)
    load(restaurantId)
  }

  const filtered = reservations.filter(r => {
    if (r.date !== dateFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return r.guest_name.toLowerCase().includes(q) ||
        r.guest_phone?.includes(q) || r.guest_email?.toLowerCase().includes(q)
    }
    return true
  })

  const total       = reservations.length
  const confirmed   = reservations.filter(r => r.status === 'confirmed').length
  const pending     = reservations.filter(r => r.status === 'pending').length
  const totalGuests = reservations.filter(r => r.status !== 'cancelled' && r.status !== 'no_show').reduce((s, r) => s + r.party_size, 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{t.rsv_title}</h1>
          <p className="text-xs text-white/35 mt-0.5">{t.rsv_subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => restaurantId && load(restaurantId)}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button onClick={() => { setEditRsv(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/30 transition-all active:scale-95">
            <Plus className="w-4 h-4" />{t.rsv_add}
          </button>
        </div>
      </div>

      {/* Date picker + search + status filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
          <CalendarDays className="w-4 h-4 text-amber-400 shrink-0" />
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="bg-transparent text-white/80 text-sm focus:outline-none [color-scheme:dark] cursor-pointer" />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 transition-colors" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all','pending','confirmed','seated','cancelled','no_show'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all active:scale-95',
                statusFilter === s
                  ? s === 'all' ? 'bg-white/15 border-white/25 text-white' : `${STATUS_CONFIG[s]?.bg} ${STATUS_CONFIG[s]?.border} ${STATUS_CONFIG[s]?.color}`
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60')}>
              {s === 'all' ? t.rsv_all : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t.rsv_all,         value: total,       color: 'text-white',        bg: 'bg-white/5',        border: 'border-white/10' },
          { label: t.rsv_status,      value: pending,     color: 'text-yellow-400',   bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
          { label: t.rsv_confirmed,   value: confirmed,   color: 'text-emerald-400',  bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: t.rsv_party_size,  value: totalGuests, color: 'text-amber-400',    bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
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
          <p className="text-white/30 text-sm">{t.rsv_no_data}</p>
          <button onClick={() => { setEditRsv(null); setShowModal(true) }} className="mt-4 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-sm font-semibold hover:bg-amber-500/25 transition-all">
            {t.rsv_add}
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

                  <div className="w-16 shrink-0 text-center">
                    <p className="text-base font-bold text-amber-400 tabular-nums">{r.time}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{fmtDate(r.date).split(',')[0]}</p>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{r.guest_name}</p>
                      <span className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border', sc.bg, sc.border, sc.color)}>
                        <StatusIcon className="w-3 h-3" />{sc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-white/40">
                        <Users className="w-3 h-3" />{r.party_size} guests
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
                    <button onClick={() => { setEditRsv(r); setShowModal(true) }}
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

      {showModal && restaurantId && (
        <ReservationModal
          reservation={editRsv}
          restaurantId={restaurantId}
          tables={tables}
          tableGroups={tableGroups}
          defaultDate={dateFilter}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(restaurantId) }}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-[#0d1220] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">{t.delete}</h3>
            <p className="text-sm text-white/50 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold transition-all active:scale-95">{t.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
