'use client'
import { useState, useEffect, useCallback } from 'react'
import { Hash, Save, CheckCircle2, Loader2, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

type ResetPeriod = 'never' | 'daily' | 'shift'

interface Settings {
  prefix: string
  start_num: number
  current_num: number
  reset_period: ResetPeriod
  show_receipt: boolean
  show_kds: boolean
}

const DEFAULTS: Settings = { prefix: 'ORD-', start_num: 1, current_num: 1, reset_period: 'daily', show_receipt: true, show_kds: true }

function FadeSwitch({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export default function OrderNumberPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [settings, setSettings]         = useState<Settings>(DEFAULTS)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    const { data, error: err } = await supabase
      .from('order_number_settings')
      .select('*')
      .eq('restaurant_id', rest.id)
      .maybeSingle()

    if (err) { setError(err.message); setLoading(false); return }
    if (data) {
      setSettings({
        prefix:       data.prefix,
        start_num:    data.start_num,
        current_num:  data.current_num,
        reset_period: data.reset_period as ResetPeriod,
        show_receipt: data.show_receipt,
        show_kds:     data.show_kds,
      })
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!restaurantId) return
    setSaving(true)
    const payload = { ...settings, updated_at: new Date().toISOString() }
    const { error } = await supabase
      .from('order_number_settings')
      .upsert({ restaurant_id: restaurantId, ...payload }, { onConflict: 'restaurant_id' })
    if (error) { setError(error.message) }
    else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  const preview = `${settings.prefix}${String(settings.start_num).padStart(3, '0')}`

  // ── Render ─────────────────────────────────────────────────
  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Run <code className="text-amber-400">supabase-menu-schema.sql</code> first.</p>
        <button onClick={load} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Hash className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">{t.on_title}</h1>
            <p className="text-xs text-white/40">{t.on_subtitle}</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl active:scale-95 transition-all',
            saved ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-amber-500 hover:bg-amber-600 text-white')}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? t.save_changes : saved ? t.saved_ : t.save_changes}
        </button>
      </div>

      {/* FadeSwitch: skeleton ↔ real content */}
      <FadeSwitch id={loading ? 'skel' : 'data'}>
        {loading ? (
          <SkeletonList rows={4} />
        ) : (
      <div>
      {/* Preview */}
      <div className="p-5 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 rounded-2xl mb-6 text-center">
        <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">{t.on_preview}</p>
        <p className="text-4xl font-bold text-white font-mono tracking-wide">{preview}</p>
        <p className="text-xs text-white/25 mt-2">{t.on_current}</p>
      </div>

      <div className="space-y-5 bg-white/5 border border-white/10 rounded-2xl p-5">
        <div>
          <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.on_prefix}</label>
          <input value={settings.prefix} onChange={e => setSettings(s => ({ ...s, prefix: e.target.value }))} placeholder="ORD-"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors font-mono" />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.on_start}</label>
          <input type="number" min="1" value={settings.start_num} onChange={e => setSettings(s => ({ ...s, start_num: parseInt(e.target.value) || 1 }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors font-mono" />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-2 font-medium">{t.on_reset_daily}</label>
          <div className="grid grid-cols-3 gap-2">
            {(['never', 'daily', 'shift'] as ResetPeriod[]).map(r => (
              <button key={r} onClick={() => setSettings(s => ({ ...s, reset_period: r }))}
                className={cn('py-2 rounded-xl text-xs font-medium capitalize transition-all active:scale-95',
                  settings.reset_period === r ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-white/40 border border-white/8 hover:bg-white/8')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {([
          { k: 'show_receipt' as const, label: 'Show on Receipt' },
          { k: 'show_kds'     as const, label: 'Show on Kitchen Display (KDS)' },
        ]).map(({ k, label }) => (
          <div key={k} className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
            <span className="text-sm text-white/70">{label}</span>
            <button onClick={() => setSettings(s => ({ ...s, [k]: !s[k] }))} className="active:scale-95">
              {settings[k] ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
            </button>
          </div>
        ))}
      </div>
      </div>
        )}
      </FadeSwitch>
    </div>
  )
}
