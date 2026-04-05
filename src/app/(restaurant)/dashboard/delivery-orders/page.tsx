'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Truck, Phone, MapPin, Clock, Check, X, Loader2,
  RefreshCw, Package, ChevronDown, ChevronUp,
  ExternalLink, CheckCircle2, XCircle, AlertCircle,
  Navigation, UtensilsCrossed, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import InvoiceViewModal from '@/components/restaurant/invoice-view-modal'

// ── Types ──────────────────────────────────────────────────────
type DeliveryStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled'

interface DeliveryItem {
  id: string
  item_name: string
  item_price: number
  qty: number
  note: string | null
}

interface DeliveryOrder {
  delivery_id: string
  order_id: string
  customer_name: string
  customer_phone: string
  latitude: number | null
  longitude: number | null
  address_text: string | null
  delivery_fee: number
  status: DeliveryStatus
  created_at: string
  order_total: number
  items: DeliveryItem[]
  order_num: string | null
}

const STATUS_CFG: Record<DeliveryStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  pending:          { label: 'Pending',          color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   icon: Clock          },
  confirmed:        { label: 'Confirmed',         color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    icon: CheckCircle2   },
  preparing:        { label: 'Preparing',         color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30',  icon: Package        },
  out_for_delivery: { label: 'Out for Delivery',  color: 'text-indigo-400',  bg: 'bg-indigo-500/15',  border: 'border-indigo-500/30',  icon: Truck          },
  delivered:        { label: 'Delivered',         color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: CheckCircle2   },
  cancelled:        { label: 'Cancelled',         color: 'text-rose-400',    bg: 'bg-rose-500/15',    border: 'border-rose-500/30',    icon: XCircle        },
}

const STATUS_FLOW: DeliveryStatus[] = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']

function TimeAgo({ dateStr }: { dateStr: string }) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
      if (diff < 60) setLabel(`${diff}s ago`)
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m ago`)
      else setLabel(`${Math.floor(diff / 3600)}h ago`)
    }
    calc()
    const t = setInterval(calc, 5000)
    return () => clearInterval(t)
  }, [dateStr])
  return <span>{label}</span>
}

type FilterStatus = 'all' | DeliveryStatus

export default function DeliveryOrdersPage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [orders, setOrders]       = useState<DeliveryOrder[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [printInvoice, setPrintInvoice]   = useState<any | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewInvoice, setViewInvoice]     = useState<any | null>(null)
  const [viewLoading, setViewLoading]     = useState<string | null>(null) // order_id being fetched
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState<FilterStatus>('pending')
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [cancelTarget, setCancelTarget] = useState<{ deliveryId: string; orderId: string; name: string } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const loadRef = useRef<() => void>(() => {})

  const load = useCallback(async () => {
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    // Query through `orders` (has working RLS) and join delivery_orders for customer info
    const { data, error: err } = await supabase
      .from('orders')
      .select(`
        id, total, order_num, created_at,
        delivery_orders ( id, customer_name, customer_phone, latitude, longitude, address_text, delivery_fee, status ),
        order_items ( id, item_name, item_price, qty, note, status )
      `)
      .eq('restaurant_id', rest.id)
      .eq('source', 'delivery')
      .order('created_at', { ascending: false })
      .limit(100)

    if (err) { setError(err.message); setLoading(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: DeliveryOrder[] = (data ?? []).flatMap((row: any) => {
      const di = Array.isArray(row.delivery_orders) ? row.delivery_orders[0] : row.delivery_orders
      if (!di) return []
      return [{
        delivery_id:    di.id,
        order_id:       row.id,
        customer_name:  di.customer_name,
        customer_phone: di.customer_phone,
        latitude:       di.latitude,
        longitude:      di.longitude,
        address_text:   di.address_text ?? null,
        delivery_fee:   di.delivery_fee ?? 0,
        status:         di.status as DeliveryStatus,
        created_at:     row.created_at,
        order_total:    row.total ?? 0,
        order_num:      row.order_num ?? null,
        items:          (row.order_items ?? []).filter((i: any) => i.status !== 'void'),
      }]
    })

    setOrders(mapped)
    setLastRefresh(new Date())
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('delivery-orders-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => loadRef.current())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_orders' }, () => loadRef.current())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'delivery_orders' }, () => loadRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setProc = (k: string, v: boolean) =>
    setProcessing(p => { const s = new Set(p); v ? s.add(k) : s.delete(k); return s })

  const createDeliveryInvoice = useCallback(async (orderId: string, order: DeliveryOrder, restId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile }  = user
      ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      : { data: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashier = (profile as any)?.full_name ?? 'Staff'

    const { data: invData } = await supabase
      .from('invoice_number_settings')
      .select('prefix, current_num, start_num')
      .eq('restaurant_id', restId)
      .maybeSingle()

    let invNum = `INV-${orderId.slice(-5).toUpperCase()}`
    if (invData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = invData as any
      const num = d.current_num ?? d.start_num ?? 1001
      invNum = `${d.prefix ?? 'INV-'}${num}`
      await supabase
        .from('invoice_number_settings')
        .update({ current_num: num + 1, updated_at: new Date().toISOString() })
        .eq('restaurant_id', restId)
    }

    const items = order.items.map(i => ({ name: i.item_name, price: i.item_price, qty: i.qty }))
    const subtotal = order.order_total - order.delivery_fee

    const payload = {
      restaurant_id:  restId,
      invoice_num:    invNum,
      order_num:      order.order_num,
      table_num:      'Delivery',
      guests:         0,
      cashier,
      payment_method: 'Delivery',
      items,
      subtotal,
      discount:       0,
      total:          order.order_total,
      amount_paid:    order.order_total,
      change_amount:  0,
      customer_name:  order.customer_name,
      customer_phone: order.customer_phone,
    }

    const { data: saved, error: e1 } = await supabase.from('invoices').insert(payload).select().single()
    if (e1) {
      const { data: saved2 } = await supabase.from('invoices').insert({
        restaurant_id:  restId,
        invoice_num:    invNum,
        order_num:      order.order_num,
        table_num:      'Delivery',
        guests:         0,
        cashier,
        payment_method: 'Delivery',
        items,
        subtotal,
        discount:       0,
        total:          order.order_total,
        amount_paid:    order.order_total,
        change_amount:  0,
      }).select().single()
      return saved2 ?? null
    }

    await supabase
      .from('orders')
      .update({ status: 'paid', total: order.order_total, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    return saved ?? null
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openInvoice = useCallback(async (order: DeliveryOrder) => {
    if (!order.order_num) return
    setViewLoading(order.order_id)
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_num', order.order_num)
      .maybeSingle()
    setViewLoading(null)
    if (data) setViewInvoice(data)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (deliveryId: string, orderId: string, newStatus: DeliveryStatus) => {
    const k = `${deliveryId}-${newStatus}`
    setProc(k, true)

    const { error: err } = await supabase
      .from('delivery_orders')
      .update({ status: newStatus })
      .eq('id', deliveryId)

    if (err) { alert(err.message); setProc(k, false); return }

    // If confirmed → also approve all pending order_items
    if (newStatus === 'confirmed') {
      await supabase
        .from('order_items')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .eq('status', 'pending')
    }

    // If out_for_delivery → create invoice, mark order paid, show print modal
    if (newStatus === 'out_for_delivery' && restaurantId) {
      const ord = orders.find(o => o.order_id === orderId)
      if (ord) {
        const inv = await createDeliveryInvoice(orderId, ord, restaurantId)
        if (inv) setPrintInvoice(inv)
      }
    }

    // If cancelled → void all pending order_items
    if (newStatus === 'cancelled') {
      await supabase
        .from('order_items')
        .update({ status: 'void', void_reason: 'Delivery cancelled' })
        .eq('order_id', orderId)
        .eq('status', 'pending')
    }

    setOrders(prev => prev.map(o =>
      o.delivery_id === deliveryId ? { ...o, status: newStatus } : o
    ))
    setProc(k, false)
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  const counts: Partial<Record<FilterStatus, number>> = { all: orders.length }
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1

  const mapsUrl = (lat: number, lng: number) =>
    `https://www.google.com/maps?q=${lat},${lng}`

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#060810] text-white flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-[#060810]/95 backdrop-blur-xl border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Delivery Orders</h1>
              <p className="text-[11px] text-white/40">
                Refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setLoading(true); load() }}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-0.5 max-w-2xl mx-auto" style={{ scrollbarWidth: 'none' }}>
          {(['all', 'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'] as FilterStatus[]).map(s => {
            const cfg = s !== 'all' ? STATUS_CFG[s] : null
            const count = counts[s] ?? 0
            if (s !== 'all' && count === 0 && filter !== s) return null
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95',
                  filter === s
                    ? (cfg ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'bg-white/15 border-white/25 text-white')
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'
                )}
              >
                {s === 'all' ? 'All' : STATUS_CFG[s].label}
                {count > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    filter === s ? 'bg-white/20' : 'bg-white/8'
                  )}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 px-4 py-4 max-w-2xl mx-auto w-full space-y-3">

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
              <Truck className="w-8 h-8 text-white/15" />
            </div>
            <p className="text-white/30 text-sm">No {filter === 'all' ? '' : filter} delivery orders</p>
          </div>
        )}

        {filtered.map(order => {
          const cfg = STATUS_CFG[order.status]
          const StatusIcon = cfg.icon
          const isExpanded = expanded.has(order.delivery_id)
          const grandTotal = order.order_total

          const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]
          const canAdvance = !!nextStatus && order.status !== 'delivered'
          const canCancel  = order.status !== 'delivered' && order.status !== 'cancelled'

          return (
            <div
              key={order.delivery_id}
              className={cn(
                'rounded-2xl border overflow-hidden transition-all',
                order.status === 'pending' ? 'border-amber-500/40 bg-amber-500/5' :
                order.status === 'cancelled' ? 'border-white/8 bg-white/2 opacity-60' :
                'border-white/10 bg-white/3'
              )}
            >
              {/* ── Card header ── */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start gap-3">
                  {/* Status badge */}
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', cfg.bg)}>
                    <StatusIcon className={cn('w-5 h-5', cfg.color)} />
                  </div>

                  {/* Customer info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white">{order.customer_name}</p>
                      {order.order_num && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/8 text-white/40">
                          #{order.order_num}
                        </span>
                      )}
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg.bg, cfg.border, cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 transition-colors"
                      >
                        <Phone className="w-3 h-3" />
                        {order.customer_phone}
                      </a>
                      <span className="text-[11px] text-white/30 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <TimeAgo dateStr={order.created_at} />
                      </span>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-white">{formatPrice(grandTotal)}</p>
                    {order.delivery_fee > 0 && (
                      <p className="text-[10px] text-white/30 mt-0.5">+{formatPrice(order.delivery_fee)} fee</p>
                    )}
                  </div>
                </div>

                {/* Location */}
                {order.latitude && order.longitude ? (
                  <a
                    href={mapsUrl(order.latitude, order.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-xl transition-all active:scale-[0.98]"
                    style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.20)' }}
                  >
                    <Navigation className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-indigo-300 font-medium flex-1 leading-relaxed">
                      {order.address_text
                        ? order.address_text
                        : `${order.latitude.toFixed(5)}, ${order.longitude.toFixed(5)}`}
                    </span>
                    <ExternalLink className="w-3 h-3 text-indigo-400/60 shrink-0 mt-0.5" />
                  </a>
                ) : (
                  <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                    <MapPin className="w-3.5 h-3.5 text-white/20 shrink-0" />
                    <span className="text-xs text-white/25">No location provided</span>
                  </div>
                )}
              </div>

              {/* ── Items toggle ── */}
              <button
                onClick={() => toggleExpand(order.delivery_id)}
                className="w-full flex items-center justify-between px-4 py-2 border-t border-white/6 text-xs text-white/40 hover:text-white/60 hover:bg-white/3 transition-all"
              >
                <span className="flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3 h-3" />
                  {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                </span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {/* ── Items list ── */}
              {isExpanded && (
                <div className="border-t border-white/6 divide-y divide-white/5">
                  {order.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-[11px] font-bold text-white/50 shrink-0 w-5 text-center">×{item.qty}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white/85 truncate">{item.item_name}</p>
                        {item.note && <p className="text-[10px] text-white/30 truncate mt-0.5">{item.note}</p>}
                      </div>
                      <p className="text-xs font-bold text-white/60 shrink-0">{formatPrice(item.item_price * item.qty)}</p>
                    </div>
                  ))}
                  {/* Subtotals */}
                  <div className="px-4 py-2.5 space-y-1">
                    <div className="flex justify-between text-xs text-white/30">
                      <span>Subtotal</span>
                      <span>{formatPrice(order.order_total - order.delivery_fee)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-white/30">
                      <span>Delivery fee</span>
                      <span>{formatPrice(order.delivery_fee)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-white pt-1 border-t border-white/8 mt-1">
                      <span>Total</span>
                      <span>{formatPrice(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Actions ── */}
              {(canAdvance || canCancel) && order.status !== 'cancelled' && (
                <div className="flex gap-2 px-4 pb-4 pt-2">
                  {order.status === 'out_for_delivery' && (
                    <button
                      onClick={() => openInvoice(order)}
                      disabled={viewLoading === order.order_id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-white/12 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {viewLoading === order.order_id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <FileText className="w-3.5 h-3.5" />}
                      Invoice
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => setCancelTarget({ deliveryId: order.delivery_id, orderId: order.order_id, name: order.customer_name })}
                      disabled={processing.has(`${order.delivery_id}-cancelled`)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-rose-500/25 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {processing.has(`${order.delivery_id}-cancelled`)
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <X className="w-3.5 h-3.5" />}
                      Cancel
                    </button>
                  )}

                  {canAdvance && nextStatus && (
                    <button
                      onClick={() => updateStatus(order.delivery_id, order.order_id, nextStatus)}
                      disabled={processing.has(`${order.delivery_id}-${nextStatus}`)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50',
                        order.status === 'pending'
                          ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30'
                          : 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30'
                      )}
                    >
                      {processing.has(`${order.delivery_id}-${nextStatus}`)
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : order.status === 'pending' ? <Check className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
                      {order.status === 'pending' ? '✓ Confirm & Approve Items'
                        : order.status === 'confirmed' ? '→ Mark Preparing'
                        : order.status === 'preparing' ? '→ Out for Delivery'
                        : order.status === 'out_for_delivery' ? '✓ Mark Delivered'
                        : STATUS_CFG[nextStatus].label}
                    </button>
                  )}
                </div>
              )}

              {order.status === 'delivered' && (
                <div className="px-4 pb-4 pt-2 flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-400 font-semibold">Order delivered successfully</p>
                  </div>
                  <button
                    onClick={() => openInvoice(order)}
                    disabled={viewLoading === order.order_id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-white/12 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    {viewLoading === order.order_id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FileText className="w-3.5 h-3.5" />}
                    Invoice
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Cancel Confirm Modal ── */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setCancelTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0e1120] shadow-2xl p-6 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            {/* Icon + text */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/15 flex items-center justify-center">
                <XCircle className="w-7 h-7 text-rose-400" />
              </div>
              <div>
                <p className="text-base font-bold text-white">Cancel this order?</p>
                <p className="text-sm text-white/40 mt-1">
                  Order for <span className="text-white/70 font-semibold">{cancelTarget.name}</span> will be cancelled and all pending items will be voided.
                </p>
                <p className="text-xs text-rose-400/70 mt-2">This action cannot be undone.</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50 border border-white/8 hover:bg-white/5 hover:text-white/70 transition-all"
              >
                Keep Order
              </button>
              <button
                onClick={() => {
                  updateStatus(cancelTarget.deliveryId, cancelTarget.orderId, 'cancelled')
                  setCancelTarget(null)
                }}
                disabled={processing.has(`${cancelTarget.deliveryId}-cancelled`)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {processing.has(`${cancelTarget.deliveryId}-cancelled`)
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <XCircle className="w-4 h-4" />}
                Yes, Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delivery invoice print modal (Out for Delivery) ── */}
      {printInvoice && restaurantId && (
        <InvoiceViewModal
          invoice={printInvoice}
          restaurantId={restaurantId}
          onClose={() => setPrintInvoice(null)}
        />
      )}

      {/* ── Invoice view modal (delivered orders) ── */}
      {viewInvoice && restaurantId && (
        <InvoiceViewModal
          invoice={viewInvoice}
          restaurantId={restaurantId}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  )
}
