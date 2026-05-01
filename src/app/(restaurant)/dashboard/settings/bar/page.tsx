'use client'
import { Wine, Coffee, Tag, Layers, Clock, ShieldCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { SaveButton } from '@/components/ui/SaveButton'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { SettingsSection } from '@/components/ui/SettingsSection'

interface BarSettings {
  bar_enabled:            boolean
  age_verification:       boolean
  happy_hour_enabled:     boolean
  happy_hour_start:       string
  happy_hour_end:         string
  happy_hour_discount:    number
  tab_auto_close_enabled: boolean
  tab_auto_close_minutes: number
  bar_note:               string
}

const DEFAULTS: BarSettings = {
  bar_enabled:            true,
  age_verification:       false,
  happy_hour_enabled:     false,
  happy_hour_start:       '17:00',
  happy_hour_end:         '19:00',
  happy_hour_discount:    20,
  tab_auto_close_enabled: false,
  tab_auto_close_minutes: 120,
  bar_note:               '',
}

const TOGGLE = 'bg-violet-500'

export default function CoffeeBarPage() {
  const { t } = useLanguage()
  const { settings: cfg, setSettings: setCfg, loading, saveState, save, autoSave } =
    useRestaurantSettings<BarSettings>(DEFAULTS)

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
        <SaveButton state={saveState} onClick={save} />
      </div>

      {/* ── General ── */}
      <SettingsSection title={t.bar_general} icon={<Wine className="w-4 h-4 text-violet-400" />}>
        <div className="space-y-5">

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
            <ToggleSwitch activeColor={TOGGLE} on={cfg.bar_enabled} onChange={v => autoSave({ bar_enabled: v })} />
          </div>

          <div className="border-t border-white/6" />

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
            <ToggleSwitch activeColor={TOGGLE} on={cfg.age_verification} onChange={v => autoSave({ age_verification: v })} />
          </div>

        </div>
      </SettingsSection>

      {/* ── Happy Hour ── */}
      <SettingsSection title={t.bar_happy_hour} icon={<Tag className="w-4 h-4 text-violet-400" />}>
        <div className="space-y-5">

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
            <ToggleSwitch activeColor={TOGGLE} on={cfg.happy_hour_enabled} onChange={v => autoSave({ happy_hour_enabled: v })} />
          </div>

          {cfg.happy_hour_enabled && (
            <>
              <div className="border-t border-white/6" />

              <div className="grid grid-cols-2 gap-4">
                {(['happy_hour_start', 'happy_hour_end'] as const).map((key, i) => (
                  <div key={key} className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                      <Clock className="w-3.5 h-3.5" />
                      {i === 0 ? t.bar_start_time : t.bar_end_time}
                    </label>
                    <input
                      type="time"
                      value={cfg[key]}
                      onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
                      className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-violet-500/50 outline-none transition-all"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  {t.bar_discount_pct}
                </label>
                <input
                  type="number" min={1} max={100}
                  value={cfg.happy_hour_discount}
                  onChange={e => setCfg(c => ({ ...c, happy_hour_discount: Number(e.target.value) }))}
                  className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-violet-500/50 outline-none transition-all"
                />
                <p className="text-[11px] text-white/30">{t.bar_discount_hint}</p>
              </div>
            </>
          )}

        </div>
      </SettingsSection>

      {/* ── Tab Auto-close ── */}
      <SettingsSection title={t.bar_tab} icon={<Layers className="w-4 h-4 text-violet-400" />}>
        <div className="space-y-5">

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
            <ToggleSwitch activeColor={TOGGLE} on={cfg.tab_auto_close_enabled} onChange={v => autoSave({ tab_auto_close_enabled: v })} />
          </div>

          {cfg.tab_auto_close_enabled && (
            <>
              <div className="border-t border-white/6" />
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" /> {t.bar_auto_close_after}
                </label>
                <input
                  type="number" min={15} max={480}
                  value={cfg.tab_auto_close_minutes}
                  onChange={e => setCfg(c => ({ ...c, tab_auto_close_minutes: Number(e.target.value) }))}
                  className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-violet-500/50 outline-none transition-all"
                />
                <p className="text-[11px] text-white/30">{t.bar_auto_close_hint}</p>
              </div>
            </>
          )}

        </div>
      </SettingsSection>

      {/* ── Bar Note ── */}
      <SettingsSection title={t.bar_staff_note} icon={<Coffee className="w-4 h-4 text-violet-400" />}>
        <div className="space-y-1.5">
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
      </SettingsSection>

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
