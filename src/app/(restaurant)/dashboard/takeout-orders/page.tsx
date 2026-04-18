'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ModuleGate } from '@/components/ModuleGate'
import {
  ShoppingBag, Plus, X, Loader2, RefreshCw,
  Clock, CheckCircle2, Phone, User, ChevronRight,
  UtensilsCrossed, AlertCircle, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { assignOrderNumber } from '@/lib/orderNumber'
import InvoiceViewModal from '@/components/restaurant/invoice-view-modal'

interface TakeoutOrder {
  id: string
  order_num: string | null
  table_number: number
  total: number
  created_at: string
  status: string
  item_count: number
  customer_name: string | null
  customer_phone: string | null
}

function TimeAgo({ dateStr }: { dateStr: string }) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
      if (diff < 60)    setLabel(`${diff}s ago`)
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m ago`)
      else              setLabel(`${Math.floor(diff / 3600)}h ago`)
    }
    calc()
    const t = setInterval(calc, 10000)
    return () => clearInterval(t)
  }, [dateStr])
  return <span>{label}</span>
}

export default function TakeoutOrdersPage() {
  const supabase   = createClient()
  const router     = useRouter()
  const { formatPrice } = useDefaultCurrency()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [orders, setOrders]     = useState<TakeoutOrder[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState<'active' | 'all'>('active')
  const [lastRefresh, setLastRefresh] = useState(new Date())

  // New order modal
  const [showModal, setShowModal]   = useState(false)
  const [custName, setCustName]     = useState('')
  const [custPhone, setCustPhone]   = useState('')
  const [creating, setCreating]     = useState(false)
  const [createErr, setCreateErr]   = useState<string | null>(null)
  const loadRef = useRef<() => void>(() => {})

  // Invoice view for closed orders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewInvoice, setViewInvoice] = useState<any | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null) // order id being loaded

  const openClosedOrder = useCallback(async (order: TakeoutOrder) => {
    if (!order.order_num) return
    setInvoiceLoading(order.id)
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_num', order.order_num)
      .maybeSingle()
    setInvoiceLoading(null)
    if (data) setViewInvoice(data)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [takeoutEnabled, setTakeoutEnabled] = useState(true)

  const load = useCallback(async () => {
    const { data: rest } = await supabase.from('restaurants').select('id, settings').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = ((rest as any).settings ?? {}) as Record<string, unknown>
    setTakeoutEnabled(s.takeout_enabled !== false)

    const { data, error: err } = await supabase
      .from('orders')
      .select('id, order_num, table_number, total, created_at, status, customer_name, customer_phone')
      .eq('restaurant_id', rest.id)
      .eq('source', 'takeout')
      .order('created_at', { ascending: false })
      .limit(100)

    if (err) { setError(err.message); setLoading(false); return }

    const orderIds = (data ?? []).map((r: { id: string }) => r.id)
    const { data: itemCounts } = orderIds.length > 0
      ? await supabase.from('order_items').select('order_id').in('order_id', orderIds).neq('status', 'void')
      : { data: [] }

    const countMap: Record<string, number> = {}
    for (const row of (itemCounts ?? [])) {
      countMap[row.order_id] = (countMap[row.order_id] ?? 0) + 1
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: TakeoutOrder[] = (data ?? []).map((r: any) => ({
      id:             r.id,
      order_num:      r.order_num ?? null,
      table_number:   r.table_number,
      total:          r.total ?? 0,
      created_at:     r.created_at,
      status:         r.status,
      item_count:     countMap[r.id] ?? 0,
      customer_name:  r.customer_name ?? null,
      customer_phone: r.customer_phone ?? null,
    }))

    setOrders(mapped)
    setLastRefresh(new Date())
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('takeout-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadRef.current())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openModal = () => {
    setCustName(''); setCustPhone(''); setCreateErr(null); setShowModal(true)
  }

  const createOrder = async () => {
    if (!restaurantId) return
    setCreating(true); setCreateErr(null)

    // Virtual table number: use timestamp-based unique number in 70000–79999 range
    const virtualTable = 70000 + (Math.floor(Date.now() / 1000) % 9999)

    const { data: newOrder, error: err } = await supabase
      .from('orders')
      .insert({
        restaurant_id:  restaurantId,
        table_number:   virtualTable,
        status:         'active',
        source:         'takeout',
        total:          0,
        customer_name:  custName.trim() || null,
        customer_phone: custPhone.trim() || null,
      })
      .select('id')
      .single()

    if (err || !newOrder) { setCreateErr(err?.message ?? 'Failed to create order'); setCreating(false); return }

    await assignOrderNumber(supabase, restaurantId, newOrder.id)

    setShowModal(false)
    setCreating(false)

    const params = new URLSearchParams({ source: 'takeout' })
    if (custName.trim())  params.set('name',  custName.trim())
    if (custPhone.trim()) params.set('phone', custPhone.trim())
    router.push(`/dashboard/order/${virtualTable}?${params.toString()}`)
  }

  const filtered = filter === 'active'
    ? orders.filter(o => o.status === 'active')
    : orders

  const activeCount = orders.filter(o => o.status === 'active').length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <ModuleGate moduleKey="takeout">
    <div className="min-h-screen bg-[#060810] text-white flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-[#060810]/95 backdrop-blur-xl border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Takeout Orders</h1>
              <p className="text-[11px] text-white/40">
                {activeCount} active · refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setLoading(true); load() }}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mt-3 max-w-2xl mx-auto">
          <button
            onClick={() => setFilter('active')}
            className={cn('px-4 py-1.5 rounded-full text-xs font-semibold border transition-all',
              filter === 'active' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60')}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={cn('px-4 py-1.5 rounded-full text-xs font-semibold border transition-all',
              filter === 'all' ? 'bg-white/15 border-white/25 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60')}
          >
            All ({orders.length})
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 px-4 py-4 max-w-2xl mx-auto w-full space-y-3">

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* ── Add new takeout order card ── */}
        {takeoutEnabled ? (
          <button
            onClick={openModal}
            className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all active:scale-[0.98] group"
          >
            <div className="w-12 h-12 rounded-full bg-white/8 group-hover:bg-amber-500/20 flex items-center justify-center transition-all">
              <Plus className="w-6 h-6 text-white/30 group-hover:text-amber-400 transition-colors" />
            </div>
            <span className="text-sm font-semibold text-white/30 group-hover:text-amber-400 transition-colors">
              New Takeout Order
            </span>
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed border-white/6 bg-white/2">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-white/20" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-white/30">Takeout is disabled</p>
              <p className="text-xs text-white/20 mt-0.5">Enable it in Settings → Takeout</p>
            </div>
          </div>
        )}

        {/* ── Order list ── */}
        {filtered.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
              <UtensilsCrossed className="w-7 h-7 text-white/15" />
            </div>
            <p className="text-sm text-white/30">No {filter === 'active' ? 'active' : ''} takeout orders</p>
          </div>
        )}

        {filtered.map(order => {
          const isActive = order.status === 'active'
          return (
            <button
              key={order.id}
              onClick={() => {
                if (!isActive) { openClosedOrder(order); return }
                const p = new URLSearchParams({ source: 'takeout' })
                if (order.customer_name)  p.set('name',  order.customer_name)
                if (order.customer_phone) p.set('phone', order.customer_phone)
                router.push(`/dashboard/order/${order.table_number}?${p.toString()}`)
              }}
              className={cn(
                'w-full flex items-center gap-4 px-4 py-4 rounded-2xl border text-left transition-all active:scale-[0.98]',
                isActive
                  ? 'border-amber-500/30 bg-amber-500/8 hover:bg-amber-500/12'
                  : 'border-white/8 bg-white/3 hover:bg-white/5 opacity-60'
              )}
            >
              {/* Icon */}
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                isActive ? 'bg-amber-500/20' : 'bg-white/8')}>
                {invoiceLoading === order.id
                  ? <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
                  : isActive
                    ? <Clock className="w-5 h-5 text-amber-400" />
                    : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {order.order_num && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-white/8 text-white/40">
                      #{order.order_num}
                    </span>
                  )}
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border',
                    isActive
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400')}>
                    {isActive ? 'Active' : 'Closed'}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {order.customer_name
                    ? <span className="text-xs text-white/60 font-medium flex items-center gap-1"><User className="w-3 h-3" />{order.customer_name}</span>
                    : <span className="text-xs text-white/30 italic">Walk-in</span>
                  }
                  {order.customer_phone && (
                    <span className="text-[11px] text-white/30 flex items-center gap-1"><Phone className="w-3 h-3" />{order.customer_phone}</span>
                  )}
                  <span className="text-[11px] text-white/25 flex items-center gap-1">
                    <Clock className="w-3 h-3" /><TimeAgo dateStr={order.created_at} />
                  </span>
                  <span className="text-[11px] text-white/25">
                    {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Total + arrow */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-extrabold text-white">{formatPrice(order.total)}</span>
                <ChevronRight className="w-4 h-4 text-white/20" />
              </div>
            </button>
          )
        })}
      </div>

      {/* ── New Takeout Order Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0e1120] shadow-2xl p-6 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">New Takeout Order</h2>
                  <p className="text-xs text-white/40">Customer info is optional</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/40 hover:text-white/70 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Fields */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
                  Customer Name <span className="normal-case font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input
                    type="text"
                    value={custName}
                    onChange={e => setCustName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createOrder()}
                    placeholder="e.g. Ahmed"
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm text-white placeholder:text-white/20 outline-none transition-all bg-white/7 border border-white/10 focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
                  Phone <span className="normal-case font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={custPhone}
                    onChange={e => setCustPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createOrder()}
                    placeholder="+964 7XX XXX XXXX"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm text-white placeholder:text-white/20 outline-none transition-all bg-white/7 border border-white/10 focus:border-amber-500/50"
                  />
                </div>
              </div>
            </div>

            {createErr && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />{createErr}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white/40 border border-white/8 hover:bg-white/5 hover:text-white/60 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={createOrder}
                disabled={creating}
                className="flex-1 py-3 rounded-2xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25"
              >
                {creating
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Plus className="w-4 h-4" />}
                Start Order
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Invoice view modal for closed orders ── */}
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
