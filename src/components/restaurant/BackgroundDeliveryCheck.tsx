'use client'
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  getBackgroundStatus, requestIgnoreBatteryOptimizations, openAppSettings,
  openNotificationSettings, openOemSettings, type BackgroundStatus,
} from '@/lib/backgroundDelivery'

type Tone = 'ok' | 'warn' | 'bad'

/**
 * Android APK only (renders nothing elsewhere or on builds without the
 * Background plugin): the device settings that decide whether a push reaches
 * a closed app, each with a button to the system screen that fixes it.
 */
export function BackgroundDeliveryCheck() {
  const { t } = useLanguage()
  const [status, setStatus] = useState<BackgroundStatus | null>(null)

  const refresh = useCallback(() => { getBackgroundStatus().then(setStatus) }, [])

  // The fixes all happen in system screens — re-read on the way back.
  useEffect(() => {
    refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  if (!status) return null

  const notifOn = status.notificationsEnabled && status.channelEnabled
  const brand = status.manufacturer
    ? status.manufacturer.charAt(0).toUpperCase() + status.manufacturer.slice(1)
    : 'Android'

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block">{t.pref_bg_title}</label>
        <p className="text-[11px] text-white/35 mt-0.5">{t.pref_bg_desc}</p>
      </div>
      <Row
        tone={status.batteryOptimized ? 'warn' : 'ok'}
        text={status.batteryOptimized ? t.pref_bg_battery_bad : t.pref_bg_battery_ok}
        action={status.batteryOptimized ? t.pref_bg_allow : undefined}
        onAction={() => { requestIgnoreBatteryOptimizations().then(refresh) }}
      />
      {status.backgroundRestricted && (
        <Row tone="bad" text={t.pref_bg_restricted} action={t.pref_bg_open} onAction={openAppSettings} />
      )}
      {!notifOn && (
        <Row tone="bad" text={t.pref_bg_notif_off} action={t.pref_bg_open} onAction={openNotificationSettings} />
      )}
      {status.hasOemManager && (
        <Row
          tone="warn"
          text={t.pref_bg_oem.replace('{brand}', brand)}
          action={t.pref_bg_open}
          onAction={() => { openOemSettings() }}
        />
      )}
    </div>
  )
}

function Row({ tone, text, action, onAction }: {
  tone: Tone
  text: string
  action?: string
  onAction: () => void
}) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'bad' ? XCircle : AlertCircle
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border bg-white/3 border-white/8">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn('w-8 h-8 shrink-0 rounded-lg flex items-center justify-center',
          tone === 'ok' ? 'bg-emerald-500/20' : tone === 'bad' ? 'bg-rose-500/20' : 'bg-white/5')}>
          <Icon className={cn('w-4 h-4',
            tone === 'ok' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-amber-400')} />
        </div>
        <p className="text-xs text-white/60">{text}</p>
      </div>
      {action && (
        <button onClick={onAction}
          className="shrink-0 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold transition-all active:scale-95">
          {action}
        </button>
      )}
    </div>
  )
}
