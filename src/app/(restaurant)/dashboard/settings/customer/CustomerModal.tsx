'use client'
import { useState } from 'react'
import { X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Customer } from './types'
import { PRESET_TAGS } from './types'

interface Props {
  customer:     Customer | null  // null = add mode
  restaurantId: string
  onClose:      () => void
  onSaved:      (c: Customer) => void
}

const EMPTY = {
  name: '', phone: '', email: '', birthday: '',
  tags: [] as string[], notes: '', blacklisted: false, status: 'active' as 'active' | 'inactive',
}

export function CustomerModal({ customer, restaurantId, onClose, onSaved }: Props) {
  const supabase = createClient()
  const { t } = useLanguage()

  const [form, setForm] = useState(
    customer
      ? { name: customer.name, phone: customer.phone ?? '', email: customer.email ?? '', birthday: customer.birthday ?? '', tags: customer.tags ?? [], notes: customer.notes ?? '', blacklisted: customer.blacklisted, status: customer.status }
      : EMPTY
  )
  const [tagInput, setTagInput]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const set = <K extends keyof typeof EMPTY>(k: K, v: typeof EMPTY[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !form.tags.includes(trimmed)) set('tags', [...form.tags, trimmed])
    setTagInput('')
  }
  const removeTag = (tag: string) => set('tags', form.tags.filter(t => t !== tag))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true); setSaveError(null)
    const payload = {
      name:        form.name.trim(),
      phone:       form.phone.trim() || null,
      email:       form.email.trim() || null,
      birthday:    form.birthday || null,
      tags:        form.tags,
      notes:       form.notes.trim() || null,
      blacklisted: form.blacklisted,
      status:      form.status,
      updated_at:  new Date().toISOString(),
    }
    if (customer) {
      const { error } = await supabase.from('customers').update(payload).eq('id', customer.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
      onSaved({ ...customer, ...payload })
    } else {
      const { data, error } = await supabase.from('customers')
        .insert({ restaurant_id: restaurantId, ...payload }).select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      onSaved(data as Customer)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d1220]/95 border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{customer ? t.edit : t.cust_add}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.cust_name} *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Customer name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.cust_phone}</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="07xx xxx xxxx"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.cust_email}</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Birthday</label>
            <input type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors" />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-violet-400/60 hover:text-violet-300"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_TAGS.filter(tag => !form.tags.includes(tag)).map(tag => (
                <button key={tag} onClick={() => addTag(tag)}
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 text-white/40 hover:bg-violet-500/15 hover:text-violet-400 border border-white/8 transition-all">
                  + {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
                placeholder="Custom tag…"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
              <button onClick={() => addTag(tagInput)} className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-sm transition-all active:scale-95">Add</button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.cust_note}</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Optional notes"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors resize-none" />
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => set('status', form.status === 'active' ? 'inactive' : 'active')} className="flex items-center gap-2 text-sm">
              {form.status === 'active' ? <ToggleRight className="w-6 h-6 text-violet-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
              <span className={form.status === 'active' ? 'text-white' : 'text-white/40'}>Active</span>
            </button>
            <button onClick={() => set('blacklisted', !form.blacklisted)} className="flex items-center gap-2 text-sm">
              {form.blacklisted ? <ToggleRight className="w-6 h-6 text-rose-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
              <span className={form.blacklisted ? 'text-rose-400' : 'text-white/40'}>Blacklisted</span>
            </button>
          </div>
        </div>

        {saveError && (
          <div className="mt-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <p className="text-xs text-rose-400 font-mono break-all">{saveError}</p>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {customer ? t.save_changes : t.cust_add}
          </button>
        </div>
      </div>
    </div>
  )
}
