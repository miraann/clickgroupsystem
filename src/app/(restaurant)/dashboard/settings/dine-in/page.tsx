'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Coffee, Loader2, QrCode, BellRing,
  Users, Utensils, Clock, ShieldCheck, Info, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useDineInSettings, type CachedDineInSettings } from '@/hooks/useDineInSettings'
import { SaveButton } from '@/components/ui/SaveButton'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { SettingsSection } from '@/components/ui/SettingsSection'
import type { SaveState } from '@/hooks/useRestaurantSettings'

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

  const [cfg, setCfg]             = useState<DineInSettings>(DEFAULTS)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  useEffect(() => { if (swrData) setCfg(swrData) }, [swrData])

  // Optimistic toggle — updates SWR cache + writes to DB in background
  const autoSaveToggle = useCallback(async (key: keyof DineInSettings, value: boolean) => {
    const updated = { ...(swrData ?? cfg), [key]: value } as DineInSettings
    setCfg(updated)
    mutate(updated, false)
    if (!restaurantId) return
    const { data: rest } = await supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (rest?.settings ?? {}) as any
    await supabase.from('restaurants').update({ settings: { ...existing, [key]: value } }).eq('id', restaurantId)
  }, [restaurantId, supabase, swrData, cfg, mutate])

  const save = useCallback(async () => {
    if (!restaurantId) return
    setSaveState('saving')
    const { data: rest } = await supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (rest?.settings ?? {}) as any
    const { error } = await supabase.from('restaurants').update({
      settings: { ...existing, ...cfg },
    }).eq('id', restaurantId)
    if (error) {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    } else {
      mutate(cfg, false)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    }
  }, [restaurantId, supabase, cfg, mutate])

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
        <SaveButton state={saveState} onClick={save} />
      </div>

      {/* ── QR Menu ── */}
      <SettingsSection title={t.di_qr_section} icon={<QrCode className="w-4 h-4 text-amber-400" />}>
        <div className="space-y-5">

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
            <ToggleSwitch on={cfg.enable_qr_ordering} onChange={v => autoSaveToggle('enable_qr_ordering', v)} />
          </div>

          <div className="border-t border-white/6" />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.show_call_waiter ? 'bg-amber-500/20' : 'bg-white/5')}>
                <BellRing className={cn('w-5 h-5', cfg.show_call_waiter ? 'text-amber-400' : 'text-white/30')} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t.di_call_waiter}</p>
                <p className="text-xs text-white/40">{t.di_call_waiter_desc}</p>
              </div>
            </div>
            <ToggleSwitch on={cfg.show_call_waiter} onChange={v => autoSaveToggle('show_call_waiter', v)} />
          </div>

          <div className="border-t border-white/6" />

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
            <ToggleSwitch on={cfg.auto_accept_qr_orders} onChange={v => autoSaveToggle('auto_accept_qr_orders', v)} />
          </div>

        </div>
      </SettingsSection>

      {/* ── Table Service ── */}
      <SettingsSection title={t.di_table_service} icon={<Utensils className="w-4 h-4 text-amber-400" />}>
        <div className="space-y-5">

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
            <ToggleSwitch on={cfg.require_guest_count} onChange={v => autoSaveToggle('require_guest_count', v)} />
          </div>

          <div className="border-t border-white/6" />

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              {t.di_turnover}
            </label>
            <input
              type="number" min={15} max={360}
              value={cfg.table_turnover_minutes}
              onChange={e => setCfg(c => ({ ...c, table_turnover_minutes: Number(e.target.value) }))}
              className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-amber-500/50 outline-none transition-all"
            />
            <p className="text-[11px] text-white/30">{t.di_turnover_hint}</p>
          </div>

        </div>
      </SettingsSection>

      {/* ── Guest Note ── */}
      <SettingsSection title={t.di_guest_msg} icon={<Info className="w-4 h-4 text-amber-400" />}>
        <div className="space-y-1.5">
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
      </SettingsSection>

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
