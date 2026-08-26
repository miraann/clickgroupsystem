'use client'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, CheckCheck, PackageX, PackageMinus, CalendarClock, CalendarX2, TrendingDown, PackagePlus } from 'lucide-react'
import {
  useInventoryNotifications,
  type InventoryNotification,
  type InventoryNotificationType,
} from '@/hooks/useInventoryNotifications'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Translations } from '@/lib/i18n/translations'

const TYPE_STYLE: Record<InventoryNotificationType, { icon: typeof Bell; color: string; bg: string }> = {
  out_of_stock:      { icon: PackageX,      color: 'text-rose-400',    bg: 'bg-rose-500/15 border-rose-500/25' },
  low_stock:         { icon: PackageMinus,  color: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/25' },
  expiring_soon:     { icon: CalendarClock, color: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/25' },
  expired:           { icon: CalendarX2,    color: 'text-rose-400',    bg: 'bg-rose-500/15 border-rose-500/25' },
  rapid_depletion:   { icon: TrendingDown,  color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/25' },
  restock:           { icon: PackagePlus,   color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/25' },
  manual_adjustment: { icon: PackagePlus,   color: 'text-sky-400',     bg: 'bg-sky-500/15 border-sky-500/25' },
}

function timeAgo(iso: string, t: Translations): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return t.notif_just_now
  if (mins < 60) return t.notif_minutes_ago.replace('{n}', String(mins))
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t.notif_hours_ago.replace('{n}', String(hrs))
  return t.notif_days_ago.replace('{n}', String(Math.floor(hrs / 24)))
}

function buildMessage(n: InventoryNotification, t: Translations): string {
  const item = n.item_name ?? ''
  const meta = n.metadata as Record<string, unknown>
  switch (n.type) {
    case 'out_of_stock':
      return t.notif_out_of_stock.replace('{item}', item)
    case 'low_stock':
      return t.notif_low_stock.replace('{item}', item).replace('{qty}', String(meta.current_stock ?? ''))
    case 'restock': {
      const qty = Number(meta.current_stock ?? 0) - Number(meta.previous_stock ?? 0)
      return t.notif_restocked.replace('{item}', item).replace('{qty}', String(qty))
    }
    case 'rapid_depletion':
      return t.notif_rapid_depletion.replace('{item}', item)
    case 'expiring_soon':
      return t.notif_expiring_soon.replace('{item}', item).replace('{date}', String(meta.expiry_date ?? ''))
    case 'expired':
      return t.notif_expired.replace('{item}', item).replace('{date}', String(meta.expiry_date ?? ''))
    case 'manual_adjustment':
    default:
      return t.notif_manual_adjustment.replace('{item}', item)
  }
}

function NotificationRow({ n, t, onRead }: { n: InventoryNotification; t: Translations; onRead: (id: string) => void }) {
  const style = TYPE_STYLE[n.type]
  const Icon  = style.icon

  return (
    <div
      onClick={() => !n.is_read && onRead(n.id)}
      className={`flex items-start gap-3 px-3.5 py-3 border-b border-white/5 last:border-b-0 transition-colors cursor-pointer ${
        n.is_read ? 'opacity-55 hover:opacity-80' : 'hover:bg-white/[0.03]'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${style.bg}`}>
        <Icon className={`w-4 h-4 ${style.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white/90 leading-snug">{buildMessage(n, t)}</p>
        <p className="text-[11px] text-white/35 mt-1">{timeAgo(n.created_at, t)}</p>
      </div>
      {!n.is_read && <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 mt-1.5" />}
    </div>
  )
}

export default function InventoryNotificationBell({ restaurantId }: { restaurantId: string | null }) {
  const { t, isRTL } = useLanguage()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useInventoryNotifications(restaurantId)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const hasCritical = notifications.some(n => !n.is_read && n.severity === 'critical')

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/8 transition-all active:scale-95"
        aria-label="Inventory notifications"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${
              hasCritical ? 'bg-rose-500' : 'bg-amber-500'
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute mt-2 w-[340px] max-h-[420px] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50 flex flex-col ${isRTL ? 'left-0' : 'right-0'}`}
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,13,24,0.97)' }}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
              <span className="text-sm font-bold text-white">{t.notif_title}</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> {t.notif_mark_all_read}
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-white/30">
                  <Check className="w-6 h-6 mb-2" />
                  <p className="text-xs">{t.notif_empty}</p>
                </div>
              ) : (
                notifications.map(n => (
                  <NotificationRow key={n.id} n={n} t={t} onRead={markAsRead} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
