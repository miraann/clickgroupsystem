'use client'
import { useState } from 'react'
import { X, Loader2, AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/logAudit'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Reservation, Table, TableGroup } from './types'
import { STATUS_CONFIG } from './types'

interface Props {
  reservation:  Reservation | null  // null = add mode
  restaurantId: string
  tables:       Table[]
  tableGroups:  TableGroup[]
  defaultDate:  string
  onClose:      () => void
  onSaved:      () => void
}

export function ReservationModal({ reservation, restaurantId, tables, tableGroups, defaultDate, onClose, onSaved }: Props) {
  const supabase = createClient()
  const { t } = useLanguage()

  const initGroupId = reservation?.table_id
    ? (tables.find(t => t.id === reservation.table_id)?.group_id ?? '')
    : ''

  const [form, setForm] = useState({
    guest_name:  reservation?.guest_name  ?? '',
    guest_phone: reservation?.guest_phone ?? '',
    guest_email: reservation?.guest_email ?? '',
    party_size:  reservation?.party_size  ?? 2,
    date:        reservation?.date        ?? defaultDate,
    time:        reservation?.time        ?? '',
    table_id:    reservation?.table_id    ?? '',
    note:        reservation?.note        ?? '',
    status:      reservation?.status      ?? ('pending' as Reservation['status']),
  })
  const [groupId, setGroupId] = useState(initGroupId)
  const [saving, setSaving]   = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setSaveErr('Guest name is required'); return }
    if (!form.date)              { setSaveErr('Date is required'); return }
    if (!form.time)              { setSaveErr('Time is required'); return }
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

    const { error } = reservation
      ? await supabase.from('reservations').update(payload).eq('id', reservation.id)
      : await supabase.from('reservations').insert(payload)

    setSaving(false)
    if (error) { setSaveErr(error.message); return }
    logAudit(restaurantId, reservation ? 'edit' : 'add', { entity: 'reservation', guest_name: form.guest_name, date: form.date, time: form.time, party_size: form.party_size }, reservation?.id)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d1220] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8 shrink-0">
          <h2 className="text-base font-bold text-white">{reservation ? t.edit : t.rsv_add}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">{t.rsv_guest_name} <span className="text-rose-400">*</span></label>
            <input value={form.guest_name} onChange={e => set('guest_name', e.target.value)} placeholder="Full name"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">{t.rsv_guest_phone}</label>
              <input value={form.guest_phone} onChange={e => set('guest_phone', e.target.value)} placeholder="07xx…" type="tel"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">{t.rsv_guest_email}</label>
              <input value={form.guest_email} onChange={e => set('guest_email', e.target.value)} placeholder="email@…" type="email"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">{t.rsv_date} <span className="text-rose-400">*</span></label>
              <input value={form.date} onChange={e => set('date', e.target.value)} type="date"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark] cursor-pointer" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">{t.rsv_time} <span className="text-rose-400">*</span></label>
              <input value={form.time} onChange={e => set('time', e.target.value)} type="time"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark] cursor-pointer" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">{t.rsv_party_size}</label>
              <div className="flex items-center gap-2">
                <button onClick={() => set('party_size', Math.max(1, form.party_size - 1))}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-95 transition-all text-lg font-bold">−</button>
                <span className="flex-1 text-center text-lg font-bold text-amber-400">{form.party_size}</span>
                <button onClick={() => set('party_size', form.party_size + 1)}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-95 transition-all text-lg font-bold">+</button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-white/50 block">{t.rsv_table}</label>
              <select value={groupId} onChange={e => { setGroupId(e.target.value); set('table_id', '') }}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark]">
                <option value="">— Select Zone —</option>
                {tableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select value={form.table_id} onChange={e => set('table_id', e.target.value)} disabled={!groupId}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors [color-scheme:dark] disabled:opacity-40">
                <option value="">— No table —</option>
                {tables.filter(t => t.group_id === groupId).map(t => (
                  <option key={t.id} value={t.id}>Table {t.table_number} (cap. {t.capacity})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1.5 block">{t.rsv_status}</label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(STATUS_CONFIG) as Reservation['status'][]).map(s => {
                const sc = STATUS_CONFIG[s]
                return (
                  <button key={s} onClick={() => set('status', s)}
                    className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all active:scale-95',
                      form.status === s ? `${sc.bg} ${sc.border} ${sc.color}` : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60')}>
                    {sc.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1.5 block">{t.rsv_note}</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)}
              placeholder="Special requests, allergies, occasion…" rows={2}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-colors resize-none" />
          </div>

          {saveErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{saveErr}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-white/8 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-sm font-medium transition-all active:scale-95">
            {t.cancel}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />{t.save_changes}</> : <><Check className="w-4 h-4" />{t.save_changes}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
