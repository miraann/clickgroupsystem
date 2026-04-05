'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChefHat, RefreshCw, Check, CheckCheck, Clock, Wifi, WifiOff, Flame, Bell, Layers, AlertTriangle, X, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Station {
  id: string
  name: string
  color: string
  active: boolean
  sort_order: number
  category_ids: string[]
}

interface KdsItem {
  id: string
  item_name: string
  qty: number
  note: string | null
  status: 'sent' | 'cooking' | 'ready'
  station_id: string | null   // written at order time from kds_station_categories
  category_id: string | null  // from menu_items join (not always present — fallback to station_id)
  created_at: string
  sent_at: string | null
  cooking_started_at: string | null
  ready_at: string | null
}

interface KdsOrder {
  order_id: string
  order_num: string | null
  table_label: string
  group_label: string | null
  items: KdsItem[]
  oldest_at: string
}

function useElapsed(isoDate: string, intervalMs = 10000) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000))
    tick()
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [isoDate, intervalMs])
  return elapsed
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function fmtBetween(from: string, to: string): string {
  return fmtDuration(Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 1000)))
}

function LiveTimer({ from }: { from: string }) {
  const secs = useElapsed(from, 1000)
  return <span>{fmtDuration(secs)}</span>
}

function ElapsedBadge({ isoDate }: { isoDate: string }) {
  const secs = useElapsed(isoDate)
  const mins = Math.floor(secs / 60)
  const label = mins < 1 ? 'just now' : `${mins}m`
  return (
    <span className={cn(
      'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full',
      mins < 10 ? 'bg-emerald-500/20 text-emerald-400'
        : mins < 20 ? 'bg-amber-500/20 text-amber-400'
        : 'bg-rose-500/20 text-rose-400 animate-pulse'
    )}>
      <Clock className="w-3 h-3" />
      {label}
    </span>
  )
}

function ItemRow({
  item,
  busy,
  onAction,
}: {
  item: KdsItem
  busy: boolean
  onAction: (itemId: string, nextStatus: 'cooking' | 'ready') => void
}) {
  const isReady   = item.status === 'ready'
  const isCooking = item.status === 'cooking'
  const nextStatus = item.status === 'sent' ? 'cooking' : 'ready'

  const pendingTime = item.sent_at && item.cooking_started_at
    ? fmtBetween(item.sent_at, item.cooking_started_at)
    : null

  const cookingDone = item.cooking_started_at && item.ready_at
    ? fmtBetween(item.cooking_started_at, item.ready_at)
    : null

  return (
    <div className={cn(
      'flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all',
      isReady ? 'opacity-50' : 'bg-white/5',
    )}>
      <span className={cn(
        'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-extrabold mt-0.5',
        isReady ? 'bg-white/5 text-white/30' : 'bg-amber-500/20 text-amber-400'
      )}>
        {item.qty}
      </span>

      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold leading-tight', isReady ? 'line-through text-white/30' : 'text-white')}>
          {item.item_name}
        </p>
        {item.note && <p className="text-sm font-semibold text-rose-400 mt-1">⚠ {item.note}</p>}

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {pendingTime && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400/80">
              <Clock className="w-2.5 h-2.5" />
              Wait {pendingTime}
            </span>
          )}
          {isCooking && item.cooking_started_at && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 animate-pulse">
              <Flame className="w-2.5 h-2.5" />
              <LiveTimer from={item.cooking_started_at} />
            </span>
          )}
          {isReady && cookingDone && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400/70">
              <Flame className="w-2.5 h-2.5" />
              Cooked {cookingDone}
            </span>
          )}
        </div>
      </div>

      {isReady ? (
        <div className="shrink-0 w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center mt-0.5">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        </div>
      ) : (
        <button
          onClick={() => onAction(item.id, nextStatus as 'cooking' | 'ready')}
          disabled={busy}
          className={cn(
            'shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 mt-0.5',
            nextStatus === 'cooking'
              ? 'bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
          )}
        >
          {busy
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            : nextStatus === 'cooking'
              ? <Flame className="w-3.5 h-3.5" />
              : <Check className="w-3.5 h-3.5" />
          }
        </button>
      )}
    </div>
  )
}

function OrderCard({
  order,
  bumping,
  onItemAction,
  onStartAll,
  onReadyAll,
  stationColor,
}: {
  order: KdsOrder
  bumping: Set<string>
  onItemAction: (itemId: string, nextStatus: 'cooking' | 'ready') => void
  onStartAll: (orderId: string, stationId: string | null) => void
  onReadyAll: (orderId: string, stationId: string | null) => void
  stationColor?: string
}) {
  const secs = useElapsed(order.oldest_at)
  const mins = Math.floor(secs / 60)

  const sentItems    = order.items.filter(i => i.status === 'sent')
  const cookingItems = order.items.filter(i => i.status === 'cooking')
  const readyItems   = order.items.filter(i => i.status === 'ready')
  const allDone      = readyItems.length === order.items.length

  const borderColor = allDone
    ? 'border-emerald-500/30'
    : sentItems.length > 0 && cookingItems.length === 0
    ? 'border-amber-500/40'
    : 'border-blue-500/40'

  const headerBg = allDone
    ? 'from-emerald-500/10 to-transparent'
    : sentItems.length > 0 && cookingItems.length === 0
    ? 'from-amber-500/10 to-transparent'
    : 'from-blue-500/10 to-transparent'

  // The stationId for start/ready all bulk actions (null = apply to all items)
  const currentStationId = order.items[0]?.station_id ?? null

  return (
    <div className={cn('rounded-2xl border bg-white/4 backdrop-blur-sm overflow-hidden flex flex-col', borderColor)}>

      {/* Header */}
      <div className={cn('bg-gradient-to-b px-4 py-3 flex items-center justify-between', headerBg)}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-xl border border-white/12 flex items-center justify-center shrink-0"
            style={{ backgroundColor: stationColor ? `${stationColor}22` : 'rgba(255,255,255,0.05)' }}
          >
            <span className="text-base font-extrabold text-white">{order.table_label}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold text-white">Table {order.table_label}</p>
              {order.group_label && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/10 text-white/50">
                  {order.group_label}
                </span>
              )}
            </div>
            {order.order_num && (
              <p className="text-[11px] font-bold text-amber-400 font-mono leading-tight">{order.order_num}</p>
            )}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {sentItems.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                  <Bell className="w-2.5 h-2.5" />{sentItems.length} new
                </span>
              )}
              {cookingItems.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                  <Flame className="w-2.5 h-2.5" />{cookingItems.length} cooking
                </span>
              )}
              {readyItems.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check className="w-2.5 h-2.5" />{readyItems.length} ready
                </span>
              )}
            </div>
          </div>
        </div>
        <ElapsedBadge isoDate={order.oldest_at} />
      </div>

      {/* Items */}
      <div className="flex-1 px-3 py-3 space-y-1.5">
        {order.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            busy={bumping.has(item.id)}
            onAction={onItemAction}
          />
        ))}
      </div>

      {/* Progress bar */}
      {readyItems.length > 0 && (
        <div className="px-4 pb-1">
          <div className="h-1 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(readyItems.length / order.items.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Action footer */}
      <div className="px-4 pb-4 pt-2 space-y-2">
        {allDone ? (
          <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold text-center flex items-center justify-center gap-2">
            <CheckCheck className="w-4 h-4" /> All Ready
          </div>
        ) : (
          <>
            {sentItems.length > 0 && (
              <button
                onClick={() => onStartAll(order.order_id, currentStationId)}
                disabled={bumping.has(`start-${order.order_id}`)}
                className="w-full py-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-bold hover:bg-blue-500/25 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {bumping.has(`start-${order.order_id}`)
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Flame className="w-4 h-4" />}
                Start Cooking ({sentItems.length})
              </button>
            )}
            {cookingItems.length > 0 && sentItems.length === 0 && (
              <button
                onClick={() => onReadyAll(order.order_id, currentStationId)}
                disabled={bumping.has(`ready-${order.order_id}`)}
                className="w-full py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-bold hover:bg-emerald-500/25 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {bumping.has(`ready-${order.order_id}`)
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <CheckCheck className="w-4 h-4" />}
                All Ready ({cookingItems.length})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function KdsPage() {
  const supabase        = createClient()
  const searchParams    = useSearchParams()
  const router          = useRouter()
  const activeStationId = searchParams.get('station') ?? null

  const [stations, setStations]         = useState<Station[]>([])
  const [allOrders, setAllOrders]       = useState<KdsOrder[]>([])
  const [loading, setLoading]           = useState(true)
  const [online, setOnline]             = useState(true)
  const [bumping, setBumping]           = useState<Set<string>>(new Set())
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [voidAlerts, setVoidAlerts]     = useState<{ id: string; itemName: string; qty: number; tableLabel: string; stationId: string | null }[]>([])
  const restIdRef          = useRef<string | null>(null)
  const allOrdersRef       = useRef<KdsOrder[]>([])
  const activeStationIdRef = useRef<string | null>(null)
  const stationsRef        = useRef<Station[]>([])

  const audioCtxRef      = useRef<AudioContext | null>(null)
  const alertLoopRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const newOrderLoopRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  // Tracks item IDs that have already triggered the new-order sound (prevents double-play)
  const soundedItemsRef  = useRef<Set<string>>(new Set())

  // Keep activeStationId + stations accessible inside realtime closures
  useEffect(() => { activeStationIdRef.current = activeStationId }, [activeStationId])
  useEffect(() => { stationsRef.current = stations }, [stations])

  // Keep AudioContext alive — resume it on every user interaction
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        try { audioCtxRef.current = new AudioContext() } catch { return }
      }
      if (audioCtxRef.current.state !== 'running') {
        audioCtxRef.current.resume().catch(() => {})
      }
    }
    document.addEventListener('click',      unlock)
    document.addEventListener('touchstart', unlock)
    document.addEventListener('keydown',    unlock)
    return () => {
      document.removeEventListener('click',      unlock)
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('keydown',    unlock)
    }
  }, [])

  const playBeeps = useCallback((freqs: number[]) => {
    // Create context lazily if not yet created
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new AudioContext() } catch { return }
    }
    const ctx = audioCtxRef.current

    const doPlay = () => {
      freqs.forEach((freq, i) => {
        const t    = ctx.currentTime + i * 0.22
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'square'
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0.4, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
        osc.start(t)
        osc.stop(t + 0.18)
      })
    }

    if (ctx.state === 'running') {
      doPlay()
    } else {
      // Suspended — try to resume first (works if there was a prior user gesture)
      ctx.resume().then(doPlay).catch(() => {})
    }
  }, [])

  // Descending = void alert, ascending = new order
  const playVoidAlert  = useCallback(() => playBeeps([880, 660, 440]), [playBeeps])
  const playNewOrder   = useCallback(() => playBeeps([440, 660, 880]), [playBeeps])

  // 1-minute reminder while any items are still 'sent' (chef hasn't started cooking)
  useEffect(() => {
    // Only remind if the current station has unstarted sent items
    const hasSent = allOrders.some(o => o.items.some(i => {
      if (i.status !== 'sent') return false
      if (!activeStationId) return true
      if (i.station_id === activeStationId) return true
      const stn = stations.find(s => s.id === activeStationId)
      return !!stn && stn.category_ids.length === 0
    }))
    if (hasSent) {
      if (!newOrderLoopRef.current) {
        newOrderLoopRef.current = setInterval(() => {
          const activeId = activeStationIdRef.current
          const stnList  = stationsRef.current
          const station  = stnList.find(s => s.id === activeId)
          const hasSentNow = allOrdersRef.current.some(o => o.items.some(i => {
            if (i.status !== 'sent') return false
            if (!activeId) return true
            if (i.station_id === activeId) return true
            if (station && station.category_ids.length === 0) return true
            return false
          }))
          if (hasSentNow) playNewOrder()
        }, 60000)
      }
    } else {
      if (newOrderLoopRef.current) {
        clearInterval(newOrderLoopRef.current)
        newOrderLoopRef.current = null
      }
    }
    return () => {
      if (newOrderLoopRef.current) {
        clearInterval(newOrderLoopRef.current)
        newOrderLoopRef.current = null
      }
    }
  }, [allOrders, activeStationId, stations, playNewOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror the same logic as visibleOrders:
  // – All tab  → show every alert
  // – Station with direct station_id match → show
  // – Station with no category filter (shows everything) → show all alerts
  const visibleVoidAlerts = voidAlerts.filter(a => {
    if (!activeStationId) return true
    if (a.stationId === activeStationId) return true
    const station = stations.find(s => s.id === activeStationId)
    if (station && station.category_ids.length === 0) return true
    return false
  })

  useEffect(() => {
    if (visibleVoidAlerts.length > 0) {
      playVoidAlert()
      if (!alertLoopRef.current) {
        alertLoopRef.current = setInterval(playVoidAlert, 3000)
      }
    } else {
      if (alertLoopRef.current) {
        clearInterval(alertLoopRef.current)
        alertLoopRef.current = null
      }
    }
    return () => {
      if (alertLoopRef.current && visibleVoidAlerts.length === 0) {
        clearInterval(alertLoopRef.current)
        alertLoopRef.current = null
      }
    }
  }, [visibleVoidAlerts.length, playVoidAlert]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeStation = stations.find(s => s.id === activeStationId) ?? null

  const fetchOrders = useCallback(async (restId: string) => {
    const { data, error } = await supabase
      .from('order_items')
      .select(`
        id, item_name, qty, note, status, station_id, created_at,
        sent_at, cooking_started_at, ready_at,
        orders!inner(id, table_number, restaurant_id, order_num, source)
      `)
      // note: station_id may be null for old items — those fall into "All" only
      .in('status', ['sent', 'cooking', 'ready'])
      .eq('orders.restaurant_id', restId)
      .order('created_at', { ascending: true })

    if (error) { setOnline(false); return }
    setOnline(true)

    const [{ data: tablesData }, { data: groupsData }] = await Promise.all([
      supabase.from('tables').select('seq, table_number, group_id').eq('restaurant_id', restId),
      supabase.from('table_groups').select('id, name').eq('restaurant_id', restId),
    ])
    const labelMap = new Map<number, string>()
    const groupMap = new Map<number, string>()
    const groupNameById = new Map<string, string>()
    for (const g of (groupsData ?? [])) groupNameById.set(g.id, g.name)
    for (const t of (tablesData ?? [])) {
      labelMap.set(t.seq, t.table_number ?? String(t.seq))
      if (t.group_id) groupMap.set(t.seq, groupNameById.get(t.group_id) ?? '')
    }

    const map = new Map<string, KdsOrder>()
    for (const row of (data ?? [])) {
      const ord = row.orders as unknown as { id: string; table_number: number; order_num: string | null; source: string | null }
      const sourceLabel = ord.source === 'delivery' ? 'Delivery' : ord.source === 'takeout' ? 'Takeout' : null
      if (!map.has(ord.id)) {
        map.set(ord.id, {
          order_id:    ord.id,
          order_num:   ord.order_num ?? null,
          table_label: sourceLabel ?? labelMap.get(ord.table_number) ?? String(ord.table_number),
          group_label: sourceLabel ? null : (groupMap.get(ord.table_number) ?? null),
          items:       [],
          oldest_at:   row.created_at,
        })
      }
      const group = map.get(ord.id)!
      group.items.push({
        id:                 row.id,
        item_name:          row.item_name,
        qty:                row.qty,
        note:               row.note,
        status:             row.status as KdsItem['status'],
        station_id:         row.station_id ?? null,
        category_id:        null,
        created_at:         row.created_at,
        sent_at:            row.sent_at            ?? null,
        cooking_started_at: row.cooking_started_at ?? null,
        ready_at:           row.ready_at           ?? null,
      })
      if (row.created_at < group.oldest_at) group.oldest_at = row.created_at
    }

    const result = [...map.values()].filter(o =>
      o.items.some(i => i.status === 'sent' || i.status === 'cooking')
    )
    result.sort((a, b) => {
      const aHasCooking = a.items.some(i => i.status === 'cooking')
      const bHasCooking = b.items.some(i => i.status === 'cooking')
      if (aHasCooking && !bHasCooking) return -1
      if (!aHasCooking && bHasCooking) return 1
      return a.oldest_at.localeCompare(b.oldest_at)
    })

    setAllOrders(result)
    allOrdersRef.current = result
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const init = async () => {
      const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
      if (!rest) return
      setRestaurantId(rest.id)
      restIdRef.current = rest.id

      // Load stations + their category assignments
      const [{ data: stationsData }, { data: assignData }] = await Promise.all([
        supabase.from('kds_stations').select('id,name,color,active,sort_order').eq('restaurant_id', rest.id).eq('active', true).order('sort_order'),
        supabase.from('kds_station_categories').select('station_id,category_id'),
      ])
      const assignMap = new Map<string, string[]>()
      for (const a of (assignData ?? [])) {
        const arr = assignMap.get(a.station_id) ?? []
        arr.push(a.category_id)
        assignMap.set(a.station_id, arr)
      }
      setStations(((stationsData ?? []) as Omit<Station, 'category_ids'>[]).map(s => ({
        ...s, category_ids: assignMap.get(s.id) ?? [],
      })))

      await fetchOrders(rest.id)

      const channel = supabase
        .channel('kds-order-items')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_items' },
          (payload) => {
            const updated = payload.new as { id: string; status: string; item_name: string; qty: number; station_id: string | null }

            // Play sound when an item becomes 'sent' and hasn't already played
            // (covers delivery/guest orders confirmed by staff: pending → sent via UPDATE)
            if (updated.status === 'sent' && !soundedItemsRef.current.has(updated.id)) {
              soundedItemsRef.current.add(updated.id)
              const activeId = activeStationIdRef.current
              const stnList  = stationsRef.current
              const station  = stnList.find(s => s.id === activeId)
              const belongs  = !activeId
                            || updated.station_id === activeId
                            || (!!station && station.category_ids.length === 0)
              if (belongs) playNewOrder()
            }

            if (updated.status === 'void') {
              for (const order of allOrdersRef.current) {
                const item = order.items.find(i => i.id === updated.id && i.status === 'cooking')
                if (item) {
                  setVoidAlerts(prev => [...prev, { id: item.id, itemName: item.item_name, qty: item.qty, tableLabel: order.table_label, stationId: item.station_id }])
                  break
                }
              }
            }
            if (restIdRef.current) fetchOrders(restIdRef.current)
          })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' },
          (payload) => {
            const newItem = payload.new as { id: string; station_id: string | null; status: string }

            // Only play sound for items inserted directly as 'sent' (dine-in staff orders).
            // Delivery/guest items are inserted as 'pending' — their sound plays on UPDATE above.
            if (newItem.status === 'sent') {
              soundedItemsRef.current.add(newItem.id)
              const activeId = activeStationIdRef.current
              const stnList  = stationsRef.current
              const station  = stnList.find(s => s.id === activeId)
              const belongs  = !activeId
                            || newItem.station_id === activeId
                            || (!!station && station.category_ids.length === 0)
              if (belongs) playNewOrder()
            }
            if (restIdRef.current) fetchOrders(restIdRef.current)
          })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
          () => { if (restIdRef.current) fetchOrders(restIdRef.current) })
        .subscribe((status) => setOnline(status === 'SUBSCRIBED'))

      return () => { supabase.removeChannel(channel) }
    }
    init()
  }, [fetchOrders]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter orders for the active station ──────────────────────
  // An item belongs to a station if:
  //   a) item.station_id === station.id  (set at order time — new orders), OR
  //   b) station.category_ids has no entries (station shows everything), OR
  //   c) (fallback) station has no category filter → shown on All only
  const visibleOrders: KdsOrder[] = activeStationId
    ? (() => {
        const station = stations.find(s => s.id === activeStationId)
        if (!station) return []
        const catSet = new Set(station.category_ids)
        const noFilter = catSet.size === 0  // station not configured → show all items

        return allOrders
          .map(order => {
            const stationItems = order.items.filter(i => {
              // If item has station_id set, use it directly
              if (i.station_id !== null) return i.station_id === activeStationId
              // Otherwise fall back to category assignment (if station has categories configured)
              if (noFilter) return true
              return false
            })
            if (stationItems.length === 0) return null
            if (!stationItems.some(i => i.status === 'sent' || i.status === 'cooking')) return null
            return { ...order, items: stationItems }
          })
          .filter((o): o is KdsOrder => o !== null)
      })()
    : allOrders

  const setBusy = (key: string, val: boolean) => {
    setBumping(prev => { const s = new Set(prev); val ? s.add(key) : s.delete(key); return s })
  }

  const itemAction = async (itemId: string, nextStatus: 'cooking' | 'ready') => {
    setBusy(itemId, true)
    const now = new Date().toISOString()
    const extra = nextStatus === 'cooking' ? { cooking_started_at: now } : { ready_at: now }
    await supabase.from('order_items').update({ status: nextStatus, ...extra }).eq('id', itemId)
    setBusy(itemId, false)
    if (restaurantId) fetchOrders(restaurantId)
  }

  const startAll = async (orderId: string, stationId: string | null) => {
    setBusy(`start-${orderId}`, true)
    // When viewing a specific station, only start items that belong to it
    const itemIds = allOrders
      .find(o => o.order_id === orderId)?.items
      .filter(i => i.status === 'sent' && (stationId === null || i.station_id === stationId))
      .map(i => i.id) ?? []
    if (itemIds.length > 0) {
      await supabase.from('order_items')
        .update({ status: 'cooking', cooking_started_at: new Date().toISOString() })
        .in('id', itemIds)
    }
    setBusy(`start-${orderId}`, false)
    if (restaurantId) fetchOrders(restaurantId)
  }

  const readyAll = async (orderId: string, stationId: string | null) => {
    setBusy(`ready-${orderId}`, true)
    const itemIds = allOrders
      .find(o => o.order_id === orderId)?.items
      .filter(i => i.status === 'cooking' && (stationId === null || i.station_id === stationId))
      .map(i => i.id) ?? []
    if (itemIds.length > 0) {
      await supabase.from('order_items')
        .update({ status: 'ready', ready_at: new Date().toISOString() })
        .in('id', itemIds)
    }
    setBusy(`ready-${orderId}`, false)
    if (restaurantId) fetchOrders(restaurantId)
  }

  const setStation = (id: string | null) => {
    const url = id ? `/dashboard/kds?station=${id}` : '/dashboard/kds'
    router.replace(url)
  }

  const now = new Date()
  // Count of active (non-ready) items per station for badges
  const badgeCount = (stationId: string | null): number => {
    if (!stationId) {
      return allOrders.reduce((s, o) => s + o.items.filter(i => i.status === 'sent' || i.status === 'cooking').length, 0)
    }
    const station = stations.find(s => s.id === stationId)
    if (!station) return 0
    const noFilter = station.category_ids.length === 0
    return allOrders.reduce((s, o) => {
      return s + o.items.filter(i => {
        if (i.status !== 'sent' && i.status !== 'cooking') return false
        if (i.station_id !== null) return i.station_id === stationId
        return noFilter
      }).length
    }, 0)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-black/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Kitchen Display</h1>
            <p className="text-xs text-white/40">
              {now.toLocaleDateString('en-GB')} · {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={cn(
            'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full',
            online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
          )}>
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {online ? 'Live' : 'Offline'}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-white/6 text-white/60">
            {visibleOrders.length} order{visibleOrders.length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={playVoidAlert}
            title="Test alert sound"
            className="w-8 h-8 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-all active:scale-95"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { if (restaurantId) fetchOrders(restaurantId) }}
            className="w-8 h-8 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Void alert banners — only for active station (or all if on All tab) ── */}
      {visibleVoidAlerts.map(alert => (
        <div
          key={alert.id}
          className="flex items-center gap-4 px-5 py-3 bg-rose-600 border-b-2 border-rose-400 animate-pulse"
        >
          <AlertTriangle className="w-6 h-6 text-white shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold text-rose-200 uppercase tracking-widest">⚠ Stop Cooking — Order Voided</p>
            <p className="text-lg font-black text-white leading-tight">
              ×{alert.qty} {alert.itemName}
              <span className="ml-3 text-sm font-bold text-rose-200">Table {alert.tableLabel}</span>
            </p>
          </div>
          <button
            onClick={() => setVoidAlerts(prev => prev.filter(a => a.id !== alert.id))}
            className="shrink-0 h-10 px-4 rounded-xl bg-white text-rose-600 text-sm font-black uppercase tracking-wide flex items-center gap-2 active:scale-95 transition-all hover:bg-rose-50"
          >
            <X className="w-4 h-4" />
            Dismiss
          </button>
        </div>
      ))}

      {/* ── Station tabs ── */}
      {stations.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-3 border-b border-white/6 overflow-x-auto scrollbar-none">
          {/* All tab */}
          <button
            onClick={() => setStation(null)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all active:scale-95 shrink-0',
              !activeStationId
                ? 'bg-white/12 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/6'
            )}
          >
            <Layers className="w-4 h-4" />
            All
            {badgeCount(null) > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-extrabold flex items-center justify-center">
                {badgeCount(null)}
              </span>
            )}
          </button>

          {/* Per-station tabs */}
          {stations.map(station => {
            const count = badgeCount(station.id)
            const isActive = activeStationId === station.id
            return (
              <button
                key={station.id}
                onClick={() => setStation(station.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all active:scale-95 shrink-0',
                  isActive ? 'text-black' : 'text-white/40 hover:text-white/70 hover:bg-white/6'
                )}
                style={isActive ? { backgroundColor: station.color } : undefined}
              >
                <Flame className="w-4 h-4" style={isActive ? { color: 'rgba(0,0,0,0.6)' } : { color: station.color }} />
                {station.name}
                {count > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center"
                    style={isActive
                      ? { backgroundColor: 'rgba(0,0,0,0.25)', color: '#000' }
                      : { backgroundColor: station.color + '33', color: station.color }
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Body ── */}
      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCheck className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">
                {activeStation ? `${activeStation.name} is clear!` : 'All caught up!'}
              </p>
              <p className="text-sm text-white/40 mt-1">
                {activeStation
                  ? `No pending items for ${activeStation.name}`
                  : 'No pending kitchen orders right now'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleOrders.map(order => (
              <OrderCard
                key={order.order_id}
                order={order}
                bumping={bumping}
                onItemAction={itemAction}
                onStartAll={startAll}
                onReadyAll={readyAll}
                stationColor={activeStation?.color}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Legend ── */}
      <footer className="px-6 py-3 border-t border-white/6 flex flex-wrap items-center gap-4 text-xs text-white/30">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> New — waiting to cook</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" /> Cooking — in progress</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Ready — done</div>
        {activeStation && (
          <div className="flex items-center gap-1.5 ml-4">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeStation.color }} />
            Viewing: {activeStation.name}
          </div>
        )}
        <div className="ml-auto">Live updates via Supabase Realtime</div>
      </footer>

    </div>
  )
}

export default function KdsPageWrapper() { return <Suspense><KdsPage /></Suspense> }
