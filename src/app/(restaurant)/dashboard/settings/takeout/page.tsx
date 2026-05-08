'use client'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { ShoppingBag, Clock, Package, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { SaveButton } from '@/components/ui/SaveButton'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'

interface TakeoutSettings {
  takeout_enabled:     boolean
  show_takeout_button: boolean
  estimated_prep_time: number
}

const DEFAULTS: TakeoutSettings = {
  takeout_enabled:     true,
  show_takeout_button: true,
  estimated_prep_time: 15,
}

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

export default function TakeoutSettingsPage() {
  const { t } = useLanguage()
  const { settings, setSettings, loading, saveState, save, autoSave } =
    useRestaurantSettings<TakeoutSettings>(DEFAULTS)

  return (
    <motion.div className="space-y-6" variants={PAGE} initial="hidden" animate="show">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{t.to_title}</h1>
            <p className="text-xs text-white/40">{t.to_subtitle}</p>
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
            <SkelSection lines={1} />
            <Skel className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <motion.div className="space-y-6" variants={FIELDS} initial="hidden" animate="show">

            {/* Toggles */}
            <motion.div variants={FIELD_ITEM}>
              <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4">

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', settings.takeout_enabled ? 'bg-amber-500/20' : 'bg-white/5')}>
                      {settings.takeout_enabled
                        ? <ToggleRight className="w-5 h-5 text-amber-400" />
                        : <ToggleLeft  className="w-5 h-5 text-white/30" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.to_enabled}</p>
                      <p className="text-xs text-white/40">{t.to_enabled_desc}</p>
                    </div>
                  </div>
                  <ToggleSwitch on={settings.takeout_enabled} onChange={v => autoSave({ takeout_enabled: v })} />
                </div>

                <div className="border-t border-white/6" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', settings.show_takeout_button ? 'bg-amber-500/20' : 'bg-white/5')}>
                      {settings.show_takeout_button
                        ? <ToggleRight className="w-5 h-5 text-amber-400" />
                        : <ToggleLeft  className="w-5 h-5 text-white/30" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.to_button}</p>
                      <p className="text-xs text-white/40">{t.to_button_desc}</p>
                    </div>
                  </div>
                  <ToggleSwitch on={settings.show_takeout_button} onChange={v => autoSave({ show_takeout_button: v })} />
                </div>
              </div>
            </motion.div>

            {/* General settings */}
            <motion.div variants={FIELD_ITEM}>
              <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-5">
                <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider">{t.to_general}</h2>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5" />
                    {t.to_prep_time}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={settings.estimated_prep_time}
                    onChange={e => setSettings(s => ({ ...s, estimated_prep_time: Number(e.target.value) }))}
                    className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/7 border border-white/10 focus:border-amber-500/50 outline-none transition-all"
                  />
                  <p className="text-[11px] text-white/30">{t.to_prep_hint}</p>
                </div>
              </div>
            </motion.div>

            {/* Info card */}
            <motion.div variants={FIELD_ITEM}>
              <div className="rounded-2xl border border-white/6 bg-white/2 p-5 flex items-start gap-3">
                <Package className="w-5 h-5 text-white/25 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white/50">{t.to_how_works}</p>
                  <p className="text-xs text-white/30 leading-relaxed">{t.to_how_works_desc}</p>
                </div>
              </div>
            </motion.div>

          </motion.div>
        )}
      </FadeSwitch>

    </motion.div>
  )
}
