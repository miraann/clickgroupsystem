'use client'
import { useState } from 'react'
import { X, Package, Layers, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { MODULES, MODULE_CATEGORIES } from '@/lib/modules'

export interface Plan {
  id: string
  name: string
  slug: string
  price: number
  billing_period: string
  description: string | null
  color: string
  modules: Record<string, boolean>
  is_active: boolean
  sort_order: number
  created_at: string
}

export const PLAN_COLORS = [
  { value: 'slate',   dot: 'bg-slate-400'   },
  { value: 'indigo',  dot: 'bg-indigo-400'  },
  { value: 'violet',  dot: 'bg-violet-400'  },
  { value: 'emerald', dot: 'bg-emerald-400' },
  { value: 'amber',   dot: 'bg-amber-400'   },
  { value: 'rose',    dot: 'bg-rose-400'    },
  { value: 'cyan',    dot: 'bg-cyan-400'    },
]

function initModules(existing?: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const m of MODULES) out[m.key] = existing ? (existing[m.key] !== false) : true
  return out
}

function toSlug(v: string) {
  return v.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

interface Props {
  plan?: Plan | null
  onClose: () => void
  onSaved: () => void
}

export function PlanModal({ plan, onClose, onSaved }: Props) {
  const supabase = createClient()
  const isEdit = !!plan

  const [tab,     setTab]     = useState<'details' | 'modules'>('details')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [modules, setModules] = useState<Record<string, boolean>>(initModules(plan?.modules))

  const [form, setForm] = useState({
    name:           plan?.name           ?? '',
    slug:           plan?.slug           ?? '',
    price:          plan?.price?.toString() ?? '0',
    billing_period: plan?.billing_period ?? 'monthly',
    description:    plan?.description   ?? '',
    color:          plan?.color          ?? 'indigo',
    is_active:      plan?.is_active      ?? true,
    sort_order:     plan?.sort_order?.toString() ?? '0',
  })

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  const handleNameChange = (v: string) => {
    set('name', v)
    if (!isEdit) set('slug', toSlug(v))
  }

  const isOn = (key: string) => modules[key] !== false
  const toggleModule = (key: string) => setModules(p => ({ ...p, [key]: !isOn(key) }))

  const enabledCount = MODULES.filter(m => isOn(m.key)).length

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Plan name is required.'); return }
    if (!form.slug.trim()) { setError('Slug is required.'); return }
    setSaving(true); setError(null)

    const payload = {
      name:           form.name.trim(),
      slug:           form.slug.trim(),
      price:          parseFloat(form.price) || 0,
      billing_period: form.billing_period,
      description:    form.description.trim() || null,
      color:          form.color,
      modules,
      is_active:      form.is_active,
      sort_order:     parseInt(form.sort_order) || 0,
    }

    const { error: err } = isEdit
      ? await supabase.from('plans').update(payload).eq('id', plan!.id)
      : await supabase.from('plans').insert(payload)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0d1526]/95 backdrop-blur-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Plan' : 'New Plan'}</h2>
            <p className="text-sm text-white/40 mt-0.5">{isEdit ? plan.name : 'Create a subscription plan'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 shrink-0 flex gap-1">
          {([
            ['details', 'Details',                              Package],
            ['modules', `Module Access (${enabledCount}/${MODULES.length})`, Layers],
          ] as const).map(([t, label, Icon]) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/5')}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === 'details' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Plan Name *</label>
                <input
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="e.g. Professional"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  Slug <span className="text-white/25">(unique identifier used in code)</span>
                </label>
                <input
                  value={form.slug}
                  onChange={e => set('slug', toSlug(e.target.value))}
                  placeholder="e.g. professional"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Price ($)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.price}
                    onChange={e => set('price', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Billing Period</label>
                  <select
                    value={form.billing_period}
                    onChange={e => set('billing_period', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none"
                  >
                    <option value="monthly" className="bg-[#0d1526]">Monthly</option>
                    <option value="yearly"  className="bg-[#0d1526]">Yearly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={2}
                  placeholder="Brief description shown to restaurant owners…"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2">Color</label>
                <div className="flex gap-2.5">
                  {PLAN_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => set('color', c.value)}
                      title={c.value}
                      className={cn(
                        'w-7 h-7 rounded-full transition-all',
                        c.dot,
                        form.color === c.value
                          ? 'ring-2 ring-offset-2 ring-offset-[#0d1526] ring-white/60 scale-110'
                          : 'opacity-40 hover:opacity-70',
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Sort Order</label>
                  <input
                    type="number" min="0"
                    value={form.sort_order}
                    onChange={e => set('sort_order', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Status</label>
                  <button
                    onClick={() => set('is_active', !form.is_active)}
                    className={cn(
                      'w-full px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
                      form.is_active
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-white/5 border-white/10 text-white/40',
                    )}
                  >
                    {form.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/40">Toggle which features are included in this plan.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setModules(Object.fromEntries(MODULES.map(m => [m.key, true])))}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    All on
                  </button>
                  <span className="text-white/20">·</span>
                  <button
                    onClick={() => setModules(Object.fromEntries(MODULES.map(m => [m.key, false])))}
                    className="text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    All off
                  </button>
                </div>
              </div>
              {MODULE_CATEGORIES.map(cat => {
                const catMods = MODULES.filter(m => m.category === cat)
                return (
                  <div key={cat}>
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">{cat}</p>
                    <div className="space-y-1">
                      {catMods.map(mod => (
                        <div key={mod.key}
                          className={cn(
                            'flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
                            isOn(mod.key) ? 'bg-white/4 border-white/8' : 'bg-white/2 border-white/5 opacity-60',
                          )}>
                          <div className="min-w-0 mr-3">
                            <p className="text-sm font-medium text-white">{mod.label}</p>
                            <p className="text-xs text-white/35 mt-0.5">{mod.description}</p>
                          </div>
                          <ToggleSwitch on={isOn(mod.key)} onChange={() => toggleModule(mod.key)} activeColor="bg-indigo-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
