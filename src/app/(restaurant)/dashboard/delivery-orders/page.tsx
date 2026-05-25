'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import NextImage from 'next/image'
import { mutate as swrMutate } from 'swr'
import { useDeliveryOrders } from '@/hooks/useDeliveryOrders'
import { ModuleGate } from '@/components/ModuleGate'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import { getStaffHome } from '@/lib/permissions/staffHome'
import {
  Truck, Phone, MapPin, Clock, Check, X, Loader2,
  RefreshCw, Package,
  CheckCircle2, XCircle, AlertCircle,
  Navigation, UtensilsCrossed, FileText, Home, MonitorSmartphone, UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { logAudit, type AuditAction } from '@/lib/logAudit'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
}
const ITEM: Variants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'circOut' as const } },
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
}

interface Driver {
  id: string
  name: string
  phone: string | null
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

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

function buildWhatsAppUrl(order: DeliveryOrder, formatPrice: (n: number) => string, lang: 'en' | 'ar' | 'ku'): string {
  let phone = order.customer_phone.replace(/\D/g, '')
  if (phone.startsWith('07') && phone.length === 11) phone = '964' + phone.slice(1)
  else if (phone.startsWith('7') && phone.length === 10) phone = '964' + phone

  const itemsSubtotal = order.items.reduce((s, i) => s + i.item_price * i.qty, 0)
  const discount = order.order_total > 0 && (itemsSubtotal + order.delivery_fee) > order.order_total
    ? itemsSubtotal + order.delivery_fee - order.order_total : 0
  const itemLines = order.items.map(i => `• ${i.item_name} ×${i.qty} — ${formatPrice(i.item_price * i.qty)}`).join('\n')

  let msg = ''
  if (lang === 'en') {
    msg = [
      `Hello ${order.customer_name}! 👋`,
      `We received your order${order.order_num ? ` #${order.order_num}` : ''} and would like to confirm it with you.`,
      '', `🛍️ Your items:`, itemLines, '',
      `💳 Subtotal: ${formatPrice(itemsSubtotal)}`,
      ...(order.delivery_fee > 0 ? [`🚚 Delivery fee: ${formatPrice(order.delivery_fee)}`] : []),
      ...(discount > 0 ? [`🎉 Discount: −${formatPrice(discount)}`] : []),
      `💰 Total to pay: ${formatPrice(order.order_total)}`, '',
      `Please reply *YES* to confirm your order, or let us know if you'd like any changes. Thank you! 🙏`,
    ].join('\n')
  } else if (lang === 'ar') {
    msg = [
      `مرحباً ${order.customer_name}! 👋`,
      `لقد استلمنا طلبك${order.order_num ? ` رقم #${order.order_num}` : ''} ونود تأكيده معك.`,
      '', `🛍️ طلبك:`, itemLines, '',
      `💳 المجموع الفرعي: ${formatPrice(itemsSubtotal)}`,
      ...(order.delivery_fee > 0 ? [`🚚 رسوم التوصيل: ${formatPrice(order.delivery_fee)}`] : []),
      ...(discount > 0 ? [`🎉 الخصم: −${formatPrice(discount)}`] : []),
      `💰 الإجمالي للدفع: ${formatPrice(order.order_total)}`, '',
      `يرجى الرد بـ *نعم* لتأكيد طلبك، أو أخبرنا إذا كنت تريد أي تغييرات. شكراً! 🙏`,
    ].join('\n')
  } else {
    msg = [
      `سڵاو ${order.customer_name}! 👋`,
      `داواکارییەکەت${order.order_num ? ` ژمارە #${order.order_num}` : ''} وەرگرتین و دەمانەوێت پشتڕاستیکردنەوەی لەگەڵت بکەین.`,
      '', `🛍️ بڕگەکانت:`, itemLines, '',
      `💳 کۆی بڕگەکان: ${formatPrice(itemsSubtotal)}`,
      ...(order.delivery_fee > 0 ? [`🚚 کرێی گەیاندن: ${formatPrice(order.delivery_fee)}`] : []),
      ...(discount > 0 ? [`🎉 داشکاندن: −${formatPrice(discount)}`] : []),
      `💰 کۆی دەبێت بدەیت: ${formatPrice(order.order_total)}`, '',
      `تکایە *بەڵێ* بنووسە بۆ پشتڕاستکردنەوەی داواکارییەکەت، یان ئەگەر دەتەوێت گۆڕانکارییەک بکەی ئاگامانداربکە. سوپاس! 🙏`,
    ].join('\n')
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
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
  const { can, isOwner, permissions, loading: permsLoading } = usePermissions()

  useEffect(() => {
    if (permsLoading || isOwner) return
    if (!can('delivery')) router.replace(getStaffHome(permissions))
  }, [permsLoading, isOwner, permissions, can, router])

  // Read restaurantId from localStorage immediately so SWR can serve cache on re-mount
  const [restaurantId, setRestaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

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
  const [drivers, setDrivers]     = useState<Driver[]>([])
  const [driverPick, setDriverPick] = useState<Record<string, string>>({})
  const [whatsappDropdown, setWhatsappDropdown] = useState<string | null>(null)
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
    // If restaurantId not yet known, resolve it first
    if (!restaurantId) {
      const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
      if (!rest) { setError('Restaurant not found'); setLoading(false); return }
      setRestaurantId(rest.id)
    }
    // Trigger SWR revalidation — it re-runs the fetcher and updates state via the effect above
    await reloadOrders()
    setLastRefresh(new Date())
  }, [restaurantId, reloadOrders]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => {
    // Initial load via SWR (already triggered by useDeliveryOrders)
    const channel = supabase
      .channel('delivery-orders-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => reloadOrders())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_orders' }, () => reloadOrders())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'delivery_orders' }, () => reloadOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all active staff as assignable drivers
  useEffect(() => {
    if (!restaurantId) return
    async function fetchDrivers() {
      const { data } = await supabase
        .from('staff')
        .select('id, name, phone')
        .eq('restaurant_id', restaurantId!)
        .eq('status', 'active')
        .order('name', { ascending: true })
      setDrivers((data ?? []).map(s => ({ id: s.id, name: s.name, phone: s.phone ?? null })))
    }
    fetchDrivers()
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const { data: restSettings } = await supabase
        .from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
      const autoDeduct = (restSettings?.settings as Record<string, unknown> | null)?.inventory_auto_deduct === true
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

  const mapsUrl = (lat: number, lng: number) =>
    `https://www.google.com/maps?q=${lat},${lng}`

  if (loading) return (
    <ModuleGate moduleKey="delivery">
      <div className="min-h-screen text-white" style={{ background: 'var(--app-bg, #022658)' }}>
        <div className="px-4 pt-8 pb-4 max-w-2xl mx-auto space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-44" />)}
        </div>
      </div>
    </ModuleGate>
  )

  return (
    <ModuleGate moduleKey="delivery">
    <div className="min-h-screen text-white flex flex-col" style={{ background: 'var(--app-bg, #022658)' }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 backdrop-blur-xl border-b border-white/8 px-4 py-3" style={{ background: 'var(--app-anchor-95, rgba(2,38,88,0.95))' }}>
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard/driver')}
              className="flex items-center gap-2 px-5 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/25 transition-all active:scale-95 text-sm font-semibold"
            >
              <MonitorSmartphone className="w-5 h-5" />
              Driver
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95"
            >
              <Home className="w-5 h-5" />
            </button>
            <button
              onClick={() => { setLoading(true); load() }}
              className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Status Stepper ── */}
        <div className="mt-3 max-w-2xl mx-auto">
          {/* Main flow stepper — scrollable on small screens */}
          <div className="overflow-x-auto pb-1 pt-2" style={{ scrollbarWidth: 'none' }}>
            <div className="flex items-start min-w-[340px]">
              {(['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'] as DeliveryStatus[]).map((s, idx) => {
                const cfg = STATUS_CFG[s]
                const Icon = cfg.icon
                const isActive = filter === s
                const count = counts[s] ?? 0
                const isLast = idx === 4

                return (
                  <div key={s} className="flex items-start flex-1">
                    <button
                      onClick={() => setFilter(s)}
                      className="flex flex-col items-center gap-1.5 group flex-shrink-0 active:scale-95 transition-transform"
                    >
                      {/* Circle */}
                      <div className="relative">
                        <div className={cn(
                          'w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all',
                          isActive
                            ? 'bg-amber-500 border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                            : count > 0
                              ? 'bg-white/8 border-white/20 group-hover:bg-white/12 group-hover:border-white/30'
                              : 'bg-white/4 border-white/8 group-hover:bg-white/8'
                        )}>
                          <Icon className={cn(
                            'w-5 h-5 transition-colors',
                            isActive ? 'text-white' : count > 0 ? 'text-white/55 group-hover:text-white/75' : 'text-white/20'
                          )} />
                        </div>
                        {/* Count badge — visible on every step that has orders */}
                        {count > 0 && (
                          <span className={cn(
                            'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-[3px] rounded-full text-[9px] font-bold flex items-center justify-center leading-none',
                            isActive ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                          )}>
                            {count}
                          </span>
                        )}
                      </div>
                      {/* Label */}
                      <span className={cn(
                        'text-[10px] font-semibold leading-tight text-center transition-colors max-w-[56px]',
                        isActive ? 'text-amber-400' : count > 0 ? 'text-white/45 group-hover:text-white/65' : 'text-white/18'
                      )}>
                        {s === 'out_for_delivery' ? <>On the<br/>Way</> : cfg.label}
                      </span>
                    </button>

                    {/* Connecting line */}
                    {!isLast && (
                      <div className="flex-1 flex items-center pb-[22px] px-1">
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
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all active:scale-95',
                filter === 'all'
                  ? 'bg-white/15 border-white/25 text-white'
                  : 'bg-white/5 border-white/8 text-white/35 hover:text-white/55 hover:bg-white/8'
              )}
            >
              All
              {(counts.all ?? 0) > 0 && (
                <span className={cn(
                  'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                  filter === 'all' ? 'bg-white/20' : 'bg-white/10'
                )}>{counts.all}</span>
              )}
            </button>
            {((counts.cancelled ?? 0) > 0 || filter === 'cancelled') && (
              <button
                onClick={() => setFilter('cancelled')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all active:scale-95',
                  filter === 'cancelled'
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                    : 'bg-white/5 border-white/8 text-white/35 hover:text-white/55 hover:bg-white/8'
                )}
              >
                Cancelled
                {(counts.cancelled ?? 0) > 0 && (
                  <span className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                    filter === 'cancelled' ? 'bg-rose-500/20' : 'bg-white/10'
                  )}>{counts.cancelled}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 px-4 py-4 max-w-2xl mx-auto w-full">

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-3">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key={`empty-${filter}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.05, duration: 0.38, ease: 'circOut' }}
              className="flex flex-col items-center justify-center py-20 gap-3"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                <Truck className="w-8 h-8 text-white/15" />
              </div>
              <p className="text-white/30 text-sm">No {filter === 'all' ? '' : filter} delivery orders</p>
            </motion.div>
          ) : (
            <motion.div
              key={`list-${filter}`}
              variants={CONTAINER}
              initial="hidden"
              animate="show"
              className="space-y-3"
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
                'rounded-2xl border overflow-hidden transition-all',
                order.status === 'pending' ? 'border-amber-500/40 bg-amber-500/5' :
                order.status === 'cancelled' ? 'border-white/8 bg-white/2 opacity-60' :
                'border-white/10 bg-white/3'
              )}
            >
              {/* ── Card header ── */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start gap-3">
                  {/* Status icon */}
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
                      <a href={`tel:${order.customer_phone}`} className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 transition-colors">
                        <Phone className="w-3 h-3" />
                        {order.customer_phone}
                      </a>
                      <div className="relative">
                        <button
                          onClick={() => setWhatsappDropdown(whatsappDropdown === order.delivery_id ? null : order.delivery_id)}
                          className="flex items-center gap-1 text-xs text-[#25D366] hover:text-[#1fbd5a] transition-colors"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                          WhatsApp
                        </button>
                        {whatsappDropdown === order.delivery_id && (
                          <div className="absolute top-full left-0 mt-1.5 z-30 rounded-xl border border-white/10 shadow-2xl overflow-hidden min-w-[148px]" style={{ background: '#0d1630' }}>
                            {([
                              { lang: 'ku' as const, label: 'کوردی', sub: 'Kurdish' },
                              { lang: 'ar' as const, label: 'عربی', sub: 'Arabic' },
                              { lang: 'en' as const, label: 'English', sub: 'English' },
                            ]).map(({ lang, label, sub }, i, arr) => (
                              <a
                                key={lang}
                                href={buildWhatsAppUrl(order, formatPrice, lang)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setWhatsappDropdown(null)}
                                className={cn(
                                  'flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/8 transition-colors',
                                  i < arr.length - 1 ? 'border-b border-white/6' : ''
                                )}
                              >
                                <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366] shrink-0" />
                                <div>
                                  <p className="text-xs font-semibold text-white leading-none">{label}</p>
                                  <p className="text-[10px] text-white/35 mt-0.5">{sub}</p>
                                </div>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-white/30 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <TimeAgo dateStr={order.created_at} />
                      </span>
                    </div>
                  </div>

                  {/* Total + location button */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="text-sm font-extrabold text-white">{formatPrice(grandTotal)}</p>
                    {order.delivery_fee > 0 && (
                      <p className="text-[10px] text-white/30">+{formatPrice(order.delivery_fee)} fee</p>
                    )}
                    {(() => {
                      const sub = order.items.reduce((s, i) => s + i.item_price * i.qty, 0)
                      const disc = sub + order.delivery_fee - order.order_total
                      return disc > 0 ? (
                        <p className="text-[10px] text-emerald-400">−{formatPrice(disc)} discount</p>
                      ) : null
                    })()}
                    {order.latitude && order.longitude ? (
                      <a
                        href={mapsUrl(order.latitude, order.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={order.address_text ?? 'Open in Google Maps'}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/25 transition-all active:scale-95 text-sm font-semibold"
                      >
                        <Navigation className="w-5 h-5" />
                        Map
                      </a>
                    ) : (
                      <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/20 text-sm">
                        <MapPin className="w-5 h-5" />
                        No GPS
                      </span>
                    )}
                  </div>
                </div>

                {/* Address text (compact) */}
                {order.address_text && (
                  <p className="mt-2 text-[11px] text-white/35 leading-relaxed line-clamp-2 pl-12">
                    {order.address_text}
                  </p>
                )}
              </div>

              {/* ── Items — always visible ── */}
              <div className="border-t border-white/6 divide-y divide-white/5">
                {order.items.length === 0 ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-xs text-white/25">
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                    No items
                  </div>
                ) : order.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    {/* Item image */}
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/6 border border-white/8 shrink-0 relative">
                      {item.image_url
                        ? <NextImage src={item.image_url} alt={item.item_name} fill className="object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-4 h-4 text-white/20" /></div>
                      }
                    </div>
                    {/* Name + note */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/90 truncate">{item.item_name}</p>
                      {item.note && <p className="text-[10px] text-white/30 truncate mt-0.5">{item.note}</p>}
                    </div>
                    {/* Qty × price */}
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-white/80">{formatPrice(item.item_price * item.qty)}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">×{item.qty} · {formatPrice(item.item_price)}</p>
                    </div>
                  </div>
                ))}
                {/* Totals breakdown */}
                {(() => {
                  const itemsSubtotal = order.items.reduce((s, i) => s + i.item_price * i.qty, 0)
                  const computed      = itemsSubtotal + order.delivery_fee
                  const discount      = order.order_total > 0 && computed > order.order_total ? computed - order.order_total : 0
                  return (
                    <div className="px-4 pt-2 pb-3 space-y-1.5">
                      <div className="flex justify-between text-[11px] text-white/30">
                        <span>Subtotal</span>
                        <span>{formatPrice(itemsSubtotal)}</span>
                      </div>
                      {order.delivery_fee > 0 && (
                        <div className="flex justify-between text-[11px] text-white/30">
                          <span>Delivery Fee</span>
                          <span>{formatPrice(order.delivery_fee)}</span>
                        </div>
                      )}
                      {discount > 0 && (
                        <div className="flex justify-between text-[11px] text-emerald-400">
                          <span>Discount</span>
                          <span>−{formatPrice(discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-white/8">
                        <span className="text-white/60">Total</span>
                        <span className="text-white">{formatPrice(grandTotal)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* ── Driver picker (preparing only) ── */}
              {order.status === 'preparing' && (
                <div className="border-t border-white/6 px-4 py-3">
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <UserRound className="w-3 h-3" />
                    Assign Driver
                  </p>
                  {drivers.length === 0 ? (
                    <p className="text-xs text-amber-400/70 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">No active staff found — add staff in Settings → Users</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {drivers.map(d => (
                        <button
                          key={d.id}
                          onClick={() => setDriverPick(p => ({ ...p, [order.delivery_id]: d.id }))}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95',
                            driverPick[order.delivery_id] === d.id
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
                          )}
                        >
                          <Truck className="w-3.5 h-3.5" />
                          {d.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Driver badge (out_for_delivery / delivered) */}
              {(order.status === 'out_for_delivery' || order.status === 'delivered') && order.driver_name && (
                <div className="border-t border-white/6 px-4 py-2 flex items-center gap-1.5 text-xs text-indigo-300">
                  <Truck className="w-3.5 h-3.5 shrink-0" />
                  <span>Driver: <strong>{order.driver_name}</strong></span>
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
                      onClick={() => {
                        if (order.status === 'preparing') {
                          const selId = driverPick[order.delivery_id]
                          const driver = drivers.find(d => d.id === selId)
                          updateStatus(order.delivery_id, order.order_id, nextStatus,
                            driver ? { driver_id: driver.id, driver_name: driver.name } : undefined)
                        } else {
                          updateStatus(order.delivery_id, order.order_id, nextStatus)
                        }
                      }}
                      disabled={
                        processing.has(`${order.delivery_id}-${nextStatus}`) ||
                        (order.status === 'preparing' && drivers.length > 0 && !driverPick[order.delivery_id])
                      }
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
    </ModuleGate>
  )
}
