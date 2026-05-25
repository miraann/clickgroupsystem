'use client'
import { useState } from 'react'
import { X, Store, Loader2, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EMPTY_FORM } from './types'
import type { Plan } from '../plans/PlanModal'

interface Props {
  plans:   Plan[]
  onClose: () => void
  onSaved: () => void
}

const FIELDS = [
  { label: 'Restaurant Name *', key: 'name',      placeholder: 'e.g. Spice Garden',        type: 'text'  },
  { label: 'Owner Full Name',   key: 'ownerName', placeholder: 'e.g. Ahmad Karimi',         type: 'text'  },
  { label: 'Owner Email',       key: 'email',     placeholder: 'owner@restaurant.com',      type: 'email' },
  { label: 'Phone Number',      key: 'phone',     placeholder: '+964 XXX XXX XXXX',         type: 'tel'   },
] as const

export function AddRestaurantModal({ plans, onClose, onSaved }: Props) {
  const supabase = createClient()

  const defaultPlan = plans[0]?.slug ?? ''
  const [form, setForm]                 = useState({ ...EMPTY_FORM, plan: defaultPlan })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setSaveError('Invalid email address.'); return
    }
    if (form.phone.trim() && form.phone.replace(/[\s\-+()]/g, '').length < 7) {
      setSaveError('Phone number is too short.'); return
    }
    if (form.password.length > 0 && form.password.length < 8) {
      setSaveError('Password must be at least 8 characters.'); return
    }
    setSaving(true); setSaveError(null)
    const settings: Record<string, unknown> = {}
    if (form.ownerName.trim()) settings.owner_name = form.ownerName.trim()
    if (form.password.trim())  settings.password   = form.password.trim()

    // Apply selected plan's module permissions
    const selectedPlan = plans.find(p => p.slug === form.plan)
    if (selectedPlan) settings.modules = selectedPlan.modules

    const { error } = await supabase.from('restaurants').insert({
      name:   form.name.trim(),
      email:  form.email.trim() || null,
      phone:  form.phone.trim() || null,
      plan:   form.plan,
      status: 'active',
      settings,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0d1526]/95 backdrop-blur-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}>

        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Add New Restaurant</h2>
            <p className="text-sm text-white/40 mt-1">Create a new restaurant account</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-white/50 mb-1.5">{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all" />
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Password *</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters" value={form.password}
                onChange={e => set('password', e.target.value)}
                className="w-full px-4 py-2.5 pr-11 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all" />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Subscription Plan</label>
            {plans.length === 0 ? (
              <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
                No plans available — create plans first at /seller/plans
              </p>
            ) : (
              <select value={form.plan} onChange={e => set('plan', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none">
                {plans.map(p => (
                  <option key={p.slug} value={p.slug} className="bg-[#0d1526]">
                    {p.name} — ${p.price}/{p.billing_period === 'monthly' ? 'mo' : 'yr'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {saveError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{saveError}</p>
          )}
        </div>

        <div className="p-6 border-t border-white/10 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
            {saving ? 'Creating…' : 'Create Restaurant'}
          </button>
        </div>
      </div>
    </div>
  )
}
