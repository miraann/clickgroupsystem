'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChefHat, Clock, Users, ShoppingBag,
  Plus, RefreshCw, LayoutGrid,
  LogOut, Bell, Settings, DollarSign,
  Utensils, Coffee, ChevronRight, Delete,
  CalendarDays, Phone, Check, AlertCircle, Loader2,
  ArrowRightLeft, Merge, Receipt, Printer, X as XIcon, Truck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

type TableStatus = 'available' | 'occupied' | 'reserved' | 'dirty' | 'bill_requested'

interface TableGroup { id: string; name: string; color: string }

interface Table {
  id: string
  number: number   // seq — used for order matching
  label: string    // display label e.g. T01
  capacity: number
  status: TableStatus
  guests?: number
  waiter?: string
  orderTotal?: number
  openedAt?: string
  shape: 'square' | 'round' | 'rect'
  group_id?: string | null
}


const STATUS_CONFIG = {
  available: {
    label: 'Available',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    glow: 'shadow-emerald-500/10',
    hover: 'hover:bg-emerald-500/25 hover:border-emerald-500/50',
  },
  occupied: {
    label: 'Occupied',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/35',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    glow: 'shadow-amber-500/20',
    hover: 'hover:bg-amber-500/25 hover:border-amber-500/55',
  },
  reserved: {
    label: 'Reserved',
    bg: 'bg-indigo-500/15',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    dot: 'bg-indigo-400',
    glow: 'shadow-indigo-500/10',
    hover: 'hover:bg-indigo-500/25 hover:border-indigo-500/50',
  },
  dirty: {
    label: 'Needs Cleaning',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    text: 'text-rose-400',
    dot: 'bg-rose-400',
    glow: 'shadow-rose-500/10',
    hover: 'hover:bg-rose-500/20 hover:border-rose-500/40',
  },
  bill_requested: {
    label: 'Bill Requested',
    bg: 'bg-red-500/20',
    border: 'border-red-500/60',
    text: 'text-red-400',
    dot: 'bg-red-400',
    glow: 'shadow-red-500/30',
    hover: 'hover:bg-red-500/30 hover:border-red-500/80',
  },
}

function TableTimer({ openedAt }: { openedAt: string }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    const calc = () => {
      const [h, m] = openedAt.split(':').map(Number)
      const now = new Date()
      const opened = new Date(now)
      opened.setHours(h, m, 0, 0)
      const diff = Math.max(0, Math.floor((now.getTime() - opened.getTime()) / 60000))
      if (diff >= 60) {
        setElapsed(`${Math.floor(diff / 60)}h ${diff % 60}m`)
      } else {
        setElapsed(`${diff}m`)
      }
    }
    calc()
    const t = setInterval(calc, 60000)
    return () => clearInterval(t)
  }, [openedAt])

  return <span>{elapsed}</span>
}

// ── Quick Action Menu ─────────────────────────────────────────
function QuickMenu({ table, onClose, onQuickPay, router }: {
  table: Table; onClose: () => void
  onQuickPay: (t: Table) => void
  router: ReturnType<typeof import('next/navigation').useRouter>
}) {
  const actions = [
    { icon: ArrowRightLeft, label: 'Move Table',   color: 'text-blue-400',    onClick: () => { onClose() } },
    { icon: Merge,          label: 'Merge Tables',  color: 'text-violet-400',  onClick: () => { onClose() } },
    { icon: Receipt,        label: 'Quick Pay',     color: 'text-amber-400',   onClick: () => { onClose(); onQuickPay(table) } },
    { icon: Printer,        label: 'Print Bill',    color: 'text-emerald-400', onClick: () => { onClose() } },
    { icon: XIcon,          label: 'Cancel',        color: 'text-white/40',    onClick: onClose },
  ]
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[55] flex items-center justify-center"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="relative bg-[#0d1220]/95 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden w-72"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold border',
              STATUS_CONFIG[table.status].bg, STATUS_CONFIG[table.status].border, STATUS_CONFIG[table.status].text)}>
              {table.label}
            </div>
            <div>
              <p className="text-sm font-bold text-white">Table {table.label}</p>
              <p className={cn('text-xs font-semibold', STATUS_CONFIG[table.status].text)}>{STATUS_CONFIG[table.status].label}</p>
            </div>
          </div>
          <div className="p-2">
            {actions.map(a => (
              <button key={a.label} onClick={a.onClick}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/6 active:scale-95 transition-all text-left">
                <a.icon className={cn('w-4 h-4 shrink-0', a.color)} />
                <span className={cn('text-sm font-medium', a.color)}>{a.label}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Enhanced Table Card ────────────────────────────────────────
function TableCard({ table, onSelect, onLongPress, formatPrice }: {
  table: Table
  onSelect: (t: Table) => void
  onLongPress: (t: Table) => void
  cur: string
  formatPrice: (n: number) => string
}) {
  const cfg = STATUS_CONFIG[table.status]
  const isRound = table.shape === 'round'
  const isRect  = table.shape === 'rect'
  const isBillReq = table.status === 'bill_requested'

  // Long-press detection
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  const startPress = () => {
    didLongPress.current = false
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onLongPress(table)
    }, 600)
  }
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }
  const handleClick = () => {
    if (!didLongPress.current) onSelect(table)
  }

  const w = isRound
    ? (table.status === 'occupied' || isBillReq ? 110 : 90)
    : isRect
      ? (table.status === 'occupied' || isBillReq ? 190 : 175)
      : (table.status === 'occupied' || isBillReq ? 110 : 90)
  const h = table.status === 'occupied' || isBillReq ? 110 : 90

  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileTap={{ scale: 0.93 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onClick={handleClick}
      style={{ width: w, height: h }}
      className={cn(
        'relative border backdrop-blur-xl p-3 text-left shrink-0 touch-manipulation shadow-lg flex flex-col',
        isRound ? 'rounded-full items-center justify-center text-center' : 'rounded-2xl',
        cfg.bg, cfg.border, cfg.glow, cfg.hover,
        isBillReq && 'animate-pulse',
      )}
    >
      {/* Glow overlay for bill_requested */}
      {isBillReq && (
        <div className="absolute inset-0 rounded-2xl bg-red-500/10 animate-ping pointer-events-none" />
      )}

      {isRound ? (
        <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full">
          <span className={cn('text-sm font-bold', cfg.text)}>{table.label}</span>
          <span className={cn('text-[9px] font-bold uppercase tracking-wider', cfg.text)}>{cfg.label}</span>
          {(table.status === 'occupied' || isBillReq) && (
            <>
              <span className="text-[10px] text-white/60 tabular-nums font-semibold">{table.orderTotal != null ? formatPrice(table.orderTotal) : ''}</span>
              <span className="text-[9px] text-white/35"><TableTimer openedAt={table.openedAt!} /></span>
            </>
          )}
          {table.status === 'available' && <span className="text-[9px] text-white/30">{table.capacity} seats</span>}
          <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 2 }}
            className={cn('w-1.5 h-1.5 rounded-full mt-0.5', cfg.dot)} />
        </div>
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between mb-1.5">
            <div className={cn('px-2 py-0.5 rounded-lg border text-xs font-bold', cfg.bg, cfg.border, cfg.text)}>
              {table.label}
            </div>
            <motion.div animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: isBillReq ? 0.8 : 2.5 }}
              className={cn('w-2 h-2 rounded-full', cfg.dot)} />
          </div>

          {/* Status label */}
          <p className={cn('text-[9px] font-bold uppercase tracking-widest mb-auto', cfg.text)}>
            {isBillReq ? '⚠ Bill Requested' : cfg.label}
          </p>

          {/* Occupied / Bill Requested info */}
          {(table.status === 'occupied' || isBillReq) && (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-white/40" />
                  <span className="text-xs text-white/70">{table.guests ?? 0}</span>
                </div>
                <span className="text-[10px] text-white/40 tabular-nums"><TableTimer openedAt={table.openedAt!} /></span>
              </div>
              <p className={cn('text-sm font-bold tabular-nums', isBillReq ? 'text-red-400' : 'text-white')}>
                {table.orderTotal != null ? formatPrice(table.orderTotal) : '—'}
              </p>
            </div>
          )}

          {/* Available */}
          {table.status === 'available' && (
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3 text-white/20" />
              <span className="text-xs text-white/30">{table.capacity}</span>
            </div>
          )}

          {/* Reserved */}
          {table.status === 'reserved' && <p className="text-[10px] text-indigo-300/60 font-medium">Reserved</p>}

          {/* Dirty */}
          {table.status === 'dirty' && <p className="text-[10px] text-rose-300/50 font-medium">Cleaning</p>}
        </>
      )}
    </motion.button>
  )
}

export default function TablesPage() {
  const router = useRouter()
  const { symbol: cur, formatPrice } = useDefaultCurrency()
  const [filter, setFilter] = useState<TableStatus | 'all'>('all')
  const [groupFilter, setGroupFilter] = useState<string | 'all'>('all')
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [guestTable, setGuestTable] = useState<Table | null>(null)
  const [reservationDetail, setReservationDetail] = useState<{ id: string; guest_name: string; guest_phone: string | null; party_size: number; date: string; time: string; note: string | null; status: string } | null>(null)
  const [quickMenuTable, setQuickMenuTable] = useState<Table | null>(null)
  const [time, setTime] = useState(new Date())
  const [restaurant, setRestaurant] = useState<{ name: string; logo_url: string | null } | null>(null)
  const [groups, setGroups] = useState<TableGroup[]>([])
  const [activeOrders, setActiveOrders]   = useState<Map<number, { guests: number; total: number; openedAt: string }>>(new Map())
  const [dbTableLayout, setDbTableLayout] = useState<{ id: string; number: number; label: string; capacity: number; shape: 'square' | 'round' | 'rect'; group_id: string | null }[]>([])
  const [reservedTableIds, setReservedTableIds] = useState<Set<string>>(new Set())
  const [pendingCount, setPendingCount]   = useState(0)
  const [deliveryCount, setDeliveryCount] = useState(0)

  const fetchOrders = useCallback(async () => {
    const supabase = createClient()
    const { data: rest } = await supabase.from('restaurants').select('id, name, logo_url').limit(1).maybeSingle()
    if (!rest) return
    setRestaurant({ name: rest.name, logo_url: rest.logo_url })

    const today = new Date().toISOString().slice(0, 10)
    const [{ data: dbTables }, { data: orders }, { data: grps }, { count: pendingCnt }, { data: todayRes }, { count: deliveryCnt }] = await Promise.all([
      supabase.from('tables').select('id, seq, table_number, capacity, shape, group_id').eq('restaurant_id', rest.id).eq('active', true).order('table_number'),
      supabase.from('orders').select('id, table_number, guests, total, created_at').eq('restaurant_id', rest.id).eq('status', 'active'),
      supabase.from('table_groups').select('id, name, color').eq('restaurant_id', rest.id).order('sort_order'),
      supabase.from('order_items').select('id, orders!inner(source)', { count: 'exact', head: true }).eq('status', 'pending').not('orders.source', 'eq', 'delivery'),
      supabase.from('reservations').select('table_id').eq('restaurant_id', rest.id).eq('date', today).in('status', ['pending', 'confirmed']),
      supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('restaurant_id', rest.id).eq('status', 'pending'),
    ])
    // Build reserved table IDs set
    const resSet = new Set<string>((todayRes ?? []).map((r: { table_id: string | null }) => r.table_id).filter(Boolean) as string[])
    setReservedTableIds(resSet)
    setPendingCount(pendingCnt ?? 0)
    setDeliveryCount(deliveryCnt ?? 0)
    if (grps && grps.length > 0) {
      setGroups(grps as TableGroup[])
      setGroupFilter(f => f === 'all' ? grps[0].id : f)
    }

    // Build order map — only include orders that have at least one non-void item
    const map = new Map<number, { guests: number; total: number; openedAt: string }>()
    const orderIds = (orders ?? []).map(o => o.id)
    if (orderIds.length > 0) {
      const { data: activeItems } = await supabase
        .from('order_items')
        .select('order_id')
        .in('order_id', orderIds)
        .neq('status', 'void')
      const activeOrderIds = new Set((activeItems ?? []).map(i => i.order_id))

      // Auto-close orders that have no non-void items left
      const staleIds = orderIds.filter(id => !activeOrderIds.has(id))
      if (staleIds.length > 0) {
        await supabase.from('orders')
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .in('id', staleIds)
      }

      orders?.filter(o => activeOrderIds.has(o.id)).forEach(o => {
        map.set(Number(o.table_number), {
          guests:   o.guests ?? 0,
          total:    o.total  ?? 0,
          openedAt: new Date(o.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        })
      })
    }
    setActiveOrders(map)

    if (dbTables && dbTables.length > 0) {
      setDbTableLayout(dbTables.map(t => ({
        id:       t.id,
        number:   t.seq,
        label:    t.table_number ?? String(t.seq),
        capacity: t.capacity ?? 4,
        shape:    (t.shape === 'Rectangle' ? 'rect' : (t.shape ?? 'Square').toLowerCase()) as 'square' | 'round' | 'rect',
        group_id: t.group_id ?? null,
      })))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fetchRef = useRef(fetchOrders)
  useEffect(() => { fetchRef.current = fetchOrders }, [fetchOrders])

  useEffect(() => {
    fetchRef.current()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchRef.current() }
    const onFocus   = () => fetchRef.current()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    const supabase = createClient()
    const channel = supabase
      .channel('dashboard-tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
        () => fetchRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' },
        () => fetchRef.current())
      .subscribe()

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const tables: Table[] = dbTableLayout.map(t => {
    const order = activeOrders.get(t.number)
    if (order) return { ...t, status: 'occupied' as const, guests: order.guests, orderTotal: order.total, openedAt: order.openedAt }
    if (reservedTableIds.has(t.id)) return { ...t, status: 'reserved' as const }
    return { ...t, status: 'available' as const }
  })

  const openOrder = (table: Table, guests?: number) => {
    router.push(`/dashboard/order/${table.number}${guests ? `?guests=${guests}` : ''}`)
  }

  const filtered = tables.filter(t =>
    (filter === 'all' || t.status === filter) &&
    (groupFilter === 'all' || t.group_id === groupFilter)
  )

  const counts = {
    available: tables.filter(t => t.status === 'available').length,
    occupied:  tables.filter(t => t.status === 'occupied').length,
    reserved:  tables.filter(t => t.status === 'reserved').length,
    dirty:     tables.filter(t => t.status === 'dirty').length,
  }

  return (
    <div className="min-h-screen bg-[#060810] flex flex-col">

      {/* Fixed top bar */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#060810]/80 backdrop-blur-2xl">
        <div className="flex items-center justify-between px-5 py-3">
          {/* Left: restaurant + user */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0 overflow-hidden">
              {restaurant?.logo_url
                ? <img src={restaurant.logo_url} alt="logo" className="w-full h-full object-cover" />
                : <ChefHat className="w-5 h-5 text-white" />}
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">{restaurant?.name ?? '...'}</p>
              <p className="text-xs text-white/30 mt-0.5">POS System</p>
            </div>
          </div>

          {/* Center: clock */}
          <div className="text-center">
            <p className="text-xl font-bold text-white tabular-nums">
              {time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}
            </p>
            <p className="text-xs text-white/25 tabular-nums">
              {time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <Link href="/dashboard/reports" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95">
              <DollarSign className="w-4.5 h-4.5" size={18} />
            </Link>
            <Link href="/dashboard/staff" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95">
              <Users className="w-4.5 h-4.5" size={18} />
            </Link>
            <Link href="/dashboard/pending-orders" className={cn(
              'w-10 h-10 rounded-xl border flex items-center justify-center transition-all active:scale-95 relative',
              pendingCount > 0
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:bg-white/10'
            )}>
              <Bell size={18} />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg shadow-amber-500/40">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
            <Link href="/dashboard/kds" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all active:scale-95" title="Kitchen Display">
              <ChefHat size={18} />
            </Link>
            <Link href="/dashboard/guests" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all active:scale-95" title="Guest Tracking">
              <Users size={18} />
            </Link>
            <Link href="/pos" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-95">
              <LogOut size={18} />
            </Link>
          </div>
        </div>

        {/* Summary stats row */}
        <div className="grid grid-cols-4 divide-x divide-white/5 border-t border-white/5">
          {[
            { label: 'Available', count: counts.available, color: 'text-emerald-400', status: 'available' as const },
            { label: 'Occupied', count: counts.occupied, color: 'text-amber-400', status: 'occupied' as const },
            { label: 'Reserved', count: counts.reserved, color: 'text-indigo-400', status: 'reserved' as const },
            { label: 'Cleaning', count: counts.dirty, color: 'text-rose-400', status: 'dirty' as const },
          ].map(s => (
            <button
              key={s.status}
              onClick={() => setFilter(filter === s.status ? 'all' : s.status)}
              className={cn(
                'flex items-center justify-center gap-2 py-2.5 transition-all active:scale-95',
                filter === s.status ? 'bg-white/5' : 'hover:bg-white/3'
              )}
            >
              <span className={cn('text-lg font-bold tabular-nums', s.color)}>{s.count}</span>
              <span className="text-xs text-white/30">{s.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 p-4">
        {/* Group tabs */}
        {groups.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setGroupFilter('all')}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95',
                groupFilter === 'all' ? 'bg-white/15 text-white border border-white/20' : 'bg-white/5 text-white/40 border border-white/8 hover:text-white/70'
              )}
            >
              All Zones
            </button>
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => setGroupFilter(groupFilter === g.id ? 'all' : g.id)}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 border',
                  groupFilter === g.id ? 'text-white' : 'bg-white/5 text-white/40 border-white/8 hover:text-white/70'
                )}
                style={groupFilter === g.id ? { backgroundColor: g.color + '25', borderColor: g.color + '60', color: g.color } : {}}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-white/30" />
            <span className="text-sm font-medium text-white/50">
              {filter === 'all' && groupFilter === 'all'
                ? `All Tables (${tables.length})`
                : `${filtered.length} table${filtered.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <button
            onClick={() => { setFilter('all'); setGroupFilter('all') }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all active:scale-95',
              filter !== 'all' || groupFilter !== 'all' ? 'bg-white/10 text-white/70 border border-white/15' : 'text-white/25'
            )}
          >
            <RefreshCw className="w-3 h-3" />
            {filter !== 'all' || groupFilter !== 'all' ? 'Show all' : 'All shown'}
          </button>
        </div>

        {/* Tables grid */}
        <div className="flex flex-wrap gap-2">
          {filtered.map(table => (
            <TableCard key={table.id} table={table} onSelect={async t => {
              if (t.status === 'reserved') {
                const supabase = createClient()
                const today = new Date().toISOString().slice(0, 10)
                const { data } = await supabase.from('reservations').select('id,guest_name,guest_phone,party_size,date,time,note,status').eq('table_id', t.id).eq('date', today).in('status', ['pending','confirmed']).order('time').limit(1).maybeSingle()
                if (data) { setReservationDetail(data as typeof reservationDetail); return }
              }
              if (t.status === 'available' || t.status === 'reserved') setGuestTable(t)
              else setSelectedTable(t)
            }} onLongPress={t => setQuickMenuTable(t)} cur={cur} formatPrice={formatPrice} />
          ))}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 z-30 border-t border-white/8 bg-[#060810]/90 backdrop-blur-2xl px-4 py-3">
        <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto">
          <button className="flex items-center justify-center gap-2 h-12 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-sm font-semibold transition-all shadow-lg shadow-amber-500/25 touch-manipulation">
            <Plus className="w-4 h-4" />
            New Order
          </button>
          <Link
            href="/dashboard/delivery-orders"
            className={cn(
              'relative flex items-center justify-center gap-2 h-12 rounded-xl border text-sm font-semibold transition-all active:scale-95 touch-manipulation',
              deliveryCount > 0
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30'
                : 'bg-white/8 border-white/12 text-white/70 hover:bg-white/12'
            )}
          >
            <Truck className="w-4 h-4" />
            Delivery
            {deliveryCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg shadow-indigo-500/40">
                {deliveryCount > 99 ? '99+' : deliveryCount}
              </span>
            )}
          </Link>
          <Link href="/dashboard/settings" className="flex items-center justify-center gap-2 h-12 rounded-xl bg-white/8 border border-white/12 hover:bg-white/12 active:scale-95 text-white/70 text-sm font-medium transition-all touch-manipulation">
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </div>
      </div>

      {/* Long-press quick menu */}
      {quickMenuTable && (
        <QuickMenu
          table={quickMenuTable}
          onClose={() => setQuickMenuTable(null)}
          onQuickPay={t => { setQuickMenuTable(null); openOrder(t) }}
          router={router}
        />
      )}

      {/* Guest count numpad */}
      {guestTable && (
        <GuestNumpad
          table={guestTable}
          onConfirm={guests => { setGuestTable(null); openOrder(guestTable, guests) }}
          onClose={() => setGuestTable(null)}
        />
      )}

      {/* Reservation detail modal */}
      {reservationDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setReservationDetail(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-80 rounded-3xl border border-indigo-500/25 bg-[#0d1220]/98 backdrop-blur-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-5 py-4 bg-indigo-500/10 border-b border-indigo-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-0.5">Reservation</p>
                  <p className="text-lg font-bold text-indigo-400">Reserved Table</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-indigo-400" />
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-2xl bg-white/4 border border-white/8 divide-y divide-white/5">
                {[
                  ['Guest',      reservationDetail.guest_name],
                  ['Phone',      reservationDetail.guest_phone ?? '—'],
                  ['Date',       new Date(reservationDetail.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })],
                  ['Time',       reservationDetail.time],
                  ['Guest Num', `${reservationDetail.party_size} guests`],
                  ['Status',     reservationDetail.status.charAt(0).toUpperCase() + reservationDetail.status.slice(1)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-xs text-white/35 shrink-0">{label}</span>
                    <span className="text-xs text-white/80 font-semibold text-right truncate">{value}</span>
                  </div>
                ))}
                {reservationDetail.note && (
                  <div className="px-4 py-2.5">
                    <span className="text-xs text-white/35 block mb-1">Note</span>
                    <span className="text-xs text-white/60 italic">{reservationDetail.note}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  const supabase = createClient()
                  await supabase.from('reservations').update({ status: 'seated' }).eq('id', reservationDetail.id)
                  setReservationDetail(null)
                  fetchOrders()
                }}
                className="h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <Users className="w-4 h-4" />Seat Guests
              </button>
              <button
                onClick={async () => {
                  const supabase = createClient()
                  await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', reservationDetail.id)
                  setReservationDetail(null)
                  fetchOrders()
                }}
                className="h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                Cancel
              </button>
            </div>

            <div className="px-5 pb-4">
              <button onClick={() => setReservationDetail(null)}
                className="w-full h-9 rounded-xl bg-white/5 border border-white/10 text-white/40 text-sm font-medium active:scale-95 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table detail sheet */}
      {selectedTable && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setSelectedTable(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/15 bg-[#0d1220]/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Pull handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className={cn(
              'px-6 py-5 border-b border-white/8',
              STATUS_CONFIG[selectedTable.status].bg
            )}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">Table {selectedTable.label}</p>
                  <p className={cn('text-xl font-bold', STATUS_CONFIG[selectedTable.status].text)}>
                    {STATUS_CONFIG[selectedTable.status].label}
                  </p>
                </div>
                <div className={cn('w-14 h-14 rounded-2xl border flex items-center justify-center text-2xl font-bold text-white', STATUS_CONFIG[selectedTable.status].bg, STATUS_CONFIG[selectedTable.status].border)}>
                  {selectedTable.label}
                </div>
              </div>

              {selectedTable.status === 'occupied' && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[
                    { icon: Users, label: 'Guests', value: `${selectedTable.guests}` },
                    { icon: Clock, label: 'Time', value: selectedTable.openedAt! },
                    { icon: DollarSign, label: 'Total', value: selectedTable.orderTotal != null ? formatPrice(selectedTable.orderTotal) : '' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <s.icon className="w-4 h-4 text-white/30 mx-auto mb-1" />
                      <p className="text-base font-bold text-white">{s.value}</p>
                      <p className="text-xs text-white/30">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 grid grid-cols-2 gap-3">
              {selectedTable.status === 'available' && (
                <>
                  <button
                    onClick={() => { setGuestTable(selectedTable); setSelectedTable(null) }}
                    className="col-span-2 h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 touch-manipulation">
                    <Utensils className="w-5 h-5" />
                    Open Table
                  </button>
                  <button className="h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm font-medium flex items-center justify-center gap-2 active:scale-95 transition-all touch-manipulation">
                    <Coffee className="w-4 h-4" />
                    Reserve
                  </button>
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="h-12 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium flex items-center justify-center active:scale-95 transition-all touch-manipulation"
                  >
                    Cancel
                  </button>
                </>
              )}

              {selectedTable.status === 'occupied' && (
                <>
                  <button
                    onClick={() => openOrder(selectedTable)}
                    className="col-span-2 h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 touch-manipulation">
                    <ShoppingBag className="w-5 h-5" />
                    View Order
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openOrder(selectedTable)}
                    className="h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium flex items-center justify-center gap-2 active:scale-95 transition-all touch-manipulation">
                    <DollarSign className="w-4 h-4" />
                    Pay Bill
                  </button>
                  <button
                    onClick={() => openOrder(selectedTable)}
                    className="h-12 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium flex items-center justify-center gap-2 active:scale-95 transition-all touch-manipulation">
                    <Plus className="w-4 h-4" />
                    Add Items
                  </button>
                </>
              )}

              {selectedTable.status === 'reserved' && (
                <>
                  <button
                    onClick={() => { setGuestTable(selectedTable); setSelectedTable(null) }}
                    className="col-span-2 h-14 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 touch-manipulation">
                    <Utensils className="w-5 h-5" />
                    Seat Guests
                  </button>
                  <button className="h-12 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 text-sm font-medium flex items-center justify-center active:scale-95 transition-all touch-manipulation">
                    Cancel Reservation
                  </button>
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="h-12 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium flex items-center justify-center active:scale-95 transition-all touch-manipulation"
                  >
                    Close
                  </button>
                </>
              )}

              {selectedTable.status === 'dirty' && (
                <>
                  <button className="col-span-2 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 touch-manipulation">
                    <RefreshCw className="w-5 h-5" />
                    Mark as Clean
                  </button>
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="col-span-2 h-12 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium flex items-center justify-center active:scale-95 transition-all touch-manipulation"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Guest Numpad ──────────────────────────────────────────────
function GuestNumpad({
  table, onConfirm, onClose,
}: {
  table: Table
  onConfirm: (guests: number) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [value, setValue]           = useState('')
  const [view, setView]             = useState<'numpad' | 'reserve'>('numpad')
  const [resName, setResName]       = useState('')
  const [resPhone, setResPhone]     = useState('')
  const [resDate, setResDate]       = useState(new Date().toISOString().slice(0, 10))
  const [resTime, setResTime]       = useState('')
  const [resParty, setResParty]     = useState(2)
  const [resNote, setResNote]       = useState('')
  const [resSaving, setResSaving]   = useState(false)
  const [resSaved, setResSaved]     = useState(false)
  const [resErr, setResErr]         = useState<string | null>(null)

  const cfg = STATUS_CONFIG[table.status]

  const press = (key: string) => {
    if (key === '⌫') { setValue(v => v.slice(0, -1)); return }
    if (value.length >= 2) return
    const next = value + key
    if (parseInt(next) > 20) return
    setValue(next)
  }

  const confirm = () => {
    const n = parseInt(value)
    onConfirm(n >= 1 ? n : 0)
  }

  const handleReserve = async () => {
    if (!resName.trim()) { setResErr('Guest name is required'); return }
    if (!resDate)        { setResErr('Date is required'); return }
    if (!resTime)        { setResErr('Time is required'); return }
    setResSaving(true); setResErr(null)
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest?.id) { setResErr('Restaurant not found'); setResSaving(false); return }
    const { error } = await supabase.from('reservations').insert({
      restaurant_id: rest.id,
      guest_name:    resName.trim(),
      guest_phone:   resPhone.trim() || null,
      party_size:    resParty,
      date:          resDate,
      time:          resTime,
      table_id:      table.id ?? null,
      table_label:   table.label,
      note:          resNote.trim() || null,
      status:        'confirmed',
    })
    if (error) { setResErr(error.message); setResSaving(false); return }
    setResSaving(false); setResSaved(true)
    setTimeout(() => onClose(), 1500)
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','⌫','0','✓']

  // ── Table header (shared) ──────────────────────────────────
  const TableHeader = (
    <div className={cn('px-5 py-4 border-b border-white/8', cfg.bg)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-0.5">Table {table.label}</p>
          <p className={cn('text-lg font-bold', cfg.text)}>{cfg.label}</p>
        </div>
        <div className={cn('w-12 h-12 rounded-2xl border flex items-center justify-center text-lg font-bold text-white', cfg.bg, cfg.border)}>
          {table.label}
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-80 rounded-3xl border border-white/15 bg-[#0d1220]/98 backdrop-blur-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {TableHeader}

        {view === 'numpad' ? (
          <>
            {/* Guest count header */}
            <div className="px-6 pt-5 pb-4 text-center border-b border-white/8">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mx-auto mb-2.5">
                <Users className="w-5 h-5 text-amber-400" />
              </div>
              <p className="text-base font-bold text-white">How many guests?</p>
              <p className="text-xs text-white/30 mt-0.5">Up to {table.capacity}</p>
            </div>

            {/* Display */}
            <div className="flex items-center justify-center h-16 border-b border-white/8">
              <span className={cn('text-5xl font-bold tabular-nums transition-all', value ? 'text-white' : 'text-white/15')}>
                {value || '0'}
              </span>
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-px bg-white/5 border-t border-white/8">
              {KEYS.map(k => (
                <button key={k} onClick={() => k === '✓' ? confirm() : press(k)}
                  className={cn(
                    'h-14 text-xl font-semibold flex items-center justify-center transition-all active:scale-95 touch-manipulation',
                    k === '✓' ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20'
                      : k === '⌫' ? 'bg-[#0d1220] text-rose-400/70 hover:bg-rose-500/10'
                      : 'bg-[#0d1220] text-white/80 hover:bg-white/8'
                  )}>
                  {k === '⌫' ? <Delete className="w-5 h-5" /> : k}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="grid grid-cols-2 gap-2 p-3 border-t border-white/8">
              <button
                onClick={() => setView('reserve')}
                className="h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 text-sm font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-all touch-manipulation"
              >
                <Coffee className="w-4 h-4" />Reserve
              </button>
              <button onClick={onClose}
                className="h-10 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium flex items-center justify-center active:scale-95 transition-all touch-manipulation">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Reserve form */}
            <div className="px-5 pt-4 pb-2 border-b border-white/8 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-400" />
              <p className="text-sm font-bold text-white">Reserve Table {table.label}</p>
            </div>

            {resSaved ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-sm font-bold text-emerald-400">Reservation Confirmed!</p>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {/* Name */}
                <div>
                  <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">Guest Name <span className="text-rose-400">*</span></p>
                  <input value={resName} onChange={e => setResName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/40 transition-colors" />
                </div>

                {/* Phone */}
                <div>
                  <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">Phone</p>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    <input value={resPhone} onChange={e => setResPhone(e.target.value)}
                      placeholder="07xx…" type="tel"
                      className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/40 transition-colors" />
                  </div>
                </div>

                {/* Date + Time */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">Date <span className="text-rose-400">*</span></p>
                    <input value={resDate} onChange={e => setResDate(e.target.value)} type="date"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white/70 focus:outline-none focus:border-indigo-500/40 [color-scheme:dark] cursor-pointer" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">Time <span className="text-rose-400">*</span></p>
                    <input value={resTime} onChange={e => setResTime(e.target.value)} type="time"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white/70 focus:outline-none focus:border-indigo-500/40 [color-scheme:dark] cursor-pointer" />
                  </div>
                </div>

                {/* Party size */}
                <div>
                  <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">Guest Num</p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setResParty(v => Math.max(1, v - 1))}
                      className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-95 transition-all text-lg font-bold">−</button>
                    <span className="flex-1 text-center text-lg font-bold text-indigo-400">{resParty}</span>
                    <button onClick={() => setResParty(v => Math.min(table.capacity, v + 1))}
                      className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 active:scale-95 transition-all text-lg font-bold">+</button>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">Note</p>
                  <input value={resNote} onChange={e => setResNote(e.target.value)}
                    placeholder="Special requests…"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/40 transition-colors" />
                </div>

                {resErr && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />{resErr}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            {!resSaved && (
              <div className="grid grid-cols-2 gap-2 p-3 border-t border-white/8">
                <button onClick={() => setView('numpad')}
                  className="h-10 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium flex items-center justify-center active:scale-95 transition-all">
                  Back
                </button>
                <button onClick={handleReserve} disabled={resSaving}
                  className="h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all">
                  {resSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {resSaving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
