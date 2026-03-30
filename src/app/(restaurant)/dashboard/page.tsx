'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChefHat, Clock, Users, ShoppingBag,
  Plus, RefreshCw, LayoutGrid,
  LogOut, Bell, Settings, DollarSign,
  Utensils, Coffee, ChevronRight, Delete,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

type TableStatus = 'available' | 'occupied' | 'reserved' | 'dirty'

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

function TableCard({ table, onSelect, formatPrice }: { table: Table; onSelect: (t: Table) => void; cur: string; formatPrice: (n: number) => string }) {
  const cfg = STATUS_CONFIG[table.status]
  const isRound = table.shape === 'round'
  const isRect  = table.shape === 'rect'
  return (
    <button
      onClick={() => onSelect(table)}
      className={cn(
        'relative border backdrop-blur-xl p-3 text-left transition-all duration-200',
        'active:scale-95 touch-manipulation shadow-lg flex flex-col',
        isRound
          ? cn('rounded-full items-center justify-center text-center shrink-0', table.status === 'occupied' ? 'w-[110px] h-[110px]' : 'w-[90px] h-[90px]')
          : isRect
            ? cn('rounded-xl shrink-0', table.status === 'occupied' ? 'w-[190px] h-[110px]' : 'w-[175px] h-[90px]')
            : cn('rounded-xl shrink-0', table.status === 'occupied' ? 'w-[110px] h-[110px]' : 'w-[90px] h-[90px]'),
        cfg.bg, cfg.border, cfg.glow, cfg.hover,
      )}
    >
      {isRound ? (
        /* ── Round: fully centered layout ── */
        <div className="flex flex-col items-center justify-center gap-1 w-full h-full">
          <span className={cn('text-sm font-bold', cfg.text)}>{table.label}</span>
          <span className={cn('text-[9px] font-bold uppercase tracking-wider', cfg.text)}>{cfg.label}</span>
          {table.status === 'occupied' && (
            <>
              <span className="text-xs text-white/60 tabular-nums">{table.orderTotal != null ? formatPrice(table.orderTotal) : ''}</span>
              <span className="text-[9px] text-white/35 tabular-nums"><TableTimer openedAt={table.openedAt!} /></span>
            </>
          )}
          {table.status === 'available' && (
            <span className="text-[9px] text-white/30">{table.capacity} seats</span>
          )}
          <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse mt-0.5', cfg.dot)} />
        </div>
      ) : (
        /* ── Square / Rectangle: standard layout ── */
        <>
          <div className="flex items-center justify-between mb-2">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold', cfg.bg, cfg.border, 'border', cfg.text)}>
              {table.label}
            </div>
            <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', cfg.dot)} />
          </div>

          <p className={cn('text-[10px] font-bold uppercase tracking-wider mb-auto', cfg.text)}>
            {cfg.label}
          </p>

          {table.status === 'occupied' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-white/40" />
                  <span className="text-xs text-white/70">{table.guests}</span>
                </div>
                <span className="text-xs text-white/40 tabular-nums"><TableTimer openedAt={table.openedAt!} /></span>
              </div>
              <p className="text-xs font-bold text-white tabular-nums">{table.orderTotal != null ? formatPrice(table.orderTotal) : ''}</p>
            </div>
          )}
          {table.status === 'available' && (
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3 text-white/20" />
              <span className="text-xs text-white/30">{table.capacity}</span>
            </div>
          )}
          {table.status === 'reserved' && <p className="text-xs text-indigo-300/50">Reserved</p>}
          {table.status === 'dirty'    && <p className="text-xs text-rose-300/40">Cleaning</p>}
        </>
      )}
    </button>
  )
}

export default function TablesPage() {
  const router = useRouter()
  const { symbol: cur, formatPrice } = useDefaultCurrency()
  const [filter, setFilter] = useState<TableStatus | 'all'>('all')
  const [groupFilter, setGroupFilter] = useState<string | 'all'>('all')
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [guestTable, setGuestTable] = useState<Table | null>(null)
  const [time, setTime] = useState(new Date())
  const [restaurant, setRestaurant] = useState<{ name: string; logo_url: string | null } | null>(null)
  const [groups, setGroups] = useState<TableGroup[]>([])
  const [activeOrders, setActiveOrders]   = useState<Map<number, { guests: number; total: number; openedAt: string }>>(new Map())
  const [dbTableLayout, setDbTableLayout] = useState<{ id: string; number: number; label: string; capacity: number; shape: 'square' | 'round' | 'rect'; group_id: string | null }[]>([])
  const [pendingCount, setPendingCount]   = useState(0)

  const fetchOrders = useCallback(async () => {
    const supabase = createClient()
    const { data: rest } = await supabase.from('restaurants').select('id, name, logo_url').limit(1).maybeSingle()
    if (!rest) return
    setRestaurant({ name: rest.name, logo_url: rest.logo_url })

    const [{ data: dbTables }, { data: orders }, { data: grps }, { count: pendingCnt }] = await Promise.all([
      supabase.from('tables').select('seq, table_number, capacity, shape, group_id').eq('restaurant_id', rest.id).eq('active', true).order('table_number'),
      supabase.from('orders').select('table_number, guests, total, created_at').eq('restaurant_id', rest.id).eq('status', 'active'),
      supabase.from('table_groups').select('id, name, color').eq('restaurant_id', rest.id).order('sort_order'),
      supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    setPendingCount(pendingCnt ?? 0)
    if (grps && grps.length > 0) {
      setGroups(grps as TableGroup[])
      setGroupFilter(f => f === 'all' ? grps[0].id : f)
    }

    // Build order map
    const map = new Map<number, { guests: number; total: number; openedAt: string }>()
    orders?.forEach(o => {
      map.set(Number(o.table_number), {
        guests:   o.guests ?? 0,
        total:    o.total  ?? 0,
        openedAt: new Date(o.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      })
    })
    setActiveOrders(map)

    if (dbTables && dbTables.length > 0) {
      setDbTableLayout(dbTables.map(t => ({
        id:       `db-${t.seq}`,
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
    return order
      ? { ...t, status: 'occupied' as const, guests: order.guests, orderTotal: order.total, openedAt: order.openedAt }
      : { ...t, status: 'available' as const }
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
              {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </p>
            <p className="text-xs text-white/25 tabular-nums">
              {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
            <TableCard key={table.id} table={table} onSelect={setSelectedTable} cur={cur} formatPrice={formatPrice} />
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
          <button className="flex items-center justify-center gap-2 h-12 rounded-xl bg-white/8 border border-white/12 hover:bg-white/12 active:scale-95 text-white/70 text-sm font-medium transition-all touch-manipulation">
            <ShoppingBag className="w-4 h-4" />
            Takeaway
          </button>
          <Link href="/dashboard/settings" className="flex items-center justify-center gap-2 h-12 rounded-xl bg-white/8 border border-white/12 hover:bg-white/12 active:scale-95 text-white/70 text-sm font-medium transition-all touch-manipulation">
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </div>
      </div>

      {/* Guest count numpad */}
      {guestTable && (
        <GuestNumpad
          table={guestTable}
          onConfirm={guests => { setGuestTable(null); openOrder(guestTable, guests) }}
          onClose={() => setGuestTable(null)}
        />
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
  const [value, setValue] = useState('')

  const press = (key: string) => {
    if (key === '⌫') { setValue(v => v.slice(0, -1)); return }
    if (value.length >= 2) return
    const next = value + key
    if (parseInt(next) > 20) return
    setValue(next)
  }

  const confirm = () => {
    const n = parseInt(value)
    if (n >= 1) onConfirm(n)
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','⌫','0','✓']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-80 rounded-3xl border border-white/15 bg-[#0d1220]/98 backdrop-blur-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-7 pb-5 text-center border-b border-white/8">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-amber-400" />
          </div>
          <p className="text-base font-bold text-white">How many guests?</p>
          <p className="text-xs text-white/30 mt-1">Table {table.label} · Up to {table.capacity}</p>
        </div>

        {/* Display */}
        <div className="flex items-center justify-center h-20 border-b border-white/8">
          <span className={cn(
            'text-5xl font-bold tabular-nums transition-all',
            value ? 'text-white' : 'text-white/15'
          )}>
            {value || '0'}
          </span>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-px bg-white/5 border-t border-white/8">
          {KEYS.map(k => (
            <button
              key={k}
              onClick={() => k === '✓' ? confirm() : press(k)}
              className={cn(
                'h-16 text-xl font-semibold flex items-center justify-center transition-all active:scale-95 touch-manipulation',
                k === '✓'
                  ? value && parseInt(value) >= 1
                    ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20'
                    : 'bg-white/3 text-white/15 cursor-not-allowed'
                  : k === '⌫'
                    ? 'bg-[#0d1220] text-rose-400/70 hover:bg-rose-500/10'
                    : 'bg-[#0d1220] text-white/80 hover:bg-white/8'
              )}
            >
              {k === '⌫' ? <Delete className="w-5 h-5" /> : k}
            </button>
          ))}
        </div>

        {/* Skip */}
        <button
          onClick={() => onConfirm(0)}
          className="w-full py-4 text-xs text-white/25 hover:text-white/45 transition-all touch-manipulation"
        >
          Skip guest count
        </button>
      </div>
    </div>
  )
}
