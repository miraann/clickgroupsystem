'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Truck, X, Loader2, Save, AlertCircle,
  Check, Clock, DollarSign, ShoppingCart, Package,
  User, Phone, ChevronDown, RefreshCw, History, Settings2,
  ToggleLeft, ToggleRight, MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useDeliverySettings } from '@/hooks/useDeliverySettings'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'circOut' as const } },
}

const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
}

const ITEM: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'circOut' as const } },
}
import { SaveButton } from '@/components/ui/SaveButton'
import type { SaveState } from '@/hooks/useRestaurantSettings'

// ── Types ──────────────────────────────────────────────────────
interface GeneralSettings {
  delivery_enabled: boolean
  show_delivery_button: boolean
  default_delivery_fee: number
  min_order_amount: number
  estimated_delivery_time: number
  free_delivery_above: number | null
  delivery_note: string
}

interface DeliveryOrder {
  id: string
  order_id: string
  customer_name: string
  customer_phone: string
  address_text: string | null
  delivery_fee: number
  status: string
  created_at: string
  order_number: number | null
  total: number
  items: { item_name: string; qty: number; item_price: number }[]
}

const GENERAL_DEFAULTS: GeneralSettings = {
  delivery_enabled: false,
  show_delivery_button: true,
  default_delivery_fee: 0,
  min_order_amount: 0,
  estimated_delivery_time: 30,
  free_delivery_above: null,
  delivery_note: '',
}

const DELIVERY_STATUSES = [
  { key: 'pending',          label: 'Received',       color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/25'   },
  { key: 'preparing',        label: 'Preparing',      color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/25'    },
  { key: 'out_for_delivery', label: 'On the Way',     color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/25'  },
  { key: 'delivered',        label: 'Delivered',      color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/25' },
  { key: 'cancelled',        label: 'Cancelled',      color: 'text-rose-400',    bg: 'bg-rose-500/15',    border: 'border-rose-500/25'    },
]

function statusMeta(s: string) {
  return DELIVERY_STATUSES.find(x => x.key === s) ?? { key: s, label: s, color: 'text-white/50', bg: 'bg-white/5', border: 'border-white/10' }
}

// ── Field ──────────────────────────────────────────────────────
function Field({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-white/50 uppercase tracking-wider">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/60 focus:bg-white/8 transition-all'

// ── Status Dropdown ────────────────────────────────────────────
function StatusDropdown({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen]   = useState(false)
  const [pos, setPos]     = useState({ top: 0, right: 0 })
  const btnRef            = useRef<HTMLButtonElement>(null)
  const meta              = statusMeta(value)

  const handleOpen = () => {
    if (disabled) return
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
          meta.bg, meta.color, meta.border,
          disabled ? 'opacity-60 cursor-default' : 'hover:opacity-80'
        )}
      >
        {meta.label}
        {!disabled && <ChevronDown className="w-3 h-3 opacity-60" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] w-44 rounded-xl border border-white/10 bg-[#0e1120] shadow-2xl overflow-hidden"
            style={{ top: pos.top, right: pos.right }}
          >
            {DELIVERY_STATUSES.map(s => (
              <button
                key={s.key}
                onClick={() => { onChange(s.key); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-all hover:bg-white/5 text-left',
                  s.color, value === s.key ? 'bg-white/5' : ''
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                  s.key === 'pending'          ? 'bg-amber-400'   :
                  s.key === 'preparing'        ? 'bg-blue-400'    :
                  s.key === 'out_for_delivery' ? 'bg-violet-400'  :
                  s.key === 'delivered'        ? 'bg-emerald-400' : 'bg-rose-400'
                )} />
                {s.label}
                {value === s.key && <Check className="w-3 h-3 ml-auto" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Delivery History Tab ───────────────────────────────────────
function DeliveryHistoryTab({ restaurantId, formatPrice }: { restaurantId: string; formatPrice: (n: number) => string }) {
  const supabase = createClient()
  const [orders, setOrders]       = useState<DeliveryOrder[]>([])
  const [loading, setLoading]     = useState(true)
  const [filterStatus, setFilter] = useState<string>('all')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [updating, setUpdating]   = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const { data: delivRows } = await supabase
      .from('delivery_orders')
      .select('id, order_id, customer_name, customer_phone, address_text, delivery_fee, status, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (!delivRows || delivRows.length === 0) { setOrders([]); setLoading(false); return }

    const orderIds = delivRows.map(r => r.order_id)
    const [ordersRes, itemsRes] = await Promise.all([
      supabase.from('orders').select('id, total, order_number').in('id', orderIds),
      supabase.from('order_items').select('order_id, item_name, qty, item_price').in('order_id', orderIds),
    ])

    const ordersMap = new Map((ordersRes.data ?? []).map(o => [o.id, o]))
    const itemsMap  = new Map<string, { item_name: string; qty: number; item_price: number }[]>()
    for (const item of (itemsRes.data ?? [])) {
      const arr = itemsMap.get(item.order_id) ?? []
      arr.push(item)
      itemsMap.set(item.order_id, arr)
    }

    setOrders(delivRows.map(d => {
      const o = ordersMap.get(d.order_id)
      return {
        id:            d.id,
        order_id:      d.order_id,
        customer_name: d.customer_name,
        customer_phone: d.customer_phone,
        address_text:  d.address_text,
        delivery_fee:  d.delivery_fee,
        status:        d.status,
        created_at:    d.created_at,
        order_number:  o?.order_number ?? null,
        total:         o?.total ?? 0,
        items:         itemsMap.get(d.order_id) ?? [],
      }
    }))
    setLoading(false)
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadOrders() }, [loadOrders])

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId)
    await supabase.from('delivery_orders').update({ status: newStatus }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    setUpdating(null)
  }

  const filtered = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false
    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      if (new Date(o.created_at) < from) return false
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      if (new Date(o.created_at) > to) return false
    }
    return true
  })

  // Status counts
  const counts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Stats strip — staggered cards */}
      <motion.div variants={CONTAINER} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {DELIVERY_STATUSES.map(s => (
          <motion.div variants={ITEM} key={s.key} className={cn('rounded-xl border px-4 py-3', s.bg, s.border)}>
            <p className={cn('text-xl font-extrabold tabular-nums', s.color)}>{counts[s.key] ?? 0}</p>
            <p className="text-[11px] text-white/40 mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filter tabs */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: 'circOut', delay: 0.18 }}
        className="flex items-center gap-2 flex-wrap"
      >
        <button
          onClick={() => setFilter('all')}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all', filterStatus === 'all' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-white/5 text-white/40 border-white/8 hover:text-white/60')}
        >
          All ({orders.length})
        </button>
        {DELIVERY_STATUSES.map(s => (counts[s.key] ?? 0) > 0 && (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all', filterStatus === s.key ? cn(s.bg, s.color, s.border) : 'bg-white/5 text-white/40 border-white/8 hover:text-white/60')}
          >
            {s.label} ({counts[s.key]})
          </button>
        ))}
      </motion.div>

      {/* Date range + refresh */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: 'circOut', delay: 0.24 }}
        className="flex items-center gap-2 flex-wrap"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex-1 min-w-0">
            <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider shrink-0">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-xs text-white/70 focus:outline-none focus:text-white [color-scheme:dark]"
            />
            {dateFrom && (
              <button onClick={() => setDateFrom('')} className="text-white/25 hover:text-white/50 shrink-0">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex-1 min-w-0">
            <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider shrink-0">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-xs text-white/70 focus:outline-none focus:text-white [color-scheme:dark]"
            />
            {dateTo && (
              <button onClick={() => setDateTo('')} className="text-white/25 hover:text-white/50 shrink-0">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <button
          onClick={loadOrders}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/8 transition-all shrink-0"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </motion.div>

      {/* Orders list — AnimatePresence so each state gets a fresh entrance */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div key="empty"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'circOut' }}
            className="flex flex-col items-center justify-center py-16 gap-3"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
              <Truck className="w-7 h-7 text-white/15" />
            </div>
            <p className="text-sm text-white/30">No delivery orders{filterStatus !== 'all' ? ` with status "${statusMeta(filterStatus).label}"` : ''}</p>
          </motion.div>
        ) : (
          <motion.div key="list" variants={CONTAINER} initial="hidden" animate="show" className="space-y-2">
            {filtered.map(order => {
              const meta       = statusMeta(order.status)
              const isExpanded = expanded === order.id
              const date       = new Date(order.created_at)
              return (
                <motion.div variants={ITEM} key={order.id} className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                {/* Row header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Status dot */}
                  <div className={cn('w-2 h-2 rounded-full shrink-0', meta.bg.replace('/15', ''))} />

                  {/* Order info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        {order.order_number ? `#${order.order_number}` : 'Order'}
                      </span>
                      <span className="text-xs text-white/40">
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-white/70 flex items-center gap-1">
                        <User className="w-3 h-3 text-white/30" />{order.customer_name}
                      </span>
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-white/20" />{order.customer_phone}
                      </span>
                    </div>
                  </div>

                  {/* Total */}
                  <span className="text-sm font-extrabold text-indigo-300 shrink-0">{formatPrice(order.total)}</span>

                  {/* Status dropdown */}
                  <StatusDropdown
                    value={order.status}
                    onChange={v => updateStatus(order.id, v)}
                    disabled={updating === order.id}
                  />

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : order.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-all shrink-0"
                  >
                    <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded ? 'rotate-180' : '')} />
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                    {/* Address */}
                    {order.address_text && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-white/30 shrink-0 mt-0.5" />
                        <p className="text-xs text-white/50 leading-relaxed">{order.address_text}</p>
                      </div>
                    )}

                    {/* Items */}
                    {order.items.length > 0 && (
                      <div className="rounded-xl overflow-hidden border border-white/8">
                        {order.items.map((item, idx) => (
                          <div key={idx}
                            className="flex items-center justify-between px-3 py-2 border-b border-white/5 last:border-0 bg-white/[0.02]">
                            <span className="text-xs text-white/70">
                              <span className="font-bold text-white/50 mr-1">{item.qty}×</span>{item.item_name}
                            </span>
                            <span className="text-xs font-semibold text-indigo-300">{formatPrice(item.item_price * item.qty)}</span>
                          </div>
                        ))}
                        {/* Totals */}
                        <div className="px-3 py-2 bg-white/5 space-y-1">
                          <div className="flex justify-between text-xs text-white/40">
                            <span>Delivery fee</span>
                            <span>{formatPrice(order.delivery_fee)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-extrabold">
                            <span className="text-white/60">Total</span>
                            <span className="text-indigo-300">{formatPrice(order.total)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function DeliveryPage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const { t } = useLanguage()

  const [tab, setTab]                   = useState<'history' | 'settings'>('history')
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [mounted, setMounted]           = useState(false)
  const [synced,  setSynced]            = useState(false)

  useEffect(() => {
    setRestaurantId(localStorage.getItem('restaurant_id'))
    setMounted(true)
  }, [])

  const { data: swrData, isLoading: swrLoading, mutate } = useDeliverySettings(restaurantId)
  const loading = !mounted || swrLoading || !synced

  const [general, setGeneral] = useState<GeneralSettings>(GENERAL_DEFAULTS)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [err, setErr]             = useState<string | null>(null)

  // Sync local state from SWR cache
  useEffect(() => {
    if (!swrData) return
    setGeneral(swrData.general)
    setSynced(true)
  }, [swrData])

  const saveGeneral = async () => {
    if (!restaurantId) return
    setSaveState('saving'); setErr(null)

    const { data: rest } = await supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (rest?.settings ?? {}) as any
    const merged = {
      ...existing,
      delivery_enabled:        general.delivery_enabled,
      show_delivery_button:    general.show_delivery_button,
      default_delivery_fee:    general.default_delivery_fee,
      min_order_amount:        general.min_order_amount,
      estimated_delivery_time: general.estimated_delivery_time,
      free_delivery_above:     general.free_delivery_above,
      delivery_note:           general.delivery_note,
    }

    const { error } = await supabase.from('restaurants').update({ settings: merged }).eq('id', restaurantId)
    if (error) { setSaveState('idle'); setErr(error.message); return }
    await mutate()
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2500)
  }


  return (
    <motion.div variants={PAGE} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-6 pb-10">

      {/* ── Header ── */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'circOut', delay: 0.06 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Truck className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{t.del_title}</h1>
          </div>
        </div>
        {tab === 'settings' && (
          <SaveButton state={saveState} onClick={saveGeneral} />
        )}
      </motion.div>

      {/* ── Tabs ── */}
      <motion.div
        className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/8 w-fit"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'circOut', delay: 0.12 }}
      >
        <button
          onClick={() => setTab('history')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
            tab === 'history' ? 'bg-indigo-500/25 text-indigo-300 shadow-sm' : 'text-white/40 hover:text-white/60'
          )}
        >
          <History className="w-4 h-4" /> {t.del_orders}
        </button>
        <button
          onClick={() => setTab('settings')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
            tab === 'settings' ? 'bg-indigo-500/25 text-indigo-300 shadow-sm' : 'text-white/40 hover:text-white/60'
          )}
        >
          <Settings2 className="w-4 h-4" /> Settings
        </button>
      </motion.div>

      {/* ── Tab content — AnimatePresence re-animates on every switch ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
          transition={{ duration: 0.38, ease: 'circOut' }}
        >

      {/* ── Delivery History Tab ── */}
      {tab === 'history' && restaurantId && (
        <DeliveryHistoryTab restaurantId={restaurantId} formatPrice={formatPrice} />
      )}

      {/* ── Settings Tab ── */}
      {tab === 'settings' && (
        <div className="space-y-6">
          {err && (
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'circOut' }}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />{err}
            </motion.div>
          )}

          {/* Delivery On/Off */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: 'circOut', delay: 0.05 }}
            className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4"
          >
            {/* Accept online delivery orders */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', general.delivery_enabled ? 'bg-indigo-500/20' : 'bg-white/5')}>
                  {general.delivery_enabled
                    ? <ToggleRight className="w-5 h-5 text-indigo-400" />
                    : <ToggleLeft  className="w-5 h-5 text-white/30" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.del_enabled}</p>
                  <p className="text-xs text-white/40">{t.del_enabled_desc}</p>
                </div>
              </div>
              <ToggleSwitch
                on={general.delivery_enabled}
                activeColor="bg-indigo-500"
                onChange={async v => {
                  setGeneral(g => ({ ...g, delivery_enabled: v }))
                  if (!restaurantId) return
                  const { data: rest } = await supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const existing = (rest?.settings ?? {}) as any
                  const { error } = await supabase.from('restaurants').update({ settings: { ...existing, delivery_enabled: v } }).eq('id', restaurantId)
                  if (error) { setGeneral(g => ({ ...g, delivery_enabled: !v })); setErr(error.message); return }
                  await mutate()
                }}
              />
            </div>

            <div className="border-t border-white/6" />

            {/* Show Delivery button on dashboard */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', general.show_delivery_button ? 'bg-indigo-500/20' : 'bg-white/5')}>
                  {general.show_delivery_button
                    ? <ToggleRight className="w-5 h-5 text-indigo-400" />
                    : <ToggleLeft  className="w-5 h-5 text-white/30" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.del_show_btn}</p>
                  <p className="text-xs text-white/40">{t.del_show_btn_desc}</p>
                </div>
              </div>
              <ToggleSwitch
                on={general.show_delivery_button}
                activeColor="bg-indigo-500"
                onChange={async v => {
                  setGeneral(g => ({ ...g, show_delivery_button: v }))
                  if (!restaurantId) return
                  const { data: rest } = await supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const existing = (rest?.settings ?? {}) as any
                  const { error } = await supabase.from('restaurants').update({ settings: { ...existing, show_delivery_button: v } }).eq('id', restaurantId)
                  if (error) { setGeneral(g => ({ ...g, show_delivery_button: !v })); setErr(error.message); return }
                  await mutate()
                }}
              />
            </div>
          </motion.div>

          {/* General Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: 'circOut', delay: 0.12 }}
            className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-5"
          >
            <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider">{t.del_general}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t.del_fee} icon={DollarSign}>
                <input type="number" min="0" step="0.01" value={general.default_delivery_fee}
                  onChange={e => setGeneral(g => ({ ...g, default_delivery_fee: parseFloat(e.target.value) || 0 }))}
                  className={inputCls} placeholder="0.00" />
              </Field>
              <Field label={t.del_min_order} icon={ShoppingCart}>
                <input type="number" min="0" step="0.01" value={general.min_order_amount}
                  onChange={e => setGeneral(g => ({ ...g, min_order_amount: parseFloat(e.target.value) || 0 }))}
                  className={inputCls} placeholder="0.00" />
              </Field>
              <Field label={t.del_est_time} icon={Clock}>
                <input type="number" min="1" value={general.estimated_delivery_time}
                  onChange={e => setGeneral(g => ({ ...g, estimated_delivery_time: parseInt(e.target.value) || 30 }))}
                  className={inputCls} placeholder="30" />
              </Field>
              <Field label={t.del_free_above} icon={Package}>
                <input type="number" min="0" step="0.01" value={general.free_delivery_above ?? ''}
                  onChange={e => { const v = e.target.value; setGeneral(g => ({ ...g, free_delivery_above: v === '' ? null : parseFloat(v) || 0 })) }}
                  className={inputCls} placeholder="Leave empty to disable" />
              </Field>
            </div>
            <Field label={t.del_note} icon={MapPin}>
              <textarea value={general.delivery_note}
                onChange={e => setGeneral(g => ({ ...g, delivery_note: e.target.value }))}
                rows={2} className={cn(inputCls, 'resize-none')}
                placeholder="e.g. Please have your order ready at the door" />
            </Field>
          </motion.div>

        </div>
      )}

        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
