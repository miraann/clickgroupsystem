'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  SlidersHorizontal,
  Volume2, VolumeX, Clock, Globe, Bell, Play, Bike, Hand,
  Smartphone, Truck, ChefHat, QrCode, BellRing, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { useWebPush } from '@/hooks/useWebPush'
import { SaveButton } from '@/components/ui/SaveButton'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { SettingsSection } from '@/components/ui/SettingsSection'

interface PrefSettings {
  language:                      string
  date_format:                   '12h' | '24h'
  sounds_enabled:                boolean
  alert_repeat_seconds:          number
  alert_sound:                   'classic' | 'chime' | 'bell' | 'buzz'
  online_sounds_enabled:         boolean
  online_alert_sound:            'doorbell' | 'fanfare' | 'ping' | 'bubble'
  online_alert_repeat_seconds:   number
  waiter_sounds_enabled:         boolean
  waiter_alert_sound:            'whistle' | 'tap' | 'horn' | 'xylophone'
  waiter_alert_repeat_seconds:   number
  push_notif_delivery:           boolean
  push_notif_waiter:             boolean
  push_notif_kds:                boolean
  push_notif_guest:              boolean
}

const DEFAULTS: PrefSettings = {
  language:                    'en',
  date_format:                 '12h',
  sounds_enabled:              true,
  alert_repeat_seconds:        30,
  alert_sound:                 'classic',
  online_sounds_enabled:       true,
  online_alert_sound:          'doorbell',
  online_alert_repeat_seconds: 30,
  waiter_sounds_enabled:       true,
  waiter_alert_sound:          'whistle',
  waiter_alert_repeat_seconds: 30,
  push_notif_delivery:         true,
  push_notif_waiter:           true,
  push_notif_kds:              true,
  push_notif_guest:            true,
}


const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ku', label: 'Kurdish', flag: '🏳️'  },
  { code: 'ar', label: 'Arabic',  flag: '🇸🇦'  },
]

const ACCENT = 'bg-indigo-500'

const SOUND_OPTIONS = [
  { id: 'classic', label: 'Classic', desc: 'Three ascending beeps',      emoji: '🔔' },
  { id: 'chime',   label: 'Chime',   desc: 'Soft four-note melody',       emoji: '🎵' },
  { id: 'bell',    label: 'Bell',    desc: 'Deep resonant bell strike',   emoji: '🔕' },
  { id: 'buzz',    label: 'Alert',   desc: 'Sharp urgent double ping',    emoji: '📢' },
] as const

function previewSound(id: string) {
  let ctx: AudioContext
  try { ctx = new AudioContext() } catch { return }
  const go = () => {
    if (id === 'classic') {
      ;[520, 660, 800].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.25
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'; o.frequency.setValueAtTime(freq, t)
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
        o.start(t); o.stop(t + 0.22)
      })
    } else if (id === 'chime') {
      ;[440, 554, 659, 880].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.18
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'; o.frequency.setValueAtTime(freq, t)
        g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38)
        o.start(t); o.stop(t + 0.38)
      })
    } else if (id === 'bell') {
      ;[660, 880].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.5
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'triangle'; o.frequency.setValueAtTime(freq, t)
        g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9)
        o.start(t); o.stop(t + 0.9)
      })
    } else {
      // buzz
      ;[900, 900].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.15
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'square'; o.frequency.setValueAtTime(freq, t)
        g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
        o.start(t); o.stop(t + 0.09)
      })
    }
  }
  ctx.state === 'running' ? go() : ctx.resume().then(go).catch(() => {})
}

const ONLINE_SOUND_OPTIONS = [
  { id: 'doorbell', label: 'Doorbell', desc: 'Classic two-tone ding-dong',    emoji: '🚪' },
  { id: 'fanfare',  label: 'Fanfare',  desc: 'Short bright three-note rise',  emoji: '🎺' },
  { id: 'ping',     label: 'Ping',     desc: 'Single clean high ping',        emoji: '✨' },
  { id: 'bubble',   label: 'Bubble',   desc: 'Quick four-note ascending run', emoji: '🫧' },
] as const

function previewOnlineSound(id: string) {
  let ctx: AudioContext
  try { ctx = new AudioContext() } catch { return }
  const go = () => {
    if (id === 'doorbell') {
      ;[{ freq: 784, t: 0 }, { freq: 523, t: 0.65 }].forEach(({ freq, t }) => {
        const base = ctx.currentTime + t
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'triangle'; o.frequency.setValueAtTime(freq, base)
        g.gain.setValueAtTime(0.5, base); g.gain.exponentialRampToValueAtTime(0.001, base + 0.55)
        o.start(base); o.stop(base + 0.55)
      })
    } else if (id === 'fanfare') {
      ;[523, 659, 784].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.16
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'; o.frequency.setValueAtTime(freq, t)
        g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.20)
        o.start(t); o.stop(t + 0.20)
      })
    } else if (id === 'ping') {
      const t = ctx.currentTime
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.type = 'sine'; o.frequency.setValueAtTime(1047, t)
      g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      o.start(t); o.stop(t + 0.35)
    } else {
      // bubble
      ;[659, 784, 880, 1047].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.10
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'; o.frequency.setValueAtTime(freq, t)
        g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
        o.start(t); o.stop(t + 0.12)
      })
    }
  }
  ctx.state === 'running' ? go() : ctx.resume().then(go).catch(() => {})
}

const WAITER_SOUND_OPTIONS = [
  { id: 'whistle',   label: 'Whistle',   desc: 'Descending whistle slide',      emoji: '🪈' },
  { id: 'tap',       label: 'Tap',       desc: 'Three soft percussive taps',     emoji: '👆' },
  { id: 'horn',      label: 'Horn',      desc: 'Short warm horn blast',          emoji: '🎺' },
  { id: 'xylophone', label: 'Xylophone', desc: 'Bright two-note xylophone hit',  emoji: '🎼' },
] as const

function previewWaiterSound(id: string) {
  let ctx: AudioContext
  try { ctx = new AudioContext() } catch { return }
  const go = () => {
    if (id === 'whistle') {
      // Two sharp referee-style whistle blasts at ~3200Hz
      ;[0, 0.30].forEach(delay => {
        const t = ctx.currentTime + delay
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'
        o.frequency.setValueAtTime(3200, t)
        o.frequency.linearRampToValueAtTime(3500, t + 0.04)
        o.frequency.linearRampToValueAtTime(3200, t + 0.18)
        g.gain.setValueAtTime(0.38, t)
        g.gain.setValueAtTime(0.38, t + 0.14)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
        o.start(t); o.stop(t + 0.22)
      })
    } else if (id === 'tap') {
      ;[0, 0.16, 0.32].forEach(delay => {
        const t = ctx.currentTime + delay
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t)
        g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
        o.start(t); o.stop(t + 0.09)
      })
    } else if (id === 'horn') {
      // FM synthesis for a warm brass horn tone
      const t = ctx.currentTime
      const carrier = ctx.createOscillator()
      const mod     = ctx.createOscillator()
      const modGain = ctx.createGain()
      const carGain = ctx.createGain()
      mod.connect(modGain); modGain.connect(carrier.frequency)
      carrier.connect(carGain); carGain.connect(ctx.destination)
      carrier.type = 'sine'; carrier.frequency.setValueAtTime(220, t)
      mod.type     = 'sine'; mod.frequency.setValueAtTime(220, t)
      modGain.gain.setValueAtTime(180, t)
      carGain.gain.setValueAtTime(0, t)
      carGain.gain.linearRampToValueAtTime(0.4, t + 0.05)
      carGain.gain.linearRampToValueAtTime(0.32, t + 0.3)
      carGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
      carrier.start(t); carrier.stop(t + 0.6)
      mod.start(t);     mod.stop(t + 0.6)
    } else {
      // xylophone
      ;[880, 1047].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.22
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'; o.frequency.setValueAtTime(freq, t)
        g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
        o.start(t); o.stop(t + 0.28)
      })
    }
  }
  ctx.state === 'running' ? go() : ctx.resume().then(go).catch(() => {})
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

const PUSH_ITEMS = [
  { key: 'push_notif_delivery' as const, icon: Truck,    label: 'Delivery Orders',    desc: 'New delivery order received'          },
  { key: 'push_notif_waiter'   as const, icon: BellRing, label: 'Waiter Calls',       desc: 'Guest requesting assistance at table' },
  { key: 'push_notif_kds'      as const, icon: ChefHat,  label: 'Kitchen Orders',     desc: 'New order sent to KDS screen'         },
  { key: 'push_notif_guest'    as const, icon: QrCode,   label: 'Guest Menu Orders',  desc: 'Order from QR code guest menu'        },
] as const

export default function PreferencePage() {
  const { t, setLang } = useLanguage()
  const { settings: cfg, setSettings: setCfg, loading, saveState, save, autoSave } =
    useRestaurantSettings<PrefSettings>(DEFAULTS)

  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const restaurantId = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  const { status: pushStatus, busy: pushBusy, subscribe, unsubscribe } = useWebPush(restaurantId)

  const handlePreview = (previewKey: string, play: () => void) => {
    play()
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    setPreviewingId(previewKey)
    previewTimerRef.current = setTimeout(() => setPreviewingId(null), 1400)
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

                      {/* ── Sound Theme ── */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Sound Theme</label>
                        <div className="grid grid-cols-2 gap-2">
                          {SOUND_OPTIONS.map(({ id, label, desc, emoji }) => {
                            const active = (cfg.alert_sound ?? 'classic') === id
                            const playing = previewingId === id
                            return (
                              <button
                                key={id}
                                onClick={() => setCfg(c => ({ ...c, alert_sound: id }))}
                                className={cn(
                                  'relative flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all active:scale-[0.98]',
                                  active
                                    ? 'bg-indigo-500/15 border-indigo-500/40'
                                    : 'bg-white/4 border-white/8 hover:bg-white/7',
                                )}
                              >
                                <span className="text-xl shrink-0">{emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <p className={cn('text-sm font-semibold', active ? 'text-indigo-300' : 'text-white/80')}>{label}</p>
                                  <p className="text-[10px] text-white/35 truncate">{desc}</p>
                                </div>
                                <div
                                  role="button"
                                  onClick={e => { e.stopPropagation(); handlePreview(id, () => previewSound(id)) }}
                                  className={cn(
                                    'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 cursor-pointer',
                                    playing ? 'bg-indigo-500 text-white' : 'bg-white/8 text-white/40 hover:bg-white/15 hover:text-white/70',
                                  )}
                                >
                                  <Play className={cn('w-3 h-3', playing && 'animate-pulse')} fill="currentColor" />
                                </div>
                                {active && <span className="absolute top-2 right-10 w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="border-t border-white/6" />

                      {/* ── Repeat Interval ── */}
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

            {/* ── Online Order Sounds ── */}
            <motion.div variants={FIELD_ITEM}>
              <SettingsSection title={t.pref_online_sounds} icon={<Bike className="w-4 h-4 text-indigo-400" />}>
                <div className="space-y-5">

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.online_sounds_enabled ? 'bg-indigo-500/20' : 'bg-white/5')}>
                        {cfg.online_sounds_enabled
                          ? <Volume2 className="w-5 h-5 text-indigo-400" />
                          : <VolumeX  className="w-5 h-5 text-white/30" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{t.pref_online_alert}</p>
                        <p className="text-xs text-white/40">{t.pref_online_alert_d}</p>
                      </div>
                    </div>
                    <ToggleSwitch activeColor={ACCENT} on={cfg.online_sounds_enabled} onChange={v => autoSave({ online_sounds_enabled: v })} />
                  </div>

                  {cfg.online_sounds_enabled && (
                    <>
                      <div className="border-t border-white/6" />

                      {/* ── Sound Theme ── */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Sound Theme</label>
                        <div className="grid grid-cols-2 gap-2">
                          {ONLINE_SOUND_OPTIONS.map(({ id, label, desc, emoji }) => {
                            const active = (cfg.online_alert_sound ?? 'doorbell') === id
                            const playing = previewingId === `online-${id}`
                            return (
                              <button
                                key={id}
                                onClick={() => setCfg(c => ({ ...c, online_alert_sound: id }))}
                                className={cn(
                                  'relative flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all active:scale-[0.98]',
                                  active
                                    ? 'bg-indigo-500/15 border-indigo-500/40'
                                    : 'bg-white/4 border-white/8 hover:bg-white/7',
                                )}
                              >
                                <span className="text-xl shrink-0">{emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <p className={cn('text-sm font-semibold', active ? 'text-indigo-300' : 'text-white/80')}>{label}</p>
                                  <p className="text-[10px] text-white/35 truncate">{desc}</p>
                                </div>
                                <div
                                  role="button"
                                  onClick={e => { e.stopPropagation(); handlePreview(`online-${id}`, () => previewOnlineSound(id)) }}
                                  className={cn(
                                    'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 cursor-pointer',
                                    playing ? 'bg-indigo-500 text-white' : 'bg-white/8 text-white/40 hover:bg-white/15 hover:text-white/70',
                                  )}
                                >
                                  <Play className={cn('w-3 h-3', playing && 'animate-pulse')} fill="currentColor" />
                                </div>
                                {active && <span className="absolute top-2 right-10 w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="border-t border-white/6" />

                      {/* ── Repeat Interval ── */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                          <Clock className="w-3.5 h-3.5" />
                          {t.pref_repeat_alert}
                        </label>
                        <div className="flex gap-2">
                          {[15, 30, 60, 120].map(sec => (
                            <button
                              key={sec}
                              onClick={() => setCfg(c => ({ ...c, online_alert_repeat_seconds: sec }))}
                              className={cn(
                                'flex-1 py-2 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                                cfg.online_alert_repeat_seconds === sec
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

            {/* ── Waiter Call Sounds ── */}
            <motion.div variants={FIELD_ITEM}>
              <SettingsSection title={t.pref_waiter_sounds} icon={<Hand className="w-4 h-4 text-indigo-400" />}>
                <div className="space-y-5">

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', cfg.waiter_sounds_enabled ? 'bg-indigo-500/20' : 'bg-white/5')}>
                        {cfg.waiter_sounds_enabled
                          ? <Volume2 className="w-5 h-5 text-indigo-400" />
                          : <VolumeX  className="w-5 h-5 text-white/30" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{t.pref_waiter_alert}</p>
                        <p className="text-xs text-white/40">{t.pref_waiter_alert_d}</p>
                      </div>
                    </div>
                    <ToggleSwitch activeColor={ACCENT} on={cfg.waiter_sounds_enabled} onChange={v => autoSave({ waiter_sounds_enabled: v })} />
                  </div>

                  {cfg.waiter_sounds_enabled && (
                    <>
                      <div className="border-t border-white/6" />

                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Sound Theme</label>
                        <div className="grid grid-cols-2 gap-2">
                          {WAITER_SOUND_OPTIONS.map(({ id, label, desc, emoji }) => {
                            const active = (cfg.waiter_alert_sound ?? 'whistle') === id
                            const playing = previewingId === `waiter-${id}`
                            return (
                              <button
                                key={id}
                                onClick={() => setCfg(c => ({ ...c, waiter_alert_sound: id }))}
                                className={cn(
                                  'relative flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all active:scale-[0.98]',
                                  active
                                    ? 'bg-indigo-500/15 border-indigo-500/40'
                                    : 'bg-white/4 border-white/8 hover:bg-white/7',
                                )}
                              >
                                <span className="text-xl shrink-0">{emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <p className={cn('text-sm font-semibold', active ? 'text-indigo-300' : 'text-white/80')}>{label}</p>
                                  <p className="text-[10px] text-white/35 truncate">{desc}</p>
                                </div>
                                <div
                                  role="button"
                                  onClick={e => { e.stopPropagation(); handlePreview(`waiter-${id}`, () => previewWaiterSound(id)) }}
                                  className={cn(
                                    'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 cursor-pointer',
                                    playing ? 'bg-indigo-500 text-white' : 'bg-white/8 text-white/40 hover:bg-white/15 hover:text-white/70',
                                  )}
                                >
                                  <Play className={cn('w-3 h-3', playing && 'animate-pulse')} fill="currentColor" />
                                </div>
                                {active && <span className="absolute top-2 right-10 w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>

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
                              onClick={() => setCfg(c => ({ ...c, waiter_alert_repeat_seconds: sec }))}
                              className={cn(
                                'flex-1 py-2 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                                cfg.waiter_alert_repeat_seconds === sec
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

            {/* ── Push Notifications ── */}
            <motion.div variants={FIELD_ITEM}>
              <SettingsSection title="Push Notifications" icon={<Smartphone className="w-4 h-4 text-indigo-400" />}>
                <div className="space-y-5">

                  {/* Permission row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center',
                        pushStatus === 'subscribed' ? 'bg-emerald-500/20'
                        : pushStatus === 'denied'   ? 'bg-rose-500/20'
                        : 'bg-white/5')}>
                        {pushStatus === 'subscribed'
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          : pushStatus === 'denied'
                          ? <XCircle className="w-5 h-5 text-rose-400" />
                          : pushStatus === 'unsupported'
                          ? <AlertCircle className="w-5 h-5 text-white/30" />
                          : <AlertCircle className="w-5 h-5 text-amber-400" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Push Notifications</p>
                        <p className="text-xs text-white/40">
                          {pushStatus === 'subscribed'   ? 'Active — this device will receive alerts'
                           : pushStatus === 'denied'     ? 'Blocked — allow notifications in browser settings'
                           : pushStatus === 'unsupported'? 'Not supported in this browser'
                           : pushStatus === 'loading'    ? 'Checking…'
                           :                              'Not enabled on this device yet'}
                        </p>
                      </div>
                    </div>
                    {pushStatus === 'unsubscribed' && (
                      <button onClick={subscribe} disabled={pushBusy}
                        className="shrink-0 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-semibold transition-all active:scale-95">
                        {pushBusy ? 'Enabling…' : 'Enable'}
                      </button>
                    )}
                    {pushStatus === 'subscribed' && (
                      <button onClick={unsubscribe} disabled={pushBusy}
                        className="shrink-0 px-4 py-2 rounded-xl bg-white/8 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 disabled:opacity-50 text-white/60 hover:text-rose-400 text-xs font-semibold transition-all active:scale-95">
                        {pushBusy ? 'Disabling…' : 'Disable'}
                      </button>
                    )}
                  </div>

                  <div className="border-t border-white/6" />

                  {/* Per-type toggles */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-3 block">Notify me for</label>
                    <div className="space-y-2">
                      {PUSH_ITEMS.map(({ key, icon: Icon, label, desc }) => (
                        <div key={key} className={cn(
                          'flex items-center justify-between gap-4 px-4 py-3 rounded-xl border transition-all',
                          cfg[key] ? 'bg-indigo-500/8 border-indigo-500/20' : 'bg-white/3 border-white/8',
                        )}>
                          <div className="flex items-center gap-3">
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
                              cfg[key] ? 'bg-indigo-500/20' : 'bg-white/5')}>
                              <Icon className={cn('w-4 h-4', cfg[key] ? 'text-indigo-400' : 'text-white/30')} />
                            </div>
                            <div>
                              <p className={cn('text-sm font-semibold', cfg[key] ? 'text-white' : 'text-white/50')}>{label}</p>
                              <p className="text-[11px] text-white/35">{desc}</p>
                            </div>
                          </div>
                          <ToggleSwitch
                            activeColor={ACCENT}
                            on={cfg[key]}
                            onChange={v => autoSave({ [key]: v } as Partial<PrefSettings>)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {pushStatus === 'unsupported' && (
                    <p className="text-[11px] text-white/25 bg-white/3 border border-white/8 rounded-xl px-4 py-2.5">
                      Open this page in Chrome or the Android app to enable push notifications.
                    </p>
                  )}

                </div>
              </SettingsSection>
            </motion.div>

          </motion.div>
        )}
      </FadeSwitch>

    </motion.div>
  )
}
