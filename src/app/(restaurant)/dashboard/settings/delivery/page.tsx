'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Truck, Plus, X, Loader2, Save, AlertCircle,
  Check, Pencil, Trash2, ToggleLeft, ToggleRight,
  MapPin, Clock, DollarSign, ShoppingCart, Package,
  User, Phone, ChevronDown, RefreshCw, History, Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useDeliverySettings, type CachedDeliveryZone } from '@/hooks/useDeliverySettings'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { SaveButton } from '@/components/ui/SaveButton'
import type { SaveState } from '@/hooks/useRestaurantSettings'

// ── Types ──────────────────────────────────────────────────────
interface DeliveryZone {
  id: string
  restaurant_id: string
  name: string
  area: string | null
  delivery_fee: number
  min_order: number
  estimated_time: number
  active: boolean
  sort_order: number
}

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

const ZONE_EMPTY = {
  name: '',
  area: '',
  delivery_fee: 0,
  min_order: 0,
  estimated_time: 30,
  active: true,
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {DELIVERY_STATUSES.map(s => (
          <div key={s.key} className={cn('rounded-xl border px-4 py-3', s.bg, s.border)}>
            <p className={cn('text-xl font-extrabold tabular-nums', s.color)}>{counts[s.key] ?? 0}</p>
            <p className="text-[11px] text-white/40 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      {/* Date range + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
            <Truck className="w-7 h-7 text-white/15" />
          </div>
          <p className="text-sm text-white/30">No delivery orders{filterStatus !== 'all' ? ` with status "${statusMeta(filterStatus).label}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const meta       = statusMeta(order.status)
            const isExpanded = expanded === order.id
            const date       = new Date(order.created_at)
            return (
              <div key={order.id} className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
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
              </div>
            )
          })}
        </div>
      )}
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

  useEffect(() => {
    setRestaurantId(localStorage.getItem('restaurant_id'))
    setMounted(true)
  }, [])

  const { data: swrData, isLoading: swrLoading, mutate } = useDeliverySettings(restaurantId)
  const loading = !mounted || swrLoading

  const [general, setGeneral] = useState<GeneralSettings>(GENERAL_DEFAULTS)
  const [zones, setZones]     = useState<DeliveryZone[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [err, setErr]             = useState<string | null>(null)

  // Zone modal
  const [zoneModal, setZoneModal]   = useState(false)
  const [editZone, setEditZone]     = useState<DeliveryZone | null>(null)
  const [zoneForm, setZoneForm]     = useState(ZONE_EMPTY)
  const [zoneSaving, setZoneSaving] = useState(false)
  const [zoneErr, setZoneErr]       = useState<string | null>(null)
  const [deleteId, setDeleteId]     = useState<string | null>(null)

  // Sync local state from SWR cache
  useEffect(() => {
    if (!swrData) return
    setGeneral(swrData.general)
    setZones(swrData.zones as DeliveryZone[])
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
    mutate(prev => prev ? { ...prev, general } : prev, false)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2500)
  }

  const openAddZone = () => { setEditZone(null); setZoneForm(ZONE_EMPTY); setZoneErr(null); setZoneModal(true) }

  const openEditZone = (z: DeliveryZone) => {
    setEditZone(z)
    setZoneForm({ name: z.name, area: z.area ?? '', delivery_fee: z.delivery_fee, min_order: z.min_order, estimated_time: z.estimated_time, active: z.active })
    setZoneErr(null)
    setZoneModal(true)
  }

  const saveZone = async () => {
    if (!restaurantId || !zoneForm.name.trim()) { setZoneErr('Zone name is required'); return }
    setZoneSaving(true); setZoneErr(null)

    if (editZone) {
      const { error } = await supabase.from('delivery_zones').update({
        name:           zoneForm.name.trim(),
        area:           zoneForm.area?.trim() || null,
        delivery_fee:   Number(zoneForm.delivery_fee),
        min_order:      Number(zoneForm.min_order),
        estimated_time: Number(zoneForm.estimated_time),
        active:         zoneForm.active,
      }).eq('id', editZone.id)
      if (error) { setZoneErr(error.message); setZoneSaving(false); return }
    } else {
      const nextOrder = zones.length > 0 ? Math.max(...zones.map(z => z.sort_order)) + 1 : 0
      const { error } = await supabase.from('delivery_zones').insert({
        restaurant_id: restaurantId,
        name:          zoneForm.name.trim(),
        area:          zoneForm.area?.trim() || null,
        delivery_fee:  Number(zoneForm.delivery_fee),
        min_order:     Number(zoneForm.min_order),
        estimated_time: Number(zoneForm.estimated_time),
        active:        zoneForm.active,
        sort_order:    nextOrder,
      })
      if (error) { setZoneErr(error.message); setZoneSaving(false); return }
    }

    setZoneSaving(false); setZoneModal(false)
    mutate()
  }

  const deleteZone = async (id: string) => {
    await supabase.from('delivery_zones').delete().eq('id', id)
    setDeleteId(null)
    const updated = zones.filter(z => z.id !== id)
    setZones(updated)
    mutate(prev => prev ? { ...prev, zones: updated as CachedDeliveryZone[] } : prev, false)
  }

  const toggleZoneActive = async (z: DeliveryZone) => {
    const updated = zones.map(x => x.id === z.id ? { ...x, active: !x.active } : x)
    setZones(updated)
    mutate(prev => prev ? { ...prev, zones: updated as CachedDeliveryZone[] } : prev, false)
    await supabase.from('delivery_zones').update({ active: !z.active }).eq('id', z.id)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
    </div>
  )

  const activeZones = zones.filter(z => z.active).length

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Truck className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{t.del_title}</h1>
            <p className="text-xs text-white/40">{activeZones} active zone{activeZones !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {tab === 'settings' && (
          <SaveButton state={saveState} onClick={saveGeneral} />
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/8 w-fit">
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
      </div>

      {/* ── Delivery History Tab ── */}
      {tab === 'history' && restaurantId && (
        <DeliveryHistoryTab restaurantId={restaurantId} formatPrice={formatPrice} />
      )}

      {/* ── Settings Tab ── */}
      {tab === 'settings' && (
        <>
          {err && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{err}
            </div>
          )}

          {/* Delivery On/Off */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4">
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
                  await supabase.from('restaurants').update({ settings: { ...existing, delivery_enabled: v } }).eq('id', restaurantId)
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
                  await supabase.from('restaurants').update({ settings: { ...existing, show_delivery_button: v } }).eq('id', restaurantId)
                }}
              />
            </div>
          </div>

          {/* General Settings */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-5">
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
          </div>

          {/* Delivery Zones */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider">{t.del_zones}</h2>
              <button onClick={openAddZone}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 text-xs font-semibold hover:bg-indigo-500/25 transition-all">
                <Plus className="w-3.5 h-3.5" /> {t.del_add_zone}
              </button>
            </div>

            {zones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                  <MapPin className="w-7 h-7 text-white/15" />
                </div>
                <p className="text-sm text-white/30">{t.del_no_zones}</p>
                <button onClick={openAddZone} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                  + Add your first zone
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {zones.map(z => (
                  <div key={z.id}
                    className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                      z.active ? 'border-white/10 bg-white/3' : 'border-white/5 bg-white/[0.01] opacity-50')}>
                    <div className={cn('w-2 h-2 rounded-full shrink-0', z.active ? 'bg-emerald-400' : 'bg-white/20')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{z.name}</p>
                        {z.area && <span className="text-[11px] text-white/40 truncate">{z.area}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-indigo-300">Fee: {formatPrice(z.delivery_fee)}</span>
                        {z.min_order > 0 && <span className="text-[11px] text-white/40">Min: {formatPrice(z.min_order)}</span>}
                        <span className="text-[11px] text-white/40 flex items-center gap-0.5"><Clock className="w-3 h-3" /> {z.estimated_time} min</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => toggleZoneActive(z)} title={z.active ? 'Deactivate' : 'Activate'}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-all">
                        {z.active ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEditZone(z)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(z.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Zone Modal ── */}
      {zoneModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setZoneModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e1120] shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">{editZone ? t.edit : t.del_add_zone}</h3>
              <button onClick={() => setZoneModal(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            {zoneErr && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />{zoneErr}
              </div>
            )}
            <div className="space-y-3">
              <Field label={t.del_zone_name} icon={MapPin}>
                <input type="text" value={zoneForm.name} onChange={e => setZoneForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} placeholder="e.g. City Center, North Side" autoFocus />
              </Field>
              <Field label={t.del_zone_area}>
                <input type="text" value={zoneForm.area} onChange={e => setZoneForm(f => ({ ...f, area: e.target.value }))}
                  className={inputCls} placeholder="e.g. Within 5km radius" />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t.del_fee} icon={DollarSign}>
                  <input type="number" min="0" step="0.01" value={zoneForm.delivery_fee}
                    onChange={e => setZoneForm(f => ({ ...f, delivery_fee: parseFloat(e.target.value) || 0 }))}
                    className={inputCls} placeholder="0.00" />
                </Field>
                <Field label={t.del_min_order} icon={ShoppingCart}>
                  <input type="number" min="0" step="0.01" value={zoneForm.min_order}
                    onChange={e => setZoneForm(f => ({ ...f, min_order: parseFloat(e.target.value) || 0 }))}
                    className={inputCls} placeholder="0.00" />
                </Field>
                <Field label={t.del_est_time} icon={Clock}>
                  <input type="number" min="1" value={zoneForm.estimated_time}
                    onChange={e => setZoneForm(f => ({ ...f, estimated_time: parseInt(e.target.value) || 30 }))}
                    className={inputCls} placeholder="30" />
                </Field>
              </div>
              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="text-sm font-semibold text-white">Active</p>
                  <p className="text-xs text-white/40">Zone accepts orders</p>
                </div>
                <ToggleSwitch on={zoneForm.active} activeColor="bg-indigo-500" onChange={v => setZoneForm(f => ({ ...f, active: v }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setZoneModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white/60 border border-white/8 hover:bg-white/5 transition-all">
                {t.cancel}
              </button>
              <button onClick={saveZone} disabled={zoneSaving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {zoneSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editZone ? t.save_changes : t.del_add_zone}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0e1120] shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <p className="text-base font-bold text-white">Delete Zone?</p>
                <p className="text-sm text-white/40 mt-1">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/40 border border-white/8 hover:bg-white/5 transition-all">
                {t.cancel}
              </button>
              <button onClick={() => deleteZone(deleteId)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-all">
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
