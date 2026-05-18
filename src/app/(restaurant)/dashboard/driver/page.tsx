'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDeliveryOrders } from '@/hooks/useDeliveryOrders'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import {
  Truck, Phone, MapPin, Navigation, Clock,
  CheckCircle2, Package, ArrowLeft, Loader2,
  MessageCircle, Banknote, CreditCard, WifiOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type DeliveryStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled'

interface DeliveryItem {
  id: string
  item_name: string
  item_price: number
  qty: number
  note: string | null
  image_url: string | null
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
  driver_id: string | null
  driver_name: string | null
}

function TimeAgo({ dateStr }: { dateStr: string }) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
      if (diff < 60)        setLabel(`${diff}s`)
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m`)
      else                  setLabel(`${Math.floor(diff / 3600)}h`)
    }
    calc()
    const t = setInterval(calc, 30_000)
    return () => clearInterval(t)
  }, [dateStr])
  return <span>{label}</span>
}

const cacheKey = (staffId: string | null) =>
  staffId ? `driver_orders_cache_${staffId}` : 'driver_orders_cache_owner'

export default function DriverPage() {
  const router    = useRouter()
  const { can, isOwner, isPinStaff, staffName, loading: permLoading } = usePermissions()
  const supabase  = createClient()

  // Redirect if no permission
  useEffect(() => {
    if (!permLoading && !isOwner && !can('driver_screen')) {
      router.replace('/dashboard/unauthorized')
    }
  }, [permLoading, isOwner, can, router])
  const { formatPrice } = useDefaultCurrency()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )
  // Staff ID of the currently logged-in driver (null = owner session)
  const [staffId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('pos_staff_id') : null
  )

  const { data: swrOrders, mutate: reloadOrders } = useDeliveryOrders(restaurantId)
  const [orders, setOrders]         = useState<DeliveryOrder[]>([])
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [isOnline, setIsOnline]     = useState(true)
  const [payModal, setPayModal]     = useState<{ deliveryId: string; orderId: string } | null>(null)

  // ── Online / Offline detection ──────────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    setIsOnline(navigator.onLine)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // ── Populate from SWR → filter by driver → cache offline ───
  useEffect(() => {
    if (!swrOrders) return
    const active = (swrOrders as DeliveryOrder[]).filter(o => {
      if (!['out_for_delivery', 'confirmed', 'preparing'].includes(o.status)) return false
      // PIN-logged-in drivers only see orders assigned to them
      if (isPinStaff && staffId) return o.driver_id === staffId
      // Owners / managers see all
      return true
    })
    setOrders(active)
    try { localStorage.setItem(cacheKey(staffId), JSON.stringify(active)) } catch { /* ignore */ }
  }, [swrOrders, staffId, isPinStaff])

  // ── Load from cache while SWR hasn't responded yet ──────────
  useEffect(() => {
    if (swrOrders) return
    try {
      const raw = localStorage.getItem(cacheKey(staffId))
      if (raw) setOrders(JSON.parse(raw))
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel('driver-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, () => reloadOrders())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status update ────────────────────────────────────────────
  const updateStatus = useCallback(async (deliveryId: string, orderId: string, newStatus: DeliveryStatus) => {
    const k = `${deliveryId}-${newStatus}`
    setProcessing(p => new Set(p).add(k))

    const { error } = await supabase
      .from('delivery_orders')
      .update({ status: newStatus })
      .eq('id', deliveryId)

    if (!error) {
      setOrders(prev =>
        newStatus === 'delivered'
          ? prev.filter(o => o.delivery_id !== deliveryId)
          : prev.map(o => o.delivery_id === deliveryId ? { ...o, status: newStatus } : o)
      )
      reloadOrders()
    }

    setProcessing(p => { const s = new Set(p); s.delete(k); return s })
  }, [supabase, reloadOrders])

  // ── URL helpers ──────────────────────────────────────────────
  const googleMapsUrl = (lat: number, lng: number) =>
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  const wazeUrl = (lat: number, lng: number) =>
    `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  const whatsappUrl = (phone: string) =>
    `https://wa.me/${phone.replace(/\D/g, '')}`

  // ── Pending / On-way counts for header ──────────────────────
  const pickupCount = orders.filter(o => o.status === 'confirmed' || o.status === 'preparing').length
  const onWayCount  = orders.filter(o => o.status === 'out_for_delivery').length

  return (
    <div className="min-h-screen bg-[#080c18] text-white">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[#080c18]/95 backdrop-blur-xl border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-5 h-5 text-white/60" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">Driver Screen</h1>
                {!isOnline && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/25 text-rose-400 text-[10px] font-semibold">
                    <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/35 mt-0.5">
                {staffName && <span className="text-amber-400/70 font-semibold">{staffName} · </span>}
                {orders.length === 0
                  ? 'No active orders'
                  : `${pickupCount > 0 ? `${pickupCount} to pick up` : ''}${pickupCount > 0 && onWayCount > 0 ? ' · ' : ''}${onWayCount > 0 ? `${onWayCount} on the way` : ''}`
                }
              </p>
            </div>
          </div>

          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
            <Truck className="w-5 h-5 text-indigo-400" />
          </div>
        </div>
      </header>

      {/* ── Orders ─────────────────────────────────────────────── */}
      <div className="px-4 py-4 max-w-lg mx-auto space-y-5 pb-10">

        {/* Empty state */}
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 gap-4">
            <div className="w-24 h-24 rounded-3xl bg-white/4 border border-white/8 flex items-center justify-center">
              <Truck className="w-12 h-12 text-white/12" />
            </div>
            <p className="text-white/30 text-sm font-medium">No orders to deliver</p>
            <p className="text-white/15 text-xs text-center">Orders confirmed in the delivery screen<br/>will appear here automatically</p>
          </div>
        )}

        {orders.map(order => {
          const isPickup = order.status === 'confirmed' || order.status === 'preparing'
          const isOnWay  = order.status === 'out_for_delivery'
          const procPickup   = processing.has(`${order.delivery_id}-out_for_delivery`)
          const procDeliver  = processing.has(`${order.delivery_id}-delivered`)

          return (
            <div
              key={order.delivery_id}
              className={cn(
                'rounded-2xl border overflow-hidden',
                isOnWay  ? 'border-indigo-500/35 bg-gradient-to-b from-indigo-500/8 to-transparent'
                         : 'border-amber-500/25 bg-gradient-to-b from-amber-500/6 to-transparent'
              )}
            >
              {/* Status bar */}
              <div className={cn(
                'px-4 py-2.5 flex items-center gap-2 text-xs font-bold border-b',
                isOnWay
                  ? 'bg-indigo-500/12 border-indigo-500/20 text-indigo-300'
                  : 'bg-amber-500/10 border-amber-500/15 text-amber-300'
              )}>
                {isOnWay
                  ? <><Truck className="w-3.5 h-3.5" /> On the Way to Customer</>
                  : <><Package className="w-3.5 h-3.5" /> {order.status === 'confirmed' ? 'Ready to Pick Up' : 'Being Prepared'}</>
                }
                <span className="ml-auto flex items-center gap-1 font-normal opacity-50">
                  <Clock className="w-3 h-3" />
                  <TimeAgo dateStr={order.created_at} /> ago
                </span>
              </div>

              <div className="px-4 py-4 space-y-4">

                {/* Customer name + order total */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-extrabold text-white leading-tight">{order.customer_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {order.order_num && (
                        <p className="text-xs text-white/30 font-mono">#{order.order_num}</p>
                      )}
                      {order.driver_name && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300">
                          <Truck className="w-2.5 h-2.5" />
                          {order.driver_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black text-white">{formatPrice(order.order_total)}</p>
                    {order.delivery_fee > 0 && (
                      <p className="text-[11px] text-white/25">incl. {formatPrice(order.delivery_fee)} fee</p>
                    )}
                  </div>
                </div>

                {/* Items list */}
                <div className="rounded-xl bg-white/4 border border-white/6 divide-y divide-white/5 overflow-hidden">
                  {order.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-6 h-6 rounded-lg bg-white/8 flex items-center justify-center text-[11px] font-bold text-white/60 shrink-0">
                        {item.qty}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white/80 truncate">{item.item_name}</p>
                        {item.note && <p className="text-[10px] text-white/30 truncate">{item.note}</p>}
                      </div>
                      <p className="text-xs font-bold text-white/50 shrink-0">{formatPrice(item.item_price * item.qty)}</p>
                    </div>
                  ))}
                </div>

                {/* Address */}
                {order.address_text && (
                  <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-white/4 border border-white/6">
                    <MapPin className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
                    <p className="text-sm text-white/60 leading-relaxed">{order.address_text}</p>
                  </div>
                )}

                {/* Navigation */}
                {order.latitude && order.longitude ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <a
                      href={googleMapsUrl(order.latitude, order.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-500/12 border border-blue-500/25 text-blue-400 text-sm font-bold active:scale-95 transition-transform"
                    >
                      <Navigation className="w-4 h-4" />
                      Google Maps
                    </a>
                    <a
                      href={wazeUrl(order.latitude, order.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-500/12 border border-sky-500/25 text-sky-400 text-sm font-bold active:scale-95 transition-transform"
                    >
                      <Navigation className="w-4 h-4" />
                      Waze
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white/20 text-xs">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    No GPS — use the address above
                  </div>
                )}

                {/* Contact */}
                <div className="grid grid-cols-2 gap-2.5">
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-400 text-sm font-bold active:scale-95 transition-transform"
                  >
                    <Phone className="w-4 h-4" />
                    Call
                  </a>
                  <a
                    href={whatsappUrl(order.customer_phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-500/12 border border-green-500/25 text-green-400 text-sm font-bold active:scale-95 transition-transform"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                </div>

                {/* ── Main action button ── */}
                {isPickup && (
                  <button
                    onClick={() => updateStatus(order.delivery_id, order.order_id, 'out_for_delivery')}
                    disabled={procPickup}
                    className="w-full py-4 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-base font-extrabold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
                  >
                    {procPickup
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <Truck className="w-5 h-5" />}
                    Picked Up — I&apos;m On the Way
                  </button>
                )}

                {isOnWay && (
                  <button
                    onClick={() => setPayModal({ deliveryId: order.delivery_id, orderId: order.order_id })}
                    disabled={procDeliver}
                    className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-base font-extrabold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
                  >
                    {procDeliver
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <CheckCircle2 className="w-5 h-5" />}
                    Mark as Delivered
                  </button>
                )}

              </div>
            </div>
          )
        })}
      </div>

      {/* ── Payment confirmation bottom sheet ──────────────────── */}
      {payModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPayModal(null)}
        >
          <div
            className="w-full max-w-lg bg-[#0d1426] border-t border-white/10 rounded-t-3xl p-6 pb-10 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            {/* Pull handle */}
            <div className="w-10 h-1 bg-white/15 rounded-full mx-auto" />

            <div className="text-center">
              <p className="text-base font-bold text-white">How was payment made?</p>
              <p className="text-xs text-white/35 mt-1">Choose the payment method to confirm delivery</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  updateStatus(payModal.deliveryId, payModal.orderId, 'delivered')
                  setPayModal(null)
                }}
                className="flex flex-col items-center gap-3 py-6 rounded-2xl bg-amber-500/12 border border-amber-500/25 text-amber-400 font-bold active:scale-95 transition-all"
              >
                <Banknote className="w-8 h-8" />
                <div className="text-center">
                  <p className="text-sm font-bold">Cash</p>
                  <p className="text-[10px] text-amber-400/60 font-normal mt-0.5">Collected on delivery</p>
                </div>
              </button>

              <button
                onClick={() => {
                  updateStatus(payModal.deliveryId, payModal.orderId, 'delivered')
                  setPayModal(null)
                }}
                className="flex flex-col items-center gap-3 py-6 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-400 font-bold active:scale-95 transition-all"
              >
                <CreditCard className="w-8 h-8" />
                <div className="text-center">
                  <p className="text-sm font-bold">Pre-paid</p>
                  <p className="text-[10px] text-emerald-400/60 font-normal mt-0.5">Already paid online</p>
                </div>
              </button>
            </div>

            <button
              onClick={() => setPayModal(null)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white/35 hover:text-white/55 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
