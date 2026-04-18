'use client'
import { useState, useEffect } from 'react'
import {
  Coffee, Save, Loader2, AlertCircle,
  ToggleLeft, ToggleRight, QrCode, BellRing,
  Users, Utensils, Clock, ShieldCheck, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useDineInSettings, type CachedDineInSettings } from '@/hooks/useDineInSettings'

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors focus:outline-none',
        on ? 'bg-amber-500' : 'bg-white/15',
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
        on ? 'translate-x-5' : 'translate-x-0',
      )} />
    </button>
  )
}

type DineInSettings = CachedDineInSettings

const DEFAULTS: DineInSettings = {
  enable_qr_ordering:     true,
  show_call_waiter:       true,
  auto_accept_qr_orders:  false,
  require_guest_count:    true,
  table_turnover_minutes: 90,
  dine_in_note:           '',
}

export default function DineInPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [mounted, setMounted]           = useState(false)

  useEffect(() => {
    setRestaurantId(localStorage.getItem('restaurant_id'))
    setMounted(true)
  }, [])

  const { data: swrData, isLoading: swrLoading, mutate } = useDineInSettings(restaurantId)
  const loading = !mounted || swrLoading

  const [cfg, setCfg]     = useState<DineInSettings>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => { if (swrData) setCfg(swrData) }, [swrData])

  const autoSaveToggle = async (key: keyof DineInSettings, value: boolean) => {
    const updated = { ...(swrData ?? cfg), [key]: value } as DineInSettings
    setCfg(updated)
    mutate(updated, false)
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
        enable_qr_ordering:     cfg.enable_qr_ordering,
        show_call_waiter:       cfg.show_call_waiter,
        auto_accept_qr_orders:  cfg.auto_accept_qr_orders,
        require_guest_count:    cfg.require_guest_count,
        table_turnover_minutes: cfg.table_turnover_minutes,
        dine_in_note:           cfg.dine_in_note,
      },
    }).eq('id', restaurantId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    mutate(cfg, false)
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
            <Coffee className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{t.di_title}</h1>
            <p className="text-xs text-white/40">{t.di_subtitle}</p>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-60',
            saved
              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25',
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

      {/* ── QR Menu ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
          <QrCode className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.di_qr_section}</span>
        </div>
        <div className="p-5 space-y-5">

          {/* Enable QR Ordering */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.enable_qr_ordering ? 'bg-amber-500/20' : 'bg-white/5')}>
                {cfg.enable_qr_ordering
                  ? <ToggleRight className="w-5 h-5 text-amber-400" />
                  : <ToggleLeft  className="w-5 h-5 text-white/30" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.di_qr_ordering}</p>
                <p className="text-xs text-white/40">{t.di_qr_ordering_desc}</p>
              </div>
            </div>
            <Toggle on={cfg.enable_qr_ordering} onChange={v => autoSaveToggle('enable_qr_ordering', v)} />
          </div>

          <div className="border-t border-white/6" />

          {/* Show Call Waiter */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.show_call_waiter ? 'bg-amber-500/20' : 'bg-white/5')}>
                {cfg.show_call_waiter
                  ? <BellRing className="w-5 h-5 text-amber-400" />
                  : <BellRing className="w-5 h-5 text-white/30" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.di_call_waiter}</p>
                <p className="text-xs text-white/40">{t.di_call_waiter_desc}</p>
              </div>
            </div>
            <Toggle on={cfg.show_call_waiter} onChange={v => autoSaveToggle('show_call_waiter', v)} />
          </div>

          <div className="border-t border-white/6" />

          {/* Auto-accept QR orders */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.auto_accept_qr_orders ? 'bg-amber-500/20' : 'bg-white/5')}>
                <ShieldCheck className={cn('w-5 h-5', cfg.auto_accept_qr_orders ? 'text-amber-400' : 'text-white/30')} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.di_auto_accept}</p>
                <p className="text-xs text-white/40">{t.di_auto_accept_desc}</p>
              </div>
            </div>
            <Toggle on={cfg.auto_accept_qr_orders} onChange={v => autoSaveToggle('auto_accept_qr_orders', v)} />
          </div>

        </div>
      </div>

      {/* ── Table Service ────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
          <Utensils className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.di_table_service}</span>
        </div>
        <div className="p-5 space-y-5">

          {/* Require guest count */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.require_guest_count ? 'bg-amber-500/20' : 'bg-white/5')}>
                <Users className={cn('w-5 h-5', cfg.require_guest_count ? 'text-amber-400' : 'text-white/30')} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.di_require_guests}</p>
                <p className="text-xs text-white/40">{t.di_require_guests_d}</p>
              </div>
            </div>
            <Toggle on={cfg.require_guest_count} onChange={v => autoSaveToggle('require_guest_count', v)} />
          </div>

          <div className="border-t border-white/6" />

          {/* Table turnover time */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              {t.di_turnover}
            </label>
            <input
              type="number"
              min={15}
              max={360}
              value={cfg.table_turnover_minutes}
              onChange={e => setCfg(c => ({ ...c, table_turnover_minutes: Number(e.target.value) }))}
              className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-amber-500/50 outline-none transition-all"
            />
            <p className="text-[11px] text-white/30">{t.di_turnover_hint}</p>
          </div>

        </div>
      </div>

      {/* ── Guest Note ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.di_guest_msg}</span>
        </div>
        <div className="p-5 space-y-1.5">
          <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            {t.di_note_label}
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Welcome! Please scan to order. Our staff are happy to help."
            value={cfg.dine_in_note}
            onChange={e => setCfg(c => ({ ...c, dine_in_note: e.target.value }))}
            className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-amber-500/50 outline-none transition-all resize-none placeholder:text-white/20"
          />
          <p className="text-[11px] text-white/30">{t.di_note_hint}</p>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-white/6 bg-white/2 p-5 flex items-start gap-3">
        <Coffee className="w-5 h-5 text-white/25 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white/50">{t.di_how_works}</p>
          <p className="text-xs text-white/30 leading-relaxed">{t.di_how_works_desc}</p>
        </div>
      </div>

    </div>
  )
}
