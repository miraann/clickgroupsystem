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

// Emoji + colour per action (language-independent)
const ACTION_STYLE: Record<string, { emoji: string; color: string; labelKey: keyof Translations }> = {
  send_to_kitchen:    { emoji: '🍽️', color: 'text-amber-300',   labelKey: 'toast_sent_to_kitchen' },
  payment:            { emoji: '💰', color: 'text-emerald-300', labelKey: 'toast_payment'          },
  pay_later:          { emoji: '🗒️', color: 'text-amber-300',   labelKey: 'toast_pay_later'        },
  void_item:          { emoji: '❌', color: 'text-rose-300',    labelKey: 'toast_void_item'        },
  edit_price:         { emoji: '✏️', color: 'text-blue-300',    labelKey: 'toast_edit_price'       },
  apply_discount:     { emoji: '🏷️', color: 'text-purple-300',  labelKey: 'toast_discount'         },
  add:                { emoji: '📦', color: 'text-teal-300',    labelKey: 'toast_add'              },
  edit:               { emoji: '✏️', color: 'text-sky-300',     labelKey: 'toast_edit'             },
  delete:             { emoji: '🗑️', color: 'text-rose-300',    labelKey: 'toast_delete'           },
  toggle:             { emoji: '🔄', color: 'text-indigo-300',  labelKey: 'toast_toggle'           },
  update_settings:    { emoji: '⚙️', color: 'text-violet-300',  labelKey: 'toast_settings'         },
  print:              { emoji: '🖨️', color: 'text-slate-300',   labelKey: 'toast_print'            },
  print_bill:         { emoji: '🧾', color: 'text-slate-300',   labelKey: 'toast_print_bill'       },
  transfer_item:      { emoji: '🔀', color: 'text-cyan-300',    labelKey: 'toast_transfer'         },
  kds_cooking:        { emoji: '🔥', color: 'text-orange-300',  labelKey: 'toast_kds_cooking'      },
  kds_ready:          { emoji: '✅', color: 'text-green-300',   labelKey: 'toast_kds_ready'        },
  delivery_confirmed: { emoji: '📦', color: 'text-sky-300',     labelKey: 'toast_del_confirmed'    },
  delivery_out:       { emoji: '🚚', color: 'text-blue-300',    labelKey: 'toast_del_out'          },
  delivery_delivered: { emoji: '🎉', color: 'text-emerald-300', labelKey: 'toast_del_delivered'    },
  delivery_cancelled: { emoji: '🚫', color: 'text-rose-300',    labelKey: 'toast_del_cancelled'    },
  pending_approved:   { emoji: '✅', color: 'text-teal-300',    labelKey: 'toast_approved'         },
  pending_declined:   { emoji: '❌', color: 'text-rose-300',    labelKey: 'toast_declined'         },
  guest_order:        { emoji: '📱', color: 'text-violet-300',  labelKey: 'toast_guest_order'      },
  waiter_call:        { emoji: '🔔', color: 'text-amber-300',   labelKey: 'toast_waiter_call'      },
  delivery_order:     { emoji: '🛵', color: 'text-blue-300',    labelKey: 'toast_delivery_order'   },
}

function getStyle(action: string, t: Translations) {
  const s = ACTION_STYLE[action]
  if (s) return { emoji: s.emoji, label: t[s.labelKey], color: s.color }
  return {
    emoji: '📋',
    label: action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'text-white/60',
  }
}

function buildDetails(action: string, m: Record<string, unknown>, tableWord: string, itemsWord: string): string {
  const get = (k: string) => m[k] as string | number | null | undefined
  switch (action) {
    case 'guest_order':
      return `${tableWord} ${get('table') ?? '?'}${m.items ? ` — ${m.items}` : (m.items_count ? ` — ${m.items_count} ${itemsWord}` : '')}`
    case 'waiter_call':
      return `${tableWord} ${get('table') ?? '?'}${m.table_name ? ` (${m.table_name})` : ''}`
    case 'delivery_order':
      return `${get('customer') ?? ''}${m.items ? ` — ${m.items}` : (m.items_count ? ` — ${m.items_count} ${itemsWord}` : '')}`
    case 'send_to_kitchen':
      return `${tableWord} ${get('table') ?? '?'}${m.items ? ` — ${m.items}` : ''}`
    case 'payment':
      return `${tableWord} ${get('table') ?? '?'}${m.method ? ` · ${m.method}` : ''}${m.total ? ` — ${m.total}` : ''}`
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
  'bg-rose-500',  'bg-sky-500',  'bg-orange-500',  'bg-teal-500',
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

  // Translated filler words
  const tableWord = t.kds_table   // "Table" / "مێز" / "الطاولة"
  const itemsWord = t.kds_items   // "Items" / "کاڵاکان" / "الأصناف"

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const push = useCallback((toast: Toast) => {
    setToasts(prev => [toast, ...prev].slice(0, 5))
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
        push({
          id:        row.id,
          type:      'audit',
          staffName: row.staff_name,
          action:    row.action,
          metadata:  row.metadata ?? {},
        })
      })
      .subscribe()

    const msgCh = supabase
      .channel('at-msg')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'role_messages',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, payload => {
        const row = payload.new as {
          id: string; message: string
          sender_name: string | null
          target_role: string | null
        }
        if (!row.target_role || row.target_role === staffRole) {
          push({
            id:         row.id,
            type:       'message',
            message:    row.message,
            senderName: row.sender_name,
            targetRole: row.target_role,
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(auditCh)
      supabase.removeChannel(msgCh)
    }
  }, [push])

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-[340px]"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <AnimatePresence initial={false}>
        {toasts.map(toast => {
          const style   = toast.action ? getStyle(toast.action, t) : null
          const details = toast.action && toast.metadata
            ? buildDetails(toast.action, toast.metadata, tableWord, itemsWord)
            : null

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0,   scale: 1    }}
              exit={{    opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.22, ease: 'circOut' }}
              className="pointer-events-auto"
            >
              {toast.type === 'audit' ? (
                <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-white/10 bg-[rgba(8,11,20,0.88)] backdrop-blur-2xl shadow-xl shadow-black/50">
                  <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-white text-[11px] font-bold mt-0.5 ${avatarColor(toast.staffName)}`}>
                    {initials(toast.staffName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`flex items-center gap-1.5 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span className="text-xs font-semibold text-white truncate max-w-[90px]">
                        {toast.staffName ?? '—'}
                      </span>
                      <span className="text-white/20">·</span>
                      {style && (
                        <span className={`text-xs font-medium ${style.color}`}>
                          {style.emoji} {style.label}
                        </span>
                      )}
                    </div>
                    {details && (
                      <p className="text-[11px] text-white/40 mt-0.5 truncate">{details}</p>
                    )}
                  </div>
                  <button onClick={() => dismiss(toast.id)}
                    className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-white/20 hover:text-white/60 transition-colors mt-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-2xl shadow-xl shadow-black/50">
                  <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-lg mt-0.5">
                    💬
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold text-amber-300 mb-0.5 ${isRTL ? 'text-right' : ''}`}>
                      {toast.senderName ?? '—'}
                      {toast.targetRole && (
                        <span className={`${isRTL ? 'mr-1.5' : 'ml-1.5'} text-amber-400/60 font-normal`}>
                          {isRTL ? `← ${toast.targetRole}` : `→ ${toast.targetRole}`}
                        </span>
                      )}
                    </p>
                    <p className={`text-xs text-white/80 leading-relaxed break-words ${isRTL ? 'text-right' : ''}`}>
                      {toast.message}
                    </p>
                  </div>
                  <button onClick={() => dismiss(toast.id)}
                    className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-white/20 hover:text-white/60 transition-colors mt-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
