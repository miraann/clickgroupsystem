'use client'
import { useState } from 'react'
import { X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Member } from './types'
import { TIERS } from './types'

interface Props {
  member:       Member | null  // null = add mode
  restaurantId: string
  onClose:      () => void
  onSaved:      (m: Member) => void
}

const EMPTY = {
  name: '', phone: '', email: '', points: 0,
  tier: 'Standard', birthday: '', notes: '', status: 'active' as 'active' | 'inactive',
}

export function MemberModal({ member, restaurantId, onClose, onSaved }: Props) {
  const supabase = createClient()
  const { t } = useLanguage()

  const [form, setForm] = useState(
    member
      ? { name: member.name, phone: member.phone ?? '', email: member.email ?? '', points: member.points, tier: member.tier, birthday: member.birthday ?? '', notes: member.notes ?? '', status: member.status }
      : EMPTY
  )
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const set = <K extends keyof typeof EMPTY>(k: K, v: typeof EMPTY[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true); setSaveError(null)
    const payload = {
      name:     form.name.trim(),
      phone:    form.phone.trim() || null,
      email:    form.email.trim() || null,
      points:   form.points,
      tier:     form.tier,
      birthday: form.birthday || null,
      notes:    form.notes.trim() || null,
      status:   form.status,
      updated_at: new Date().toISOString(),
    }
    if (member) {
      const { error } = await supabase.from('members').update(payload).eq('id', member.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
      onSaved({ ...member, ...payload })
    } else {
      const { data, error } = await supabase.from('members')
        .insert({ restaurant_id: restaurantId, ...payload }).select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      onSaved(data as Member)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d1220]/95 border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{member ? t.edit : t.mem_add}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_name} *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Member name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_phone}</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="07xx xxx xxxx"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_email}</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_tier}</label>
              <select value={form.tier} onChange={e => set('tier', e.target.value)}
                className="w-full bg-[#0d1220] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors">
                {TIERS.map(t => <option key={t} value={t} className="bg-[#0d1220]">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_points}</label>
              <input type="number" min="0" value={form.points} onChange={e => set('points', parseInt(e.target.value) || 0)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Birthday</label>
            <input type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Optional notes"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors resize-none" />
          </div>

          <button onClick={() => set('status', form.status === 'active' ? 'inactive' : 'active')} className="flex items-center gap-2 text-sm">
            {form.status === 'active' ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
            <span className={form.status === 'active' ? 'text-white' : 'text-white/40'}>Active</span>
          </button>
        </div>

        {saveError && (
          <div className="mt-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <p className="text-xs text-rose-400 font-mono break-all">{saveError}</p>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {member ? t.save_changes : t.mem_add}
          </button>
        </div>
      </div>
    </div>
  )
}
