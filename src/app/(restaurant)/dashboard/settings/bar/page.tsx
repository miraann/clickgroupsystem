'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Wine, Save, Loader2, AlertCircle,
  Clock, ShieldCheck, Coffee, Tag, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors focus:outline-none',
        on ? 'bg-violet-500' : 'bg-white/15',
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
        on ? 'translate-x-5' : 'translate-x-0',
      )} />
    </button>
  )
}

interface BarSettings {
  bar_enabled:             boolean
  age_verification:        boolean
  happy_hour_enabled:      boolean
  happy_hour_start:        string
  happy_hour_end:          string
  happy_hour_discount:     number
  tab_auto_close_enabled:  boolean
  tab_auto_close_minutes:  number
  bar_note:                string
}

const DEFAULTS: BarSettings = {
  bar_enabled:             true,
  age_verification:        false,
  happy_hour_enabled:      false,
  happy_hour_start:        '17:00',
  happy_hour_end:          '19:00',
  happy_hour_discount:     20,
  tab_auto_close_enabled:  false,
  tab_auto_close_minutes:  120,
  bar_note:                '',
}

export default function CoffeeBarPage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [cfg, setCfg]       = useState<BarSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: rest } = await supabase
      .from('restaurants')
      .select('id, settings')
      .eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '')
      .maybeSingle()
    if (!rest) { setLoading(false); return }
    setRestaurantId(rest.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (rest.settings ?? {}) as any
    setCfg({
      bar_enabled:             s.bar_enabled             ?? true,
      age_verification:        s.age_verification        ?? false,
      happy_hour_enabled:      s.happy_hour_enabled      ?? false,
      happy_hour_start:        s.happy_hour_start        ?? '17:00',
      happy_hour_end:          s.happy_hour_end          ?? '19:00',
      happy_hour_discount:     Number(s.happy_hour_discount ?? 20),
      tab_auto_close_enabled:  s.tab_auto_close_enabled  ?? false,
      tab_auto_close_minutes:  Number(s.tab_auto_close_minutes ?? 120),
      bar_note:                s.bar_note                ?? '',
    })
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const autoSaveToggle = async (key: keyof BarSettings, value: boolean) => {
    setCfg(c => ({ ...c, [key]: value }))
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
        bar_enabled:             cfg.bar_enabled,
        age_verification:        cfg.age_verification,
        happy_hour_enabled:      cfg.happy_hour_enabled,
        happy_hour_start:        cfg.happy_hour_start,
        happy_hour_end:          cfg.happy_hour_end,
        happy_hour_discount:     cfg.happy_hour_discount,
        tab_auto_close_enabled:  cfg.tab_auto_close_enabled,
        tab_auto_close_minutes:  cfg.tab_auto_close_minutes,
        bar_note:                cfg.bar_note,
      },
    }).eq('id', restaurantId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-500/20 flex items-center justify-center">
            <Coffee className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{t.bar_title}</h1>
            <p className="text-xs text-white/40">{t.bar_subtitle}</p>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-60',
            saved
              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
              : 'bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-500/25',
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? t.saved_ : t.save_changes}
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{err}
        </div>
      )}

      {/* ── General ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
          <Wine className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.bar_general}</span>
        </div>
        <div className="p-5 space-y-5">

          {/* Bar enabled */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.bar_enabled ? 'bg-violet-500/20' : 'bg-white/5')}>
                <Wine className={cn('w-5 h-5', cfg.bar_enabled ? 'text-violet-400' : 'text-white/30')} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.bar_enabled_label}</p>
                <p className="text-xs text-white/40">{t.bar_enabled_desc}</p>
              </div>
            </div>
            <Toggle on={cfg.bar_enabled} onChange={v => autoSaveToggle('bar_enabled', v)} />
          </div>

          <div className="border-t border-white/6" />

          {/* Age verification */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.age_verification ? 'bg-violet-500/20' : 'bg-white/5')}>
                <ShieldCheck className={cn('w-5 h-5', cfg.age_verification ? 'text-violet-400' : 'text-white/30')} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.bar_age_verify}</p>
                <p className="text-xs text-white/40">{t.bar_age_verify_desc}</p>
              </div>
            </div>
            <Toggle on={cfg.age_verification} onChange={v => autoSaveToggle('age_verification', v)} />
          </div>

        </div>
      </div>

      {/* ── Happy Hour ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
          <Tag className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.bar_happy_hour}</span>
        </div>
        <div className="p-5 space-y-5">

          {/* Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.happy_hour_enabled ? 'bg-violet-500/20' : 'bg-white/5')}>
                <Tag className={cn('w-5 h-5', cfg.happy_hour_enabled ? 'text-violet-400' : 'text-white/30')} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.bar_happy_enabled}</p>
                <p className="text-xs text-white/40">{t.bar_happy_desc}</p>
              </div>
            </div>
            <Toggle on={cfg.happy_hour_enabled} onChange={v => autoSaveToggle('happy_hour_enabled', v)} />
          </div>

          {cfg.happy_hour_enabled && (
            <>
              <div className="border-t border-white/6" />

              {/* Start / End */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5" /> {t.bar_start_time}
                  </label>
                  <input
                    type="time"
                    value={cfg.happy_hour_start}
                    onChange={e => setCfg(c => ({ ...c, happy_hour_start: e.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-violet-500/50 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5" /> {t.bar_end_time}
                  </label>
                  <input
                    type="time"
                    value={cfg.happy_hour_end}
                    onChange={e => setCfg(c => ({ ...c, happy_hour_end: e.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-violet-500/50 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Discount % */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  {t.bar_discount_pct}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={cfg.happy_hour_discount}
                  onChange={e => setCfg(c => ({ ...c, happy_hour_discount: Number(e.target.value) }))}
                  className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-violet-500/50 outline-none transition-all"
                />
                <p className="text-[11px] text-white/30">{t.bar_discount_hint}</p>
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── Tab Auto-close ───────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
          <Layers className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.bar_tab}</span>
        </div>
        <div className="p-5 space-y-5">

          {/* Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.tab_auto_close_enabled ? 'bg-violet-500/20' : 'bg-white/5')}>
                <Clock className={cn('w-5 h-5', cfg.tab_auto_close_enabled ? 'text-violet-400' : 'text-white/30')} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.bar_auto_close}</p>
                <p className="text-xs text-white/40">{t.bar_auto_close_desc}</p>
              </div>
            </div>
            <Toggle on={cfg.tab_auto_close_enabled} onChange={v => autoSaveToggle('tab_auto_close_enabled', v)} />
          </div>

          {cfg.tab_auto_close_enabled && (
            <>
              <div className="border-t border-white/6" />
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" /> {t.bar_auto_close_after}
                </label>
                <input
                  type="number"
                  min={15}
                  max={480}
                  value={cfg.tab_auto_close_minutes}
                  onChange={e => setCfg(c => ({ ...c, tab_auto_close_minutes: Number(e.target.value) }))}
                  className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-violet-500/50 outline-none transition-all"
                />
                <p className="text-[11px] text-white/30">{t.bar_auto_close_hint}</p>
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── Bar Note ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
          <Coffee className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.bar_staff_note}</span>
        </div>
        <div className="p-5 space-y-1.5">
          <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            {t.bar_note_label}
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Last call at 11:30 PM. Always check ID for spirits."
            value={cfg.bar_note}
            onChange={e => setCfg(c => ({ ...c, bar_note: e.target.value }))}
            className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-violet-500/50 outline-none transition-all resize-none placeholder:text-white/20"
          />
          <p className="text-[11px] text-white/30">{t.bar_note_hint}</p>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-white/6 bg-white/2 p-5 flex items-start gap-3">
        <Wine className="w-5 h-5 text-white/25 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white/50">{t.bar_how_works}</p>
          <p className="text-xs text-white/30 leading-relaxed">{t.bar_how_works_desc}</p>
        </div>
      </div>

    </div>
  )
}
