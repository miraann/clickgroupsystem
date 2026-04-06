'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  ShoppingBag, Save, Loader2, AlertCircle, ToggleLeft, ToggleRight, Clock, Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface Toggle { on: boolean; onChange: (v: boolean) => void }
function Toggle({ on, onChange }: Toggle) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors focus:outline-none',
        on ? 'bg-indigo-500' : 'bg-white/15',
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
        on ? 'translate-x-5' : 'translate-x-0',
      )} />
    </button>
  )
}

interface TakeoutSettings {
  takeout_enabled: boolean
  show_takeout_button: boolean
  estimated_prep_time: number
}

const DEFAULTS: TakeoutSettings = {
  takeout_enabled: true,
  show_takeout_button: true,
  estimated_prep_time: 15,
}

export default function TakeoutSettingsPage() {
  const supabase = createClient()
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [settings, setSettings] = useState<TakeoutSettings>(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)
  const [saved, setSaved]       = useState(false)

  const load = useCallback(async () => {
    const { data: rest } = await supabase.from('restaurants').select('id, settings').limit(1).maybeSingle()
    if (!rest) { setLoading(false); return }
    setRestaurantId(rest.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = ((rest.settings ?? {}) as any)
    setSettings({
      takeout_enabled:     s.takeout_enabled     ?? true,
      show_takeout_button: s.show_takeout_button ?? true,
      estimated_prep_time: Number(s.estimated_prep_time ?? 15),
    })
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const autoSaveToggle = async (key: keyof TakeoutSettings, value: boolean) => {
    setSettings(s => ({ ...s, [key]: value }))
    if (!restaurantId) return
    const { data: rest } = await supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (rest?.settings ?? {}) as any
    await supabase.from('restaurants').update({ settings: { ...existing, [key]: value } }).eq('id', restaurantId)
  }

  const save = async () => {
    if (!restaurantId) return
    setSaving(true); setErr(null); setSaved(false)
    const { data: rest } = await supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (rest?.settings ?? {}) as any
    const { error } = await supabase.from('restaurants').update({
      settings: {
        ...existing,
        takeout_enabled:     settings.takeout_enabled,
        show_takeout_button: settings.show_takeout_button,
        estimated_prep_time: settings.estimated_prep_time,
      },
    }).eq('id', restaurantId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Takeout</h1>
            <p className="text-xs text-white/40">Manage takeout / pickup orders</p>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-60',
            saved
              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
              : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/25',
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{err}
        </div>
      )}

      {/* Toggles */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4">

        {/* Accept takeout orders */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', settings.takeout_enabled ? 'bg-amber-500/20' : 'bg-white/5')}>
              {settings.takeout_enabled
                ? <ToggleRight className="w-5 h-5 text-amber-400" />
                : <ToggleLeft  className="w-5 h-5 text-white/30" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Takeout Orders</p>
              <p className="text-xs text-white/40">Allow staff to create takeout orders</p>
            </div>
          </div>
          <Toggle on={settings.takeout_enabled} onChange={v => autoSaveToggle('takeout_enabled', v)} />
        </div>

        <div className="border-t border-white/6" />

        {/* Show Takeout button on dashboard */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', settings.show_takeout_button ? 'bg-amber-500/20' : 'bg-white/5')}>
              {settings.show_takeout_button
                ? <ToggleRight className="w-5 h-5 text-amber-400" />
                : <ToggleLeft  className="w-5 h-5 text-white/30" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Takeout Button on Dashboard</p>
              <p className="text-xs text-white/40">Show the Takeout button in the bottom action bar</p>
            </div>
          </div>
          <Toggle on={settings.show_takeout_button} onChange={v => autoSaveToggle('show_takeout_button', v)} />
        </div>
      </div>

      {/* General settings */}
      <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-5">
        <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider">General Settings</h2>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            Estimated Prep Time (min)
          </label>
          <input
            type="number"
            min={1}
            value={settings.estimated_prep_time}
            onChange={e => setSettings(s => ({ ...s, estimated_prep_time: Number(e.target.value) }))}
            className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-indigo-500/50 outline-none transition-all"
          />
          <p className="text-[11px] text-white/30">Shown to staff when creating a takeout order</p>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-2xl border border-white/6 bg-white/2 p-5 flex items-start gap-3">
        <Package className="w-5 h-5 text-white/25 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white/50">How Takeout Works</p>
          <p className="text-xs text-white/30 leading-relaxed">
            Staff creates a takeout order from the dashboard, adds items, and processes payment. The order is tracked separately from dine-in tables and appears in the Takeout Orders list.
          </p>
        </div>
      </div>

    </div>
  )
}
