'use client'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  SlidersHorizontal,
  Volume2, VolumeX, Clock, Globe, Percent, BadgeDollarSign, Printer, Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { SaveButton } from '@/components/ui/SaveButton'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { SettingsSection } from '@/components/ui/SettingsSection'

interface PrefSettings {
  language:               string
  date_format:            '12h' | '24h'
  sounds_enabled:         boolean
  alert_repeat_seconds:   number
  default_tax_rate:       number
  tip_enabled:            boolean
  tip_percentages:        number[]
  auto_print_receipt:     boolean
}

const DEFAULTS: PrefSettings = {
  language:             'en',
  date_format:          '12h',
  sounds_enabled:       true,
  alert_repeat_seconds: 30,
  default_tax_rate:     0,
  tip_enabled:          false,
  tip_percentages:      [10, 15, 20],
  auto_print_receipt:   false,
}

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ku', label: 'Kurdish', flag: '🏳️'  },
  { code: 'ar', label: 'Arabic',  flag: '🇸🇦'  },
]

const TIP_OPTIONS  = [5, 10, 15, 20, 25]
const ACCENT       = 'bg-indigo-500'

// ── Animation variants ───────────────────────────────────────
const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'circOut' as const } },
}
const FIELDS: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.28 } },
}
const FIELD_ITEM: Variants = {
  hidden: { opacity: 0, y: -10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'circOut' as const } },
}

// ── Skeleton helpers ─────────────────────────────────────────
function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-white/8', className)} />
}
function SkelSection({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/8 bg-white/3">
        <Skel className="h-3.5 w-36 rounded-md" />
      </div>
      <div className="p-5 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skel key={i} className={cn('h-11 rounded-xl', i === 1 ? 'w-3/4' : 'w-full')} />
        ))}
      </div>
    </div>
  )
}
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

export default function PreferencePage() {
  const { t, setLang } = useLanguage()
  const { settings: cfg, setSettings: setCfg, loading, saveState, save, autoSave } =
    useRestaurantSettings<PrefSettings>(DEFAULTS)

  const toggleTipPercent = (pct: number) => {
    setCfg(c => ({
      ...c,
      tip_percentages: c.tip_percentages.includes(pct)
        ? c.tip_percentages.filter(p => p !== pct)
        : [...c.tip_percentages, pct].sort((a, b) => a - b),
    }))
  }

  return (
    <motion.div className="space-y-6" variants={PAGE} initial="hidden" animate="show">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{t.pref_title}</h1>
            <p className="text-xs text-white/40">{t.pref_subtitle}</p>
          </div>
        </div>
        <FadeSwitch id={loading ? 'skel-btn' : 'real-btn'}>
          {loading
            ? <Skel className="h-10 w-32 rounded-xl" />
            : <SaveButton state={saveState} onClick={save} />}
        </FadeSwitch>
      </div>

      {/* Sections */}
      <FadeSwitch id={loading ? 'skel-sections' : 'real-sections'}>
        {loading ? (
          <div className="space-y-6">
            <SkelSection lines={2} />
            <SkelSection lines={2} />
            <SkelSection lines={1} />
            <SkelSection lines={2} />
            <SkelSection lines={1} />
          </div>
        ) : (
          <motion.div className="space-y-6" variants={FIELDS} initial="hidden" animate="show">

            {/* ── Language & Display ── */}
            <motion.div variants={FIELD_ITEM}>
              <SettingsSection title={t.pref_lang_display} icon={<Globe className="w-4 h-4 text-indigo-400" />}>
                <div className="space-y-5">

                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{t.pref_interface_lang}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {LANGUAGES.map(lang => (
                        <button
                          key={lang.code}
                          onClick={() => {
                            setCfg(c => ({ ...c, language: lang.code }))
                            setLang(lang.code as 'en' | 'ku' | 'ar')
                          }}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                            cfg.language === lang.code
                              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                              : 'bg-white/4 border-white/8 text-white/50 hover:text-white/80 hover:bg-white/8',
                          )}
                        >
                          <span className="text-base">{lang.flag}</span>
                          {lang.label}
                          {cfg.language === lang.code && (
                            <span className="ml-auto w-2 h-2 rounded-full bg-indigo-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-white/6" />

                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                      <Clock className="w-3.5 h-3.5" />
                      {t.pref_time_format}
                    </label>
                    <div className="flex gap-2">
                      {(['12h', '24h'] as const).map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => setCfg(c => ({ ...c, date_format: fmt }))}
                          className={cn(
                            'flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                            cfg.date_format === fmt
                              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                              : 'bg-white/4 border-white/8 text-white/50 hover:text-white/80',
                          )}
                        >
                          {fmt === '12h' ? '12-hour  (2:30 PM)' : '24-hour  (14:30)'}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </SettingsSection>
            </motion.div>

            {/* ── Notification Sounds ── */}
            <motion.div variants={FIELD_ITEM}>
              <SettingsSection title={t.pref_sounds} icon={<Bell className="w-4 h-4 text-indigo-400" />}>
                <div className="space-y-5">

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.sounds_enabled ? 'bg-indigo-500/20' : 'bg-white/5')}>
                        {cfg.sounds_enabled
                          ? <Volume2 className="w-5 h-5 text-indigo-400" />
                          : <VolumeX  className="w-5 h-5 text-white/30" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{t.pref_alert_sounds}</p>
                        <p className="text-xs text-white/40">{t.pref_alert_sounds_d}</p>
                      </div>
                    </div>
                    <ToggleSwitch activeColor={ACCENT} on={cfg.sounds_enabled} onChange={v => autoSave({ sounds_enabled: v })} />
                  </div>

                  {cfg.sounds_enabled && (
                    <>
                      <div className="border-t border-white/6" />
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                          <Clock className="w-3.5 h-3.5" />
                          {t.pref_repeat_alert}
                        </label>
                        <div className="flex gap-2">
                          {[15, 30, 60, 120].map(sec => (
                            <button
                              key={sec}
                              onClick={() => setCfg(c => ({ ...c, alert_repeat_seconds: sec }))}
                              className={cn(
                                'flex-1 py-2 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                                cfg.alert_repeat_seconds === sec
                                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                                  : 'bg-white/4 border-white/8 text-white/50 hover:text-white/80',
                              )}
                            >
                              {sec}s
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-white/30">{t.pref_repeat_hint}</p>
                      </div>
                    </>
                  )}

                </div>
              </SettingsSection>
            </motion.div>

            {/* ── Tax ── */}
            <motion.div variants={FIELD_ITEM}>
              <SettingsSection title={t.pref_tax} icon={<Percent className="w-4 h-4 text-indigo-400" />}>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    {t.pref_tax_rate}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min={0} max={100} step={0.1}
                      value={cfg.default_tax_rate}
                      onChange={e => setCfg(c => ({ ...c, default_tax_rate: Number(e.target.value) }))}
                      className="flex-1 px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-indigo-500/50 outline-none transition-all"
                    />
                    <span className="text-white/40 text-sm font-semibold">%</span>
                  </div>
                  <p className="text-[11px] text-white/30">{t.pref_tax_hint}</p>
                </div>
              </SettingsSection>
            </motion.div>

            {/* ── Tips ── */}
            <motion.div variants={FIELD_ITEM}>
              <SettingsSection title={t.pref_tips} icon={<BadgeDollarSign className="w-4 h-4 text-indigo-400" />}>
                <div className="space-y-5">

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.tip_enabled ? 'bg-indigo-500/20' : 'bg-white/5')}>
                        <BadgeDollarSign className={cn('w-5 h-5', cfg.tip_enabled ? 'text-indigo-400' : 'text-white/30')} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{t.pref_tips_enable}</p>
                        <p className="text-xs text-white/40">{t.pref_tips_enable_d}</p>
                      </div>
                    </div>
                    <ToggleSwitch activeColor={ACCENT} on={cfg.tip_enabled} onChange={v => autoSave({ tip_enabled: v })} />
                  </div>

                  {cfg.tip_enabled && (
                    <>
                      <div className="border-t border-white/6" />
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{t.pref_tip_pcts}</label>
                        <div className="flex gap-2 flex-wrap">
                          {TIP_OPTIONS.map(pct => (
                            <button
                              key={pct}
                              onClick={() => toggleTipPercent(pct)}
                              className={cn(
                                'px-4 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95',
                                cfg.tip_percentages.includes(pct)
                                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                                  : 'bg-white/4 border-white/8 text-white/40 hover:text-white/70',
                              )}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-white/30">{t.pref_tip_pcts_hint}</p>
                      </div>
                    </>
                  )}

                </div>
              </SettingsSection>
            </motion.div>

            {/* ── Receipt ── */}
            <motion.div variants={FIELD_ITEM}>
              <SettingsSection title={t.pref_receipt} icon={<Printer className="w-4 h-4 text-indigo-400" />}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.auto_print_receipt ? 'bg-indigo-500/20' : 'bg-white/5')}>
                      <Printer className={cn('w-5 h-5', cfg.auto_print_receipt ? 'text-indigo-400' : 'text-white/30')} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.pref_auto_print}</p>
                      <p className="text-xs text-white/40">{t.pref_auto_print_d}</p>
                    </div>
                  </div>
                  <ToggleSwitch activeColor={ACCENT} on={cfg.auto_print_receipt} onChange={v => autoSave({ auto_print_receipt: v })} />
                </div>
              </SettingsSection>
            </motion.div>

          </motion.div>
        )}
      </FadeSwitch>

    </motion.div>
  )
}
