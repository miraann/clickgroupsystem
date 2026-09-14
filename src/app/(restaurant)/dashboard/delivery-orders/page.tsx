'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import NextImage from 'next/image'
import { mutate as swrMutate } from 'swr'
import { useDeliveryOrders } from '@/hooks/useDeliveryOrders'
import { useRestaurant } from '@/hooks/useRestaurant'
import { ModuleGate } from '@/components/ModuleGate'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import { getStaffHome } from '@/lib/permissions/staffHome'
import {
  Truck, Phone, MapPin, Clock, Check, X, Loader2,
  RefreshCw, Package,
  CheckCircle2, XCircle, AlertCircle,
  Navigation, UtensilsCrossed, FileText, Home, MonitorSmartphone, UserRound, Camera, LogOut, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { logAudit, type AuditAction } from '@/lib/logAudit'
import { printKitchenTicket } from '@/lib/printKitchenTicket'
import { enqueuePrint } from '@/lib/printQueue'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { notifyDriver, buildStatusWhatsAppMessage, buildWhatsAppDeepLink } from '@/lib/delivery/notify'
import { isDeliveryKiosk } from '@/lib/kioskMode'
import { useWebPush } from '@/hooks/useWebPush'
import DeliveryOrderAlert from '@/components/delivery/DeliveryOrderAlert'

const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.03 } },
}
const ITEM: Variants = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
}
function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-white/8', className)} />
}
import InvoiceViewModal from '@/components/restaurant/invoice-view-modal'

// ── Types ──────────────────────────────────────────────────────
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
  selfie_url: string | null
}

interface Driver {
  id: string
  name: string
  phone: string | null
}

const STATUS_CFG: Record<DeliveryStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType; strip: string }> = {
  pending:          { label: 'Pending',          color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   icon: Clock,        strip: 'from-amber-400 to-orange-500'   },
  confirmed:        { label: 'Confirmed',         color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    icon: CheckCircle2, strip: 'from-blue-400 to-sky-500'       },
  preparing:        { label: 'Preparing',         color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30',  icon: Package,      strip: 'from-violet-400 to-purple-500'  },
  out_for_delivery: { label: 'Out for Delivery',  color: 'text-indigo-400',  bg: 'bg-indigo-500/15',  border: 'border-indigo-500/30',  icon: Truck,        strip: 'from-indigo-400 to-blue-500'    },
  delivered:        { label: 'Delivered',         color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: CheckCircle2, strip: 'from-emerald-400 to-teal-500'   },
  cancelled:        { label: 'Cancelled',         color: 'text-rose-400',    bg: 'bg-rose-500/15',    border: 'border-rose-500/30',    icon: XCircle,      strip: 'from-rose-400 to-red-500'       },
}

const STATUS_FLOW: DeliveryStatus[] = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

interface WaTemplate { id: string; name: string; message: string }

function resolveTemplate(tpl: string, order: DeliveryOrder, formatPrice: (n: number) => string): string {
  const subtotal   = order.items.reduce((s, i) => s + i.item_price * i.qty, 0)
  const itemLines  = order.items.map(i => `• ${i.item_name} ×${i.qty} — ${formatPrice(i.item_price * i.qty)}`).join('\n')
  return tpl
    .replace(/\{\{customer_name\}\}/g,  order.customer_name)
    .replace(/\{\{order_number\}\}/g,   order.order_num ? `#${order.order_num}` : '')
    .replace(/\{\{items\}\}/g,          itemLines)
    .replace(/\{\{subtotal\}\}/g,       formatPrice(subtotal))
    .replace(/\{\{delivery_fee\}\}/g,   order.delivery_fee > 0 ? formatPrice(order.delivery_fee) : '')
    .replace(/\{\{total_price\}\}/g,    formatPrice(order.order_total))
    .replace(/\{\{address\}\}/g,        order.address_text ?? '')
}

function buildWhatsAppUrl(order: DeliveryOrder, resolvedMsg: string): string {
  let phone = order.customer_phone.replace(/\D/g, '')
  if (phone.startsWith('07') && phone.length === 11) phone = '964' + phone.slice(1)
  else if (phone.startsWith('7') && phone.length === 10) phone = '964' + phone
  return `https://wa.me/${phone}?text=${encodeURIComponent(resolvedMsg)}`
}

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
  const router = useRouter()
  const { can, isOwner, isPinStaff, staffName, permissions, loading: permsLoading } = usePermissions()

  useEffect(() => {
    if (permsLoading || isOwner) return
    if (!can('delivery')) router.replace(getStaffHome(permissions))
  }, [permsLoading, isOwner, permissions, can, router])

  // Staff identity for "who sent this" on the kitchen ticket — same rule as
  // the dine-in order screen's cashier/ticket resolution (never a login email).
  const [authFullName, setAuthFullName] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAuthFullName((user?.user_metadata?.full_name as string) ?? null)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const staffLabel =
    isOwner                     ? 'SuperAdmin'
    : (isPinStaff && staffName) ? staffName
    : (authFullName || staffName || 'Staff')

  // Delivery APK kiosk: no way out to Home / Driver — this is the only screen.
  const [kiosk, setKiosk] = useState(false)
  useEffect(() => { setKiosk(isDeliveryKiosk()) }, [])

  // Read restaurantId from localStorage immediately so SWR can serve cache on re-mount
  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  // Shared restaurant row (settings/modules) — one round-trip per session
  const { restaurant } = useRestaurant(restaurantId)

  // Register this device for restaurant-wide "delivery" push (new order alerts)
  // when running inside the native delivery kiosk APK. Settings → Preference
  // (the manual enable toggle) is unreachable under the kiosk route lock, so
  // this is the only way that flavor ever gets a push subscription registered.
  const { status: deliveryPushStatus, subscribe: subscribeDeliveryPush } = useWebPush(restaurantId)
  useEffect(() => {
    if (kiosk && restaurantId && deliveryPushStatus === 'unsubscribed') subscribeDeliveryPush()
  }, [kiosk, restaurantId, deliveryPushStatus, subscribeDeliveryPush])

  // SWR: delivery orders — shows cached data instantly on return navigation, revalidates in background
  const { data: swrOrders, isLoading: swrLoading, mutate: reloadOrders } = useDeliveryOrders(restaurantId)

  const [orders, setOrders]       = useState<DeliveryOrder[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [printInvoice, setPrintInvoice]   = useState<any | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewInvoice, setViewInvoice]     = useState<any | null>(null)
  const [viewLoading, setViewLoading]     = useState<string | null>(null) // order_id being fetched
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState<FilterStatus>('pending')
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [cancelTarget, setCancelTarget] = useState<{ deliveryId: string; orderId: string; name: string } | null>(null)
  const [advanceTarget, setAdvanceTarget] = useState<{
    deliveryId: string; orderId: string; nextStatus: DeliveryStatus; label: string; name: string
    driver?: { driver_id: string; driver_name: string }
  } | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [viewItem, setViewItem] = useState<DeliveryItem | null>(null)
  const [drivers, setDrivers]     = useState<Driver[]>([])
  const [driverPick, setDriverPick] = useState<Record<string, string>>({})
  const [whatsappDropdown, setWhatsappDropdown] = useState<string | null>(null)
  const [waTemplates, setWaTemplates]           = useState<WaTemplate[]>([])
  const [autoWhatsAppUrl, setAutoWhatsAppUrl]   = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const loadRef = useRef<() => void>(() => {})

  // Populate orders from SWR cache/data
  useEffect(() => {
    if (swrOrders) {
      setOrders(swrOrders as DeliveryOrder[])
      setLastRefresh(new Date())
      setLoading(false)
    } else if (!swrLoading) {
      setLoading(false)
    }
  }, [swrOrders, swrLoading])

  const load = useCallback(async () => {
    if (!restaurantId) { setError('Restaurant not found'); setLoading(false); return }
    // Trigger SWR revalidation — it re-runs the fetcher and updates state via the effect above
    await reloadOrders()
    setLastRefresh(new Date())
  }, [restaurantId, reloadOrders])

  useEffect(() => { loadRef.current = load }, [load])

  // Realtime revalidation is handled inside useDeliveryOrders — no second channel here.

  // WhatsApp templates — loaded lazily the first time a dropdown is opened.
  const waTemplatesLoaded = useRef(false)
  const loadWaTemplates = useCallback(() => {
    if (waTemplatesLoaded.current || !restaurantId) return
    waTemplatesLoaded.current = true
    supabase
      .from('whatsapp_templates')
      .select('id, name, message')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setWaTemplates((data ?? []) as WaTemplate[]))
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Active staff (assignable drivers) — only needed once an order reaches
  // "preparing", so the query waits until that's true.
  const needDrivers = orders.some(o => o.status === 'preparing')
  useEffect(() => {
    if (!restaurantId || !needDrivers || drivers.length > 0) return
    supabase
      .from('staff')
      .select('id, name, phone')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .order('name', { ascending: true })
      .then(({ data }) => setDrivers((data ?? []).map(s => ({ id: s.id, name: s.name, phone: s.phone ?? null }))))
  }, [restaurantId, needDrivers]) // eslint-disable-line react-hooks/exhaustive-deps

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

    const itemsSubtotal = order.items.reduce((s, i) => s + i.item_price * i.qty, 0)
    const discount      = Math.max(0, itemsSubtotal + order.delivery_fee - order.order_total)

    // Encode delivery fee inside the JSONB items array so it survives without a DB column change
    const items = [
      ...order.items.map(i => ({ name: i.item_name, price: i.item_price, qty: i.qty })),
      ...(order.delivery_fee > 0 ? [{ name: 'Delivery Fee', price: order.delivery_fee, qty: 1, isDeliveryFee: true }] : []),
    ]

    const payload = {
      restaurant_id:  restId,
      invoice_num:    invNum,
      order_num:      order.order_num,
      table_num:      'Delivery',
      guests:         0,
      cashier,
      payment_method: 'Delivery',
      items,
      subtotal:       itemsSubtotal,
      discount,
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
        subtotal:       itemsSubtotal,
        discount,
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

  const updateStatus = async (
    deliveryId: string,
    orderId: string,
    newStatus: DeliveryStatus,
    extra?: { driver_id: string; driver_name: string },
  ) => {
    const k = `${deliveryId}-${newStatus}`
    setProc(k, true)

    const updateData: Record<string, unknown> = { status: newStatus }
    if (extra) { updateData.driver_id = extra.driver_id; updateData.driver_name = extra.driver_name }

    const { error: err } = await supabase
      .from('delivery_orders')
      .update(updateData)
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

    // If preparing → send items to the kitchen printer, same as the dine-in
    // "Send to Kitchen" button (order/[table] → handleSend → printKitchenTicket).
    if (newStatus === 'preparing' && restaurantId) {
      const ord = orders.find(o => o.order_id === orderId)
      if (ord && ord.items.length > 0) {
        const ticketItems = ord.items.map(i => ({ name: i.item_name, qty: i.qty, note: i.note }))
        enqueuePrint({
          kind:   'kitchen',
          title:  `Kitchen ticket · Delivery${ord.order_num ? ` #${ord.order_num}` : ''}`,
          detail: ticketItems.map(i => `${i.qty}× ${i.name}`).join(', '),
          run:    () => printKitchenTicket({
            restaurantId,
            tableNum: 'Delivery',
            orderNum: ord.order_num,
            items:    ticketItems,
            sentBy:   staffLabel,
          }),
        })
        logAudit(restaurantId, 'send_to_kitchen', {
          order_id: orderId, delivery: true, item_count: ticketItems.length,
          items: ticketItems.map(i => `${i.qty}× ${i.name}`).join(', '),
        })
      }
    }

    // If out_for_delivery → create invoice, mark order paid, show print modal
    if (newStatus === 'out_for_delivery' && restaurantId) {
      const ord = orders.find(o => o.order_id === orderId)
      if (ord) {
        const inv = await createDeliveryInvoice(orderId, ord, restaurantId)
        if (inv) setPrintInvoice(inv)
      }
    }

    // If delivered → deduct inventory (mirrors payment-screen auto-deduct logic)
    if (newStatus === 'delivered' && restaurantId) {
      const autoDeduct = (restaurant?.settings as Record<string, unknown> | undefined)?.inventory_auto_deduct === true
      if (autoDeduct) {
        const { data: orderItemsForInv } = await supabase
          .from('order_items')
          .select('menu_item_id, qty')
          .eq('order_id', orderId)
          .not('status', 'eq', 'void')

        if (orderItemsForInv && orderItemsForInv.length > 0) {
          const menuItemIds = [...new Set(orderItemsForInv.map((r: { menu_item_id: string; qty: number }) => r.menu_item_id))]
          const { data: ingredients } = await supabase
            .from('menu_item_ingredients')
            .select('menu_item_id, inventory_item_id, quantity')
            .in('menu_item_id', menuItemIds)

          if (ingredients && ingredients.length > 0) {
            const deductMap = new Map<string, number>()
            for (const oi of orderItemsForInv as { menu_item_id: string; qty: number }[]) {
              const ings = ingredients.filter((g: { menu_item_id: string; inventory_item_id: string; quantity: number }) => g.menu_item_id === oi.menu_item_id)
              for (const ing of ings) {
                const prev = deductMap.get(ing.inventory_item_id) ?? 0
                deductMap.set(ing.inventory_item_id, prev + ing.quantity * oi.qty)
              }
            }
            const invIds = [...deductMap.keys()]
            const { data: invItems } = await supabase
              .from('inventory_items')
              .select('id, current_stock')
              .in('id', invIds)
            if (invItems) {
              await Promise.all(
                (invItems as { id: string; current_stock: number }[]).map(inv => {
                  const deduct = deductMap.get(inv.id) ?? 0
                  const newStock = Math.max(0, inv.current_stock - deduct)
                  return supabase.from('inventory_items').update({ current_stock: newStock }).eq('id', inv.id)
                })
              )
            }
          }
        }
      }
    }

    // If cancelled → void all active order_items (pending, sent, cooking)
    if (newStatus === 'cancelled') {
      await supabase
        .from('order_items')
        .update({ status: 'void', void_reason: 'Delivery cancelled' })
        .eq('order_id', orderId)
        .in('status', ['pending', 'sent', 'cooking'])
    }

    // Audit log
    if (restaurantId) {
      const order = orders.find(o => o.delivery_id === deliveryId)
      const actionMap: Partial<Record<string, AuditAction>> = {
        confirmed:        'delivery_confirmed',
        out_for_delivery: 'delivery_out',
        delivered:        'delivery_delivered',
        cancelled:        'delivery_cancelled',
      }
      const auditAction = actionMap[newStatus]
      if (auditAction) logAudit(restaurantId, auditAction, {
        delivery_id: deliveryId, order_id: orderId, customer: order?.customer_name, order_num: order?.order_num,
      })

      // Real-time driver push: wake the assigned driver's device when there's
      // a job to act on (preparing = newly assigned, out_for_delivery = ready
      // for pickup). The delivery_notifications trigger also logs this
      // server-side for anyone polling instead of subscribing to Realtime.
      const driverId = extra?.driver_id ?? order?.driver_id ?? null
      if (driverId && (newStatus === 'preparing' || newStatus === 'out_for_delivery')) {
        notifyDriver(
          restaurantId,
          { staffId: driverId },
          newStatus,
          newStatus === 'out_for_delivery'
            ? `Order ready for pickup — ${order?.customer_name ?? 'customer'}`
            : `New delivery assigned — ${order?.customer_name ?? 'customer'}`,
        )
      }

      // Automated customer WhatsApp status update (one-tap send, opened in a
      // new tab so staff can review/edit before hitting send in WhatsApp).
      if (order && ['confirmed', 'out_for_delivery', 'delivered', 'cancelled'].includes(newStatus)) {
        const msg = buildStatusWhatsAppMessage({
          status: newStatus,
          orderNum: order.order_num,
          customerName: order.customer_name,
          driverName: extra?.driver_name ?? order.driver_name,
        })
        setAutoWhatsAppUrl(buildWhatsAppDeepLink(order.customer_phone, msg))
      }
    }

    // Optimistic local state update
    setOrders(prev => prev.map(o =>
      o.delivery_id === deliveryId ? { ...o, status: newStatus, ...(extra ?? {}) } : o
    ))
    // Also update SWR cache so next re-mount shows the correct status instantly
    if (restaurantId) {
      swrMutate(`delivery-orders-${restaurantId}`, (prev: DeliveryOrder[] | undefined) =>
        (prev ?? []).map(o => o.delivery_id === deliveryId ? { ...o, status: newStatus, ...(extra ?? {}) } : o),
        false
      )
    }
    setProc(k, false)

    // Auto-navigate to the new status step
    if (newStatus !== 'cancelled') setFilter(newStatus)
  }


  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  const counts: Partial<Record<FilterStatus, number>> = { all: orders.length }
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1

  // Turn-by-turn directions FROM the restaurant TO the customer, not just a
  // pin — origin is the restaurant's own street address (Settings →
  // Restaurant Info), which Google geocodes on its end. No address on file
  // yet? Omit origin and Google Maps falls back to the viewer's current
  // location as the starting point.
  const directionsUrl = (lat: number, lng: number) => {
    const params = new URLSearchParams({ api: '1', destination: `${lat},${lng}`, travelmode: 'driving' })
    const origin = restaurant?.address?.trim()
    if (origin) params.set('origin', origin)
    return `https://www.google.com/maps/dir/?${params.toString()}`
  }

  if (loading) return (
    <ModuleGate moduleKey="delivery">
      <div className="min-h-screen text-white" style={{ background: 'var(--app-bg, #022658)' }}>
        <div className="px-4 sm:px-6 pt-8 pb-4 max-w-3xl mx-auto space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-52 rounded-3xl" />)}
        </div>
      </div>
    </ModuleGate>
  )

  return (
    <ModuleGate moduleKey="delivery">
    <div className="min-h-screen text-white flex flex-col" style={{ background: 'var(--app-bg, #022658)' }}>
      <DeliveryOrderAlert restaurantId={restaurantId} />

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 backdrop-blur-xl border-b border-white/8 px-4 sm:px-6 py-3.5" style={{ background: 'var(--app-anchor-95, rgba(2,38,88,0.95))' }}>
        <div className="flex items-center justify-between max-w-3xl mx-auto gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-white tracking-tight truncate">Delivery Orders</h1>
              <p className="text-xs text-white/40">
                Refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!kiosk && (
              <button
                onClick={() => router.push('/dashboard/driver')}
                className="flex items-center gap-2 px-5 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/25 transition-all active:scale-95 text-sm font-bold"
              >
                <MonitorSmartphone className="w-5 h-5" />
                <span className="hidden sm:inline">Driver</span>
              </button>
            )}
            {!kiosk && (
              <button
                onClick={() => router.push('/dashboard')}
                className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95"
              >
                <Home className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => { setLoading(true); load() }}
              className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            {kiosk && (
              // The delivery kiosk hides Home / Driver above — this is the only
              // way out of the app, so it has to live on this one locked screen.
              <button
                onClick={async () => {
                  const supabase = createClient()
                  await supabase.auth.signOut().catch(() => {})
                  const slug = localStorage.getItem('restaurant_slug')
                  const keys = ['restaurant_id', 'restaurant_slug', 'restaurant_name', 'owner_session', 'pos_staff_id', 'pos_staff_name', 'pos_staff_role', 'pos_staff_color', 'pos_role_permissions', 'pos_role_name']
                  keys.forEach(k => localStorage.removeItem(k))
                  router.replace(slug ? `/pos/${slug}/login` : '/restaurant-login')
                }}
                className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-95"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Status Stepper ── */}
        <div className="mt-3 max-w-3xl mx-auto">
          {/* Main flow stepper — scrollable on small screens, big touch circles.
              dir="ltr" keeps the progress reading start→finish left-to-right
              regardless of the page's RTL locale, so the highlighted segment
              always makes sense against STATUS_FLOW's index order. */}
          <div className="overflow-x-auto pb-2 pt-3 rounded-2xl bg-white/[0.03] border border-white/5 px-3" style={{ scrollbarWidth: 'none' }} dir="ltr">
            <div className="flex items-start min-w-[420px]">
              {(['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'] as DeliveryStatus[]).map((s, idx) => {
                const cfg = STATUS_CFG[s]
                const Icon = cfg.icon
                const isActive = filter === s
                const count = counts[s] ?? 0
                const isLast = idx === 4

                return (
                  <div key={s} className={cn('flex items-start', !isLast && 'flex-1')}>
                    <button
                      onClick={() => setFilter(s)}
                      className="flex flex-col items-center gap-2 group flex-shrink-0 active:scale-95 transition-transform"
                    >
                      {/* Circle */}
                      <div className="relative">
                        <div className={cn(
                          'w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all',
                          isActive
                            ? 'bg-amber-500 border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.45)]'
                            : count > 0
                              ? 'bg-white/8 border-white/20 group-hover:bg-white/12 group-hover:border-white/30'
                              : 'bg-white/4 border-white/8 group-hover:bg-white/8'
                        )}>
                          <Icon className={cn(
                            'w-6 h-6 transition-colors',
                            isActive ? 'text-white' : count > 0 ? 'text-white/55 group-hover:text-white/75' : 'text-white/20'
                          )} />
                        </div>
                        {/* Count badge — visible on every step that has orders */}
                        {count > 0 && (
                          <span className={cn(
                            'absolute -top-1 -right-1 min-w-[20px] h-[20px] px-[4px] rounded-full text-[10px] font-bold flex items-center justify-center leading-none',
                            isActive ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                          )}>
                            {count}
                          </span>
                        )}
                      </div>
                      {/* Label */}
                      <span className={cn(
                        'text-[11px] font-semibold leading-tight text-center transition-colors max-w-[64px]',
                        isActive ? 'text-amber-400' : count > 0 ? 'text-white/45 group-hover:text-white/65' : 'text-white/18'
                      )}>
                        {s === 'out_for_delivery' ? <>On the<br/>Way</> : cfg.label}
                      </span>
                    </button>

                    {/* Connecting line — h-14 matches the circle so the line
                        crosses through its vertical center, not its top edge */}
                    {!isLast && (
                      <div className="flex-1 flex items-center h-14 px-1">
                        <div className={cn(
                          'w-full h-[2px] rounded-full transition-colors',
                          filter === s || STATUS_FLOW.indexOf(filter as DeliveryStatus) > idx
                            ? 'bg-amber-500/40'
                            : 'bg-white/10'
                        )} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Secondary pills: All + Cancelled */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'flex items-center gap-1.5 px-4 h-10 rounded-full text-xs font-bold border transition-all active:scale-95',
                filter === 'all'
                  ? 'bg-white/15 border-white/25 text-white'
                  : 'bg-white/5 border-white/8 text-white/35 hover:text-white/55 hover:bg-white/8'
              )}
            >
              All
              {(counts.all ?? 0) > 0 && (
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  filter === 'all' ? 'bg-white/20' : 'bg-white/10'
                )}>{counts.all}</span>
              )}
            </button>
            {((counts.cancelled ?? 0) > 0 || filter === 'cancelled') && (
              <button
                onClick={() => setFilter('cancelled')}
                className={cn(
                  'flex items-center gap-1.5 px-4 h-10 rounded-full text-xs font-bold border transition-all active:scale-95',
                  filter === 'cancelled'
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                    : 'bg-white/5 border-white/8 text-white/35 hover:text-white/55 hover:bg-white/8'
                )}
              >
                Cancelled
                {(counts.cancelled ?? 0) > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    filter === 'cancelled' ? 'bg-rose-500/20' : 'bg-white/10'
                  )}>{counts.cancelled}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 px-4 sm:px-6 py-5 max-w-3xl mx-auto w-full">

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-3">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key={`empty-${filter}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex flex-col items-center justify-center py-24 gap-4"
            >
              <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center">
                <Truck className="w-10 h-10 text-white/15" />
              </div>
              <p className="text-white/30 text-base">No {filter === 'all' ? '' : filter} delivery orders</p>
            </motion.div>
          ) : (
            <motion.div
              key={`list-${filter}`}
              variants={CONTAINER}
              initial="hidden"
              animate="show"
              className="space-y-4"
            >
        {filtered.map(order => {
          const cfg = STATUS_CFG[order.status]
          const StatusIcon = cfg.icon

          const grandTotal = order.order_total

          const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]
          const canAdvance = !!nextStatus && order.status !== 'delivered'
          const canCancel  = order.status !== 'delivered' && order.status !== 'cancelled'

          return (
            <motion.div
              key={order.delivery_id}
              variants={ITEM}
              className={cn(
                'relative rounded-3xl border overflow-hidden transition-all shadow-lg',
                order.status === 'pending' ? 'border-amber-500/40 bg-amber-500/[0.06] shadow-amber-900/20' :
                order.status === 'cancelled' ? 'border-white/8 bg-white/[0.02] opacity-60 shadow-none' :
                'border-white/10 bg-white/[0.035] shadow-black/20'
              )}
            >
              {/* Pending glow — draws the eye to what still needs action */}
              {order.status === 'pending' && (
                <motion.div
                  className="absolute inset-0 pointer-events-none rounded-3xl"
                  animate={{ boxShadow: ['inset 0 0 0 1px rgba(245,158,11,0)', 'inset 0 0 24px 2px rgba(245,158,11,0.18)', 'inset 0 0 0 1px rgba(245,158,11,0)'] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}

              {/* Status color strip — quick glance recognition */}
              <div className={cn('h-1.5 w-full bg-gradient-to-r', cfg.strip)} />

              {/* ── Card header ── */}
              <div className="px-5 pt-4 pb-3">
                {/* dir="ltr" pins this row to the left edge regardless of the
                    page's RTL locale — status/id/time are numeric/Latin data,
                    not Kurdish prose, so they read left-to-right. */}
                <div className="flex items-start gap-3 flex-wrap" dir="ltr">
                  {/* Status icon */}
                  <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0', cfg.bg)}>
                    <StatusIcon className={cn('w-6 h-6', cfg.color)} />
                  </div>

                  {/* Customer info */}
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-base sm:text-lg font-bold text-white truncate leading-tight">{order.customer_name}</p>
                        <span className="text-sm font-semibold text-white flex items-center gap-1.5 mt-0.5">
                          <motion.span
                            className="inline-flex"
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            <Clock className="w-4 h-4" />
                          </motion.span>
                          <TimeAgo dateStr={order.created_at} />
                        </span>
                      </div>
                      <div className="flex flex-col items-start gap-1 shrink-0">
                        {order.order_num && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white text-slate-900">
                            #{order.order_num}
                          </span>
                        )}
                        <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full border', cfg.bg, cfg.border, cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact pills — same row, pushed to the far end when there's room */}
                  <div className="flex items-center gap-2 flex-wrap ms-auto">
                    {order.latitude && order.longitude ? (
                      <a
                        href={directionsUrl(order.latitude, order.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={restaurant?.address ? `Directions from ${restaurant.address}` : (order.address_text ?? 'Get directions')}
                        className="flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/25 transition-all active:scale-95 text-sm font-semibold"
                      >
                        <Navigation className="w-4 h-4" />
                        Directions
                      </a>
                    ) : (
                      <span className="flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white/20 text-sm font-semibold">
                        <MapPin className="w-4 h-4" />
                        No GPS
                      </span>
                    )}
                    <div className="relative">
                      <button
                        onClick={() => {
                          loadWaTemplates()
                          setWhatsappDropdown(whatsappDropdown === order.delivery_id ? null : order.delivery_id)
                        }}
                        className="flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] hover:bg-[#25D366]/20 active:scale-95 transition-all text-sm font-semibold"
                      >
                        <WhatsAppIcon className="w-4 h-4" />
                        WhatsApp
                      </button>
                      {whatsappDropdown === order.delivery_id && (
                        <div className="absolute top-full right-0 mt-1.5 z-30 rounded-2xl border border-white/10 shadow-2xl overflow-hidden min-w-[220px]" style={{ background: '#0d1630' }}>
                          {waTemplates.length === 0 ? (
                            <div className="px-4 py-4 text-xs text-white/40 text-center">
                              No templates yet.<br />
                              <span className="text-[#25D366]">Settings → WhatsApp</span>
                            </div>
                          ) : waTemplates.map((tpl, i) => (
                            <a
                              key={tpl.id}
                              href={buildWhatsAppUrl(order, resolveTemplate(tpl.message, order, formatPrice))}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setWhatsappDropdown(null)}
                              className={cn(
                                'flex items-center gap-2.5 px-4 py-3.5 hover:bg-white/8 active:bg-white/12 transition-colors',
                                i < waTemplates.length - 1 ? 'border-b border-white/6' : ''
                              )}
                            >
                              <WhatsAppIcon className="w-4 h-4 text-[#25D366] shrink-0" />
                              <p className="text-sm font-semibold text-white truncate">{tpl.name}</p>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200 active:scale-95 transition-all text-sm font-semibold"
                    >
                      <Phone className="w-4 h-4" />
                      {order.customer_phone}
                    </a>
                  </div>

                  {/* Selfie thumbnail (clickable) */}
                  {order.selfie_url && (
                    <button
                      onClick={() => setSelfiePreview(order.selfie_url)}
                      title="View customer selfie"
                      className="shrink-0 relative overflow-hidden rounded-2xl border-2 border-emerald-500/50 hover:border-emerald-400 transition-all active:scale-95 group"
                      style={{ width: 48, height: 64 }}
                    >
                      <NextImage
                        src={order.selfie_url}
                        alt="Customer selfie"
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                      <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/15 transition-colors flex items-end justify-center pb-0.5 pointer-events-none">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Camera className="w-3.5 h-3.5 text-white drop-shadow" />
                        </div>
                      </div>
                    </button>
                  )}
                </div>

                {/* Total */}
                <div className="mt-3.5 pt-3.5 border-t border-white/6">
                  <p className="text-xl sm:text-2xl font-extrabold text-white leading-none">{formatPrice(grandTotal)}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {order.delivery_fee > 0 && (
                      <p className="text-[11px] text-white/30">+{formatPrice(order.delivery_fee)} fee</p>
                    )}
                    {(() => {
                      const sub = order.items.reduce((s, i) => s + i.item_price * i.qty, 0)
                      const disc = sub + order.delivery_fee - order.order_total
                      return disc > 0 ? (
                        <p className="text-[11px] text-emerald-400">−{formatPrice(disc)} discount</p>
                      ) : null
                    })()}
                  </div>
                </div>

              </div>

              {/* ── Items — always visible ── */}
              <div className="border-t border-white/6 divide-y divide-white/5">
                {order.items.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-3.5 text-sm text-white/25">
                    <UtensilsCrossed className="w-4 h-4" />
                    No items
                  </div>
                ) : order.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    {/* Item image — 3:2, tap to view full details */}
                    <button
                      onClick={() => setViewItem(item)}
                      title="View item details"
                      className="w-16 aspect-[3/2] rounded-xl overflow-hidden bg-white/6 border border-white/8 shrink-0 relative active:scale-95 transition-transform"
                    >
                      {item.image_url
                        ? <NextImage src={item.image_url} alt={item.item_name} fill className="object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-white/20" /></div>
                      }
                      <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center">
                        <Eye className="w-2.5 h-2.5 text-white" />
                      </span>
                    </button>
                    {/* Name + note */}
                    <div className="min-w-0">
                      <p className="text-sm sm:text-base font-semibold text-white/90 truncate">{item.item_name}</p>
                      {item.note && <p className="text-xs text-white truncate mt-0.5">{item.note}</p>}
                    </div>
                    {/* Qty — centered in the space between name and price */}
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-xs font-bold text-white/50 bg-white/6 border border-white/10 rounded-full px-2.5 py-1">
                        ×{item.qty}
                      </span>
                    </div>
                    {/* Price */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white/80">{formatPrice(item.item_price * item.qty)}</p>
                      <p className="text-xs text-white/30 mt-0.5">{formatPrice(item.item_price)}</p>
                    </div>
                  </div>
                ))}
                {/* Totals breakdown */}
                {(() => {
                  const itemsSubtotal = order.items.reduce((s, i) => s + i.item_price * i.qty, 0)
                  const computed      = itemsSubtotal + order.delivery_fee
                  const discount      = order.order_total > 0 && computed > order.order_total ? computed - order.order_total : 0
                  return (
                    <div className="px-5 pt-2.5 pb-4 space-y-1.5">
                      <div className="flex justify-between text-xs text-white/30">
                        <span>Subtotal</span>
                        <span>{formatPrice(itemsSubtotal)}</span>
                      </div>
                      {order.delivery_fee > 0 && (
                        <div className="flex justify-between text-xs text-white/30">
                          <span>Delivery Fee</span>
                          <span>{formatPrice(order.delivery_fee)}</span>
                        </div>
                      )}
                      {discount > 0 && (
                        <div className="flex justify-between text-xs text-emerald-400">
                          <span>Discount</span>
                          <span>−{formatPrice(discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-extrabold pt-1.5 border-t border-white/8">
                        <span className="text-white/60">Total</span>
                        <span className="text-white">{formatPrice(grandTotal)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* ── Driver picker (preparing only) ── */}
              {order.status === 'preparing' && (
                <div className="border-t border-white/6 px-5 py-3.5">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <UserRound className="w-3.5 h-3.5" />
                    Assign Driver
                  </p>
                  {drivers.length === 0 ? (
                    <p className="text-sm text-amber-400/70 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5">No active staff found — add staff in Settings → Users</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {drivers.map(d => (
                        <button
                          key={d.id}
                          onClick={() => setDriverPick(p => ({ ...p, [order.delivery_id]: d.id }))}
                          className={cn(
                            'flex items-center gap-2 px-4 h-12 rounded-xl text-sm font-bold border transition-all active:scale-95',
                            driverPick[order.delivery_id] === d.id
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
                          )}
                        >
                          <Truck className="w-4 h-4" />
                          {d.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Driver badge (out_for_delivery / delivered) */}
              {(order.status === 'out_for_delivery' || order.status === 'delivered') && order.driver_name && (
                <div className="border-t border-white/6 px-5 py-2.5 flex items-center gap-1.5 text-sm text-indigo-300">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span>Driver: <strong>{order.driver_name}</strong></span>
                </div>
              )}

              {/* ── Actions — big touch targets, primary CTA gets the most weight ── */}
              {(canAdvance || canCancel) && order.status !== 'cancelled' && (
                <div className="flex flex-col-reverse sm:flex-row gap-2.5 px-5 pb-5 pt-3">
                  <div className="flex gap-2.5 shrink-0">
                    {order.status === 'out_for_delivery' && (
                      <button
                        onClick={() => openInvoice(order)}
                        disabled={viewLoading === order.order_id}
                        className="flex items-center justify-center gap-1.5 px-4 h-14 rounded-2xl text-sm font-bold border border-white/12 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {viewLoading === order.order_id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <FileText className="w-4 h-4" />}
                        Invoice
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => setCancelTarget({ deliveryId: order.delivery_id, orderId: order.order_id, name: order.customer_name })}
                        disabled={processing.has(`${order.delivery_id}-cancelled`)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 h-14 rounded-2xl text-sm font-bold border border-rose-500/25 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {processing.has(`${order.delivery_id}-cancelled`)
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <X className="w-4 h-4" />}
                        Cancel
                      </button>
                    )}
                  </div>

                  {canAdvance && nextStatus && (
                    <button
                      onClick={() => {
                        const label = order.status === 'pending' ? 'Confirm & Approve'
                          : order.status === 'confirmed' ? 'Mark Preparing'
                          : order.status === 'preparing' ? 'Out for Delivery'
                          : order.status === 'out_for_delivery' ? 'Mark Delivered'
                          : STATUS_CFG[nextStatus].label
                        if (order.status === 'preparing') {
                          const selId = driverPick[order.delivery_id]
                          const driver = drivers.find(d => d.id === selId)
                          setAdvanceTarget({
                            deliveryId: order.delivery_id, orderId: order.order_id, nextStatus, label,
                            name: order.customer_name,
                            driver: driver ? { driver_id: driver.id, driver_name: driver.name } : undefined,
                          })
                        } else {
                          setAdvanceTarget({ deliveryId: order.delivery_id, orderId: order.order_id, nextStatus, label, name: order.customer_name })
                        }
                      }}
                      disabled={
                        processing.has(`${order.delivery_id}-${nextStatus}`) ||
                        (order.status === 'preparing' && drivers.length > 0 && !driverPick[order.delivery_id])
                      }
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 px-4 h-14 rounded-2xl text-sm sm:text-base font-extrabold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-lg',
                        order.status === 'pending'
                          ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-emerald-900/40 hover:brightness-110'
                          : 'bg-gradient-to-b from-indigo-400 to-indigo-600 text-white shadow-indigo-900/40 hover:brightness-110'
                      )}
                    >
                      {processing.has(`${order.delivery_id}-${nextStatus}`)
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : order.status === 'pending' ? <Check className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                      {order.status === 'pending' ? 'Confirm & Approve'
                        : order.status === 'confirmed' ? 'Mark Preparing'
                        : order.status === 'preparing' ? 'Out for Delivery'
                        : order.status === 'out_for_delivery' ? 'Mark Delivered'
                        : STATUS_CFG[nextStatus].label}
                    </button>
                  )}
                </div>
              )}

              {order.status === 'delivered' && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 px-5 pb-5 pt-3">
                  <div className="flex-1 flex items-center gap-2 px-4 h-14 rounded-2xl bg-emerald-500/8 border border-emerald-500/15">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-sm text-emerald-400 font-semibold">Order delivered successfully</p>
                  </div>
                  <button
                    onClick={() => openInvoice(order)}
                    disabled={viewLoading === order.order_id}
                    className="flex items-center justify-center gap-1.5 px-5 h-14 rounded-2xl text-sm font-bold border border-white/12 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    {viewLoading === order.order_id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <FileText className="w-4 h-4" />}
                    Invoice
                  </button>
                </div>
              )}
            </motion.div>
          )
        })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* WhatsApp language dropdown backdrop */}
      {whatsappDropdown && (
        <div className="fixed inset-0 z-20" onClick={() => setWhatsappDropdown(null)} />
      )}

      {/* ── Selfie Lightbox ── */}
      <AnimatePresence>
        {selfiePreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md"
            onClick={() => setSelfiePreview(null)}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="relative rounded-2xl overflow-hidden shadow-2xl"
              style={{ width: 'min(82vw, 320px)', aspectRatio: '9/16' }}
              onClick={e => e.stopPropagation()}
            >
              <NextImage
                src={selfiePreview}
                alt="Customer selfie"
                fill
                className="object-cover"
                sizes="320px"
              />
              {/* Close button */}
              <button
                onClick={() => setSelfiePreview(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-all active:scale-90 backdrop-blur-sm"
              >
                <X className="w-4 h-4" />
              </button>
              {/* Verified badge */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(52,211,153,0.18)', border: '1px solid rgba(52,211,153,0.45)', color: '#34d399', backdropFilter: 'blur(8px)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Liveness Verified
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Item Detail Modal ── */}
      <AnimatePresence>
        {viewItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
            onClick={() => setViewItem(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-white/10"
              style={{ background: '#0e1120' }}
              onClick={e => e.stopPropagation()}
              dir="ltr"
            >
              {/* Image */}
              <div className="relative w-full aspect-[3/2] bg-white/6">
                {viewItem.image_url
                  ? <NextImage src={viewItem.image_url} alt={viewItem.item_name} fill className="object-cover" sizes="384px" />
                  : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-10 h-10 text-white/15" /></div>
                }
                <button
                  onClick={() => setViewItem(null)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-all active:scale-90 backdrop-blur-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Details */}
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-lg font-bold text-white leading-snug">{viewItem.item_name}</p>
                  {viewItem.note && (
                    <div className="mt-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80 mb-1">Note</p>
                      <p className="text-sm text-white leading-relaxed">{viewItem.note}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/8 p-4 space-y-2">
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Quantity</span>
                    <span className="font-semibold text-white/80">×{viewItem.qty}</span>
                  </div>
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Unit Price</span>
                    <span className="font-semibold text-white/80">{formatPrice(viewItem.item_price)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold pt-2 border-t border-white/8">
                    <span className="text-white/60">Total</span>
                    <span className="text-white">{formatPrice(viewItem.item_price * viewItem.qty)}</span>
                  </div>
                </div>

                <button
                  onClick={() => setViewItem(null)}
                  className="w-full h-12 rounded-2xl text-sm font-bold text-white/60 border border-white/10 hover:bg-white/5 hover:text-white/80 active:scale-95 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cancel Confirm Modal ── */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setCancelTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0e1120] shadow-2xl p-6 space-y-5"
            onClick={e => e.stopPropagation()}
            dir="ltr"
          >
            {/* Icon + text */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/15 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-rose-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">Cancel this order?</p>
                <p className="text-sm text-white/40 mt-1.5">
                  Order for <span className="text-white/70 font-semibold">{cancelTarget.name}</span> will be cancelled and all pending items will be voided.
                </p>
                <p className="text-xs text-rose-400/70 mt-2">This action cannot be undone.</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 h-14 rounded-2xl text-sm font-bold text-white/50 border border-white/8 hover:bg-white/5 hover:text-white/70 active:scale-95 transition-all"
              >
                Keep Order
              </button>
              <button
                onClick={() => {
                  updateStatus(cancelTarget.deliveryId, cancelTarget.orderId, 'cancelled')
                  setCancelTarget(null)
                }}
                disabled={processing.has(`${cancelTarget.deliveryId}-cancelled`)}
                className="flex-1 h-14 rounded-2xl text-sm font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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

      {/* ── Advance Confirm Modal ── */}
      {advanceTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setAdvanceTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0e1120] shadow-2xl p-6 space-y-5"
            onClick={e => e.stopPropagation()}
            dir="ltr"
          >
            {/* Icon + text */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{advanceTarget.label}?</p>
                <p className="text-sm text-white/40 mt-1.5">
                  Order for <span className="text-white/70 font-semibold">{advanceTarget.name}</span> will move to{' '}
                  <span className="text-white/70 font-semibold">{STATUS_CFG[advanceTarget.nextStatus].label}</span>.
                  {advanceTarget.driver && <> Driver: <span className="text-white/70 font-semibold">{advanceTarget.driver.driver_name}</span>.</>}
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5">
              <button
                onClick={() => setAdvanceTarget(null)}
                className="flex-1 h-14 rounded-2xl text-sm font-bold text-white/50 border border-white/8 hover:bg-white/5 hover:text-white/70 active:scale-95 transition-all"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  updateStatus(advanceTarget.deliveryId, advanceTarget.orderId, advanceTarget.nextStatus, advanceTarget.driver)
                  setAdvanceTarget(null)
                }}
                disabled={processing.has(`${advanceTarget.deliveryId}-${advanceTarget.nextStatus}`)}
                className="flex-1 h-14 rounded-2xl text-sm font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {processing.has(`${advanceTarget.deliveryId}-${advanceTarget.nextStatus}`)
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Check className="w-4 h-4" />}
                Yes, {advanceTarget.label}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delivery invoice print modal (Out for Delivery) ──
          mode="payment" + autoPrint: fires the ESC/POS print immediately,
          same receipt as the order screen's post-payment print — no
          feedback write-in lines, since there's no counter customer to
          fill them in on a delivery order. ── */}
      {printInvoice && restaurantId && (
        <InvoiceViewModal
          invoice={printInvoice}
          restaurantId={restaurantId}
          mode="payment"
          autoPrint
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

      {/* ── Auto-generated WhatsApp status update toast ── */}
      {autoWhatsAppUrl && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 rounded-2xl bg-emerald-600 text-white pl-4 pr-2 py-2 shadow-2xl max-w-[92vw]">
          <WhatsAppIcon className="w-5 h-5 shrink-0" />
          <span className="text-sm hidden sm:inline">Status update ready to send</span>
          <a
            href={autoWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAutoWhatsAppUrl(null)}
            className="flex items-center h-11 px-4 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-sm font-bold whitespace-nowrap"
          >
            Send on WhatsApp
          </a>
          <button onClick={() => setAutoWhatsAppUrl(null)} className="w-11 h-11 flex items-center justify-center opacity-70 hover:opacity-100 active:scale-90 transition-all shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
    </ModuleGate>
  )
}
