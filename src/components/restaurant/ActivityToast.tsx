'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Toast {
  id:          string
  type:        'audit' | 'message'
  staffName?:  string | null
  action?:     string
  details?:    string
  message?:    string
  senderName?: string | null
  targetRole?: string | null
}

const ACTION_CFG: Record<string, { emoji: string; label: string; color: string }> = {
  send_to_kitchen:    { emoji: '🍽️', label: 'Sent to Kitchen',    color: 'text-amber-300'   },
  payment:            { emoji: '💰', label: 'Payment',            color: 'text-emerald-300' },
  pay_later:          { emoji: '🗒️', label: 'Pay Later',          color: 'text-amber-300'   },
  void_item:          { emoji: '❌', label: 'Void Item',          color: 'text-rose-300'    },
  edit_price:         { emoji: '✏️', label: 'Edit Price',         color: 'text-blue-300'    },
  apply_discount:     { emoji: '🏷️', label: 'Discount Applied',   color: 'text-purple-300'  },
  add:                { emoji: '📦', label: 'Add',                color: 'text-teal-300'    },
  edit:               { emoji: '✏️', label: 'Edit',               color: 'text-sky-300'     },
  delete:             { emoji: '🗑️', label: 'Delete',             color: 'text-rose-300'    },
  toggle:             { emoji: '🔄', label: 'Toggle',             color: 'text-indigo-300'  },
  update_settings:    { emoji: '⚙️', label: 'Settings Updated',   color: 'text-violet-300'  },
  print:              { emoji: '🖨️', label: 'Print',              color: 'text-slate-300'   },
  print_bill:         { emoji: '🧾', label: 'Print Bill',         color: 'text-slate-300'   },
  transfer_item:      { emoji: '🔀', label: 'Transfer',           color: 'text-cyan-300'    },
  kds_cooking:        { emoji: '🔥', label: 'KDS Cooking',        color: 'text-orange-300'  },
  kds_ready:          { emoji: '✅', label: 'KDS Ready',          color: 'text-green-300'   },
  delivery_confirmed: { emoji: '📦', label: 'Delivery Confirmed', color: 'text-sky-300'     },
  delivery_out:       { emoji: '🚚', label: 'Out for Delivery',   color: 'text-blue-300'    },
  delivery_delivered: { emoji: '🎉', label: 'Delivered',          color: 'text-emerald-300' },
  delivery_cancelled: { emoji: '🚫', label: 'Delivery Cancelled', color: 'text-rose-300'    },
  pending_approved:   { emoji: '✅', label: 'Order Approved',     color: 'text-teal-300'    },
  pending_declined:   { emoji: '❌', label: 'Order Declined',     color: 'text-rose-300'    },
}

function getAction(action: string) {
  return ACTION_CFG[action] ?? {
    emoji: '📋',
    label: action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'text-white/60',
  }
}

function metaDetails(metadata: Record<string, unknown>): string {
  const SKIP = new Set(['restaurant_id', 'staff_id', 'entity'])
  const parts: string[] = []
  for (const [k, v] of Object.entries(metadata)) {
    if (SKIP.has(k) || v == null) continue
    if (typeof v === 'object') continue
    parts.push(String(v))
  }
  return parts.slice(0, 3).join(' · ')
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
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
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
          details:   metaDetails(row.metadata ?? {}),
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
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none w-[320px]">
      <AnimatePresence initial={false}>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.22, ease: 'circOut' }}
            className="pointer-events-auto"
          >
            {toast.type === 'audit' ? (
              <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-white/10 bg-[rgba(8,11,20,0.85)] backdrop-blur-2xl shadow-xl shadow-black/50">
                <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-white text-[11px] font-bold mt-0.5 ${avatarColor(toast.staffName)}`}>
                  {initials(toast.staffName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-white truncate max-w-[90px]">
                      {toast.staffName ?? 'Unknown'}
                    </span>
                    <span className="text-white/20">·</span>
                    <span className={`text-xs font-medium ${getAction(toast.action!).color}`}>
                      {getAction(toast.action!).emoji} {getAction(toast.action!).label}
                    </span>
                  </div>
                  {toast.details && (
                    <p className="text-[11px] text-white/40 mt-0.5 truncate">{toast.details}</p>
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
                  <p className="text-xs font-semibold text-amber-300 mb-0.5">
                    {toast.senderName ?? 'Manager'}
                    {toast.targetRole && (
                      <span className="ml-1.5 text-amber-400/60 font-normal">→ {toast.targetRole}</span>
                    )}
                  </p>
                  <p className="text-xs text-white/80 leading-relaxed break-words">{toast.message}</p>
                </div>
                <button onClick={() => dismiss(toast.id)}
                  className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-white/20 hover:text-white/60 transition-colors mt-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
