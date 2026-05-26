'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Translations } from '@/lib/i18n/translations'

interface Toast {
  id:          string
  type:        'audit' | 'message'
  staffName?:  string | null
  action?:     string
  metadata?:   Record<string, unknown>
  message?:    string
  senderName?: string | null
  targetRole?: string | null
}

// All accent variants hardcoded so Tailwind includes them
type Accent = 'amber' | 'emerald' | 'rose' | 'blue' | 'violet' | 'teal' | 'orange' | 'slate' | 'cyan' | 'purple' | 'sky' | 'indigo' | 'green'

const ACCENT_CLASSES: Record<Accent, { bar: string; iconBg: string; labelText: string; progress: string; border: string }> = {
  amber:   { bar: 'bg-amber-400',   iconBg: 'bg-amber-400/15',   labelText: 'text-amber-300',   progress: 'bg-amber-400',   border: 'border-amber-400/20'   },
  emerald: { bar: 'bg-emerald-400', iconBg: 'bg-emerald-400/15', labelText: 'text-emerald-300', progress: 'bg-emerald-400', border: 'border-emerald-400/20' },
  rose:    { bar: 'bg-rose-400',    iconBg: 'bg-rose-400/15',    labelText: 'text-rose-300',    progress: 'bg-rose-400',    border: 'border-rose-400/20'    },
  blue:    { bar: 'bg-blue-400',    iconBg: 'bg-blue-400/15',    labelText: 'text-blue-300',    progress: 'bg-blue-400',    border: 'border-blue-400/20'    },
  violet:  { bar: 'bg-violet-400',  iconBg: 'bg-violet-400/15',  labelText: 'text-violet-300',  progress: 'bg-violet-400',  border: 'border-violet-400/20'  },
  teal:    { bar: 'bg-teal-400',    iconBg: 'bg-teal-400/15',    labelText: 'text-teal-300',    progress: 'bg-teal-400',    border: 'border-teal-400/20'    },
  orange:  { bar: 'bg-orange-400',  iconBg: 'bg-orange-400/15',  labelText: 'text-orange-300',  progress: 'bg-orange-400',  border: 'border-orange-400/20'  },
  slate:   { bar: 'bg-slate-400',   iconBg: 'bg-slate-400/15',   labelText: 'text-slate-300',   progress: 'bg-slate-400',   border: 'border-slate-400/20'   },
  cyan:    { bar: 'bg-cyan-400',    iconBg: 'bg-cyan-400/15',    labelText: 'text-cyan-300',    progress: 'bg-cyan-400',    border: 'border-cyan-400/20'    },
  purple:  { bar: 'bg-purple-400',  iconBg: 'bg-purple-400/15',  labelText: 'text-purple-300',  progress: 'bg-purple-400',  border: 'border-purple-400/20'  },
  sky:     { bar: 'bg-sky-400',     iconBg: 'bg-sky-400/15',     labelText: 'text-sky-300',     progress: 'bg-sky-400',     border: 'border-sky-400/20'     },
  indigo:  { bar: 'bg-indigo-400',  iconBg: 'bg-indigo-400/15',  labelText: 'text-indigo-300',  progress: 'bg-indigo-400',  border: 'border-indigo-400/20'  },
  green:   { bar: 'bg-green-400',   iconBg: 'bg-green-400/15',   labelText: 'text-green-300',   progress: 'bg-green-400',   border: 'border-green-400/20'   },
}

const ACTION_STYLE: Record<string, { emoji: string; accent: Accent; labelKey: keyof Translations }> = {
  send_to_kitchen:    { emoji: '🍽️', accent: 'amber',   labelKey: 'toast_sent_to_kitchen' },
  payment:            { emoji: '💰', accent: 'emerald', labelKey: 'toast_payment'          },
  pay_later:          { emoji: '🗒️', accent: 'amber',   labelKey: 'toast_pay_later'        },
  void_item:          { emoji: '❌', accent: 'rose',    labelKey: 'toast_void_item'        },
  edit_price:         { emoji: '✏️', accent: 'blue',    labelKey: 'toast_edit_price'       },
  apply_discount:     { emoji: '🏷️', accent: 'purple',  labelKey: 'toast_discount'         },
  add:                { emoji: '📦', accent: 'teal',    labelKey: 'toast_add'              },
  edit:               { emoji: '✏️', accent: 'sky',     labelKey: 'toast_edit'             },
  delete:             { emoji: '🗑️', accent: 'rose',    labelKey: 'toast_delete'           },
  toggle:             { emoji: '🔄', accent: 'indigo',  labelKey: 'toast_toggle'           },
  update_settings:    { emoji: '⚙️', accent: 'violet',  labelKey: 'toast_settings'         },
  print:              { emoji: '🖨️', accent: 'slate',   labelKey: 'toast_print'            },
  print_bill:         { emoji: '🧾', accent: 'slate',   labelKey: 'toast_print_bill'       },
  transfer_item:      { emoji: '🔀', accent: 'cyan',    labelKey: 'toast_transfer'         },
  kds_cooking:        { emoji: '🔥', accent: 'orange',  labelKey: 'toast_kds_cooking'      },
  kds_ready:          { emoji: '✅', accent: 'green',   labelKey: 'toast_kds_ready'        },
  delivery_confirmed: { emoji: '📦', accent: 'sky',     labelKey: 'toast_del_confirmed'    },
  delivery_out:       { emoji: '🚚', accent: 'blue',    labelKey: 'toast_del_out'          },
  delivery_delivered: { emoji: '🎉', accent: 'emerald', labelKey: 'toast_del_delivered'    },
  delivery_cancelled: { emoji: '🚫', accent: 'rose',    labelKey: 'toast_del_cancelled'    },
  pending_approved:   { emoji: '✅', accent: 'teal',    labelKey: 'toast_approved'         },
  pending_declined:   { emoji: '❌', accent: 'rose',    labelKey: 'toast_declined'         },
  guest_order:        { emoji: '📱', accent: 'violet',  labelKey: 'toast_guest_order'      },
  waiter_call:        { emoji: '🔔', accent: 'amber',   labelKey: 'toast_waiter_call'      },
  delivery_order:     { emoji: '🛵', accent: 'blue',    labelKey: 'toast_delivery_order'   },
}

function getActionInfo(action: string, t: Translations) {
  const s = ACTION_STYLE[action]
  if (s) return {
    emoji:  s.emoji,
    label:  t[s.labelKey],
    accent: ACCENT_CLASSES[s.accent],
  }
  return {
    emoji:  '📋',
    label:  action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    accent: ACCENT_CLASSES.slate,
  }
}

function buildDetails(action: string, m: Record<string, unknown>, tableWord: string, itemsWord: string): string {
  const get = (k: string) => m[k] as string | number | null | undefined
  switch (action) {
    case 'guest_order':
      return `${tableWord} ${get('table') ?? '?'}${m.items ? ` · ${m.items}` : (m.items_count ? ` · ${m.items_count} ${itemsWord}` : '')}`
    case 'waiter_call':
      return `${tableWord} ${get('table') ?? '?'}${m.table_name ? ` · ${m.table_name}` : ''}`
    case 'delivery_order':
      return `${get('customer') ?? ''}${m.items ? ` · ${m.items}` : (m.items_count ? ` · ${m.items_count} ${itemsWord}` : '')}`
    case 'send_to_kitchen':
      return `${tableWord} ${get('table') ?? '?'}${m.items ? ` · ${m.items}` : ''}`
    case 'payment':
      return `${tableWord} ${get('table') ?? '?'}${m.method ? ` · ${m.method}` : ''}${m.total ? ` · ${m.total}` : ''}`
    default: {
      const parts: string[] = []
      if (m.table)     parts.push(`${tableWord} ${m.table}`)
      if (m.item_name) parts.push(String(m.item_name))
      if (m.name)      parts.push(String(m.name))
      if (m.customer)  parts.push(String(m.customer))
      return parts.slice(0, 3).join(' · ')
    }
  }
}

const AVATAR_COLORS = [
  'bg-cyan-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500',
  'bg-rose-500', 'bg-sky-500',   'bg-orange-500',  'bg-teal-500',
]
function avatarColor(name?: string | null) {
  if (!name) return 'bg-white/20'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('')
}

const TOAST_TTL = 7000

export default function ActivityToast() {
  const { t, isRTL } = useLanguage()
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const tableWord = t.kds_table
  const itemsWord = t.kds_items

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const push = useCallback((toast: Toast) => {
    setToasts(prev => [toast, ...prev].slice(0, 4))
    timers.current.set(toast.id, setTimeout(() => dismiss(toast.id), TOAST_TTL))
  }, [dismiss])

  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurant_id')
    const staffRole    = localStorage.getItem('pos_staff_role')
      ?? (localStorage.getItem('owner_session') === 'true' ? 'owner' : null)
    if (!restaurantId) return

    const supabase = createClient()

    const auditCh = supabase
      .channel('at-audit')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'audit_logs',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, payload => {
        const row = payload.new as {
          id: string; action: string
          staff_name: string | null
          metadata: Record<string, unknown>
        }
        push({ id: row.id, type: 'audit', staffName: row.staff_name, action: row.action, metadata: row.metadata ?? {} })
      })
      .subscribe()

    const msgCh = supabase
      .channel('at-msg')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'role_messages',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, payload => {
        const row = payload.new as { id: string; message: string; sender_name: string | null; target_role: string | null }
        if (!row.target_role || row.target_role === staffRole) {
          push({ id: row.id, type: 'message', message: row.message, senderName: row.sender_name, targetRole: row.target_role })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(auditCh); supabase.removeChannel(msgCh) }
  }, [push])

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2.5 pointer-events-none"
      style={{ width: 'min(400px, calc(100vw - 24px))' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <AnimatePresence initial={false}>
        {toasts.map(toast => {
          if (toast.type === 'audit') {
            const info    = getActionInfo(toast.action ?? '', t)
            const details = toast.action && toast.metadata
              ? buildDetails(toast.action, toast.metadata, tableWord, itemsWord)
              : null

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -28, scale: 0.94 }}
                animate={{ opacity: 1, y: 0,   scale: 1    }}
                exit={{    opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto overflow-hidden rounded-2xl shadow-2xl shadow-black/60"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,13,24,0.92)' }}
              >
                {/* Body */}
                <div className="flex items-stretch">
                  {/* Left accent bar */}
                  <div className={`w-[3px] shrink-0 ${info.accent.bar}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0 px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      {/* Emoji circle */}
                      <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-xl border ${info.accent.iconBg} ${info.accent.border}`}>
                        {info.emoji}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className={`text-sm font-bold leading-tight ${info.accent.labelText}`}>
                          {info.label}
                        </p>
                        <div className={`flex items-center gap-1.5 mt-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-white text-[9px] font-bold ${avatarColor(toast.staffName)}`}>
                            {initials(toast.staffName)}
                          </div>
                          <span className="text-[11px] text-white/50 truncate">{toast.staffName ?? '—'}</span>
                        </div>
                        {details && (
                          <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed line-clamp-2">{details}</p>
                        )}
                      </div>

                      {/* Dismiss */}
                      <button
                        onClick={() => dismiss(toast.id)}
                        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/8 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-[2px] bg-white/5">
                  <motion.div
                    className={`h-full ${info.accent.progress}`}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: TOAST_TTL / 1000, ease: 'linear' }}
                  />
                </div>
              </motion.div>
            )
          }

          // ── Message toast ─────────────────────────────────────
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -28, scale: 0.94 }}
              animate={{ opacity: 1, y: 0,   scale: 1    }}
              exit={{    opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.18 } }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto overflow-hidden rounded-2xl shadow-2xl shadow-black/60"
              style={{ border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(10,13,24,0.92)' }}
            >
              <div className="flex items-stretch">
                <div className="w-[3px] shrink-0 bg-amber-400" />
                <div className="flex-1 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-xl bg-amber-400/15 border border-amber-400/20">
                      💬
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className={`flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <p className="text-sm font-bold text-amber-300 leading-tight">{toast.senderName ?? '—'}</p>
                        {toast.targetRole && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400/70 border border-amber-500/20 font-medium">
                            {toast.targetRole}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs text-white/70 mt-1.5 leading-relaxed break-words line-clamp-3 ${isRTL ? 'text-right' : ''}`}>
                        {toast.message}
                      </p>
                    </div>
                    <button
                      onClick={() => dismiss(toast.id)}
                      className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/8 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="h-[2px] bg-white/5">
                <motion.div
                  className="h-full bg-amber-400"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: TOAST_TTL / 1000, ease: 'linear' }}
                />
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
