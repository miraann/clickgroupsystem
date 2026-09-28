import useSWR, { mutate } from 'swr'
import { createClient } from '@/lib/supabase/client'

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'dirty' | 'bill_requested'

export interface TableWithStatus {
  id: string
  number: number
  label: string
  capacity: number
  shape: 'square' | 'round' | 'rect'
  group_id: string | null
  posX: number | null   // floor-plan position (px); null = not placed
  posY: number | null
  status: TableStatus
  guests?: number
  orderTotal?: number
  openedAt?: string
  orderId?: string
}

// Walls, doors, planters… drawn on the floor plan (migration 20260928_05).
export interface FloorElement {
  id: string
  group_id: string | null
  kind: string
  x: number
  y: number
  w: number
  h: number
  rot: number   // clockwise degrees: 0/90/180/270 (migration 20260928_06)
}

export interface DashboardFullData {
  tables: TableWithStatus[]
  groups: { id: string; name: string; color: string }[]
  floorElements: FloorElement[]
}

export const SWR_KEY = (restaurantId: string) => `dashboard-tables-v1-${restaurantId}`

const TABLE_COLS = 'id, seq, table_number, capacity, shape, group_id, status'

// pos_x/pos_y arrive with migration 20260928_04. Until it runs, PostgREST
// rejects the whole select (42703) — retry without them so the grid still loads.
async function fetchTables(supabase: ReturnType<typeof createClient>, restaurantId: string) {
  const res = await supabase.from('tables')
    .select(`${TABLE_COLS}, pos_x, pos_y`)
    .eq('restaurant_id', restaurantId).eq('active', true).order('table_number')
  if (res.error?.code !== '42703') return res
  return supabase.from('tables')
    .select(TABLE_COLS)
    .eq('restaurant_id', restaurantId).eq('active', true).order('table_number')
}

async function fetchDashboardData(restaurantId: string): Promise<DashboardFullData> {
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)

  // The `restaurants` row is no longer fetched here — it comes from the shared
  // `useRestaurant` SWR cache (one round-trip per session, not one per screen).
  const [
    { data: dbTables },
    { data: orders },
    { data: grps },
    { data: todayRes },
    { data: floorElements },
  ] = await Promise.all([
    fetchTables(supabase, restaurantId),
    supabase.from('orders')
      .select('id, table_number, guests, total, created_at')
      .eq('restaurant_id', restaurantId).eq('status', 'active'),
    supabase.from('table_groups')
      .select('id, name, color')
      .eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('reservations')
      .select('table_id')
      .eq('restaurant_id', restaurantId)
      .eq('date', today)
      .in('status', ['pending', 'confirmed']),
    // Errors (e.g. table not migrated yet) just mean no decor — data is null.
    // `*` so rows still load before `rot` exists (20260928_06).
    supabase.from('floor_elements')
      .select('*')
      .eq('restaurant_id', restaurantId),
  ])

  // Verify each active order still has non-void items; auto-close ones whose
  // items were all voided. (This was previously a second waterfall in the
  // dashboard page — folded in here so table status has one source of truth.)
  const orderIds = (orders ?? []).map(o => o.id)
  let liveOrderIds = new Set<string>(orderIds)
  if (orderIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('order_items').select('order_id, status').in('order_id', orderIds)
    const withItems     = new Set((itemRows ?? []).map(i => i.order_id))
    const withLiveItems  = new Set((itemRows ?? []).filter(i => i.status !== 'void').map(i => i.order_id))
    // Keep orders that have a live item OR no items yet (brand-new guest/delivery race).
    liveOrderIds = new Set(orderIds.filter(id => !withItems.has(id) || withLiveItems.has(id)))
    const staleIds = orderIds.filter(id => withItems.has(id) && !withLiveItems.has(id))
    if (staleIds.length > 0) {
      // fire-and-forget — don't block the grid on the cleanup write.
      // (.then() is what actually dispatches a supabase-js query.)
      supabase.from('orders')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .in('id', staleIds)
        .then(() => {}, () => {})
    }
  }

  // Build order map keyed by table seq number
  const orderMap = new Map<number, { guests: number; total: number; openedAt: string; orderId: string }>()
  for (const o of orders ?? []) {
    if (!liveOrderIds.has(o.id)) continue
    orderMap.set(Number(o.table_number), {
      orderId:  o.id,
      guests:   o.guests ?? 0,
      total:    o.total ?? 0,
      openedAt: new Date(o.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
      }),
    })
  }

  const reservedIds = new Set<string>(
    (todayRes ?? []).map((r: { table_id: string | null }) => r.table_id).filter(Boolean) as string[]
  )

  // Compute final table status inline — one pass, no second query
  const tables: TableWithStatus[] = (dbTables ?? []).map(t => {
    const base = {
      id:       t.id,
      number:   t.seq,
      label:    t.table_number ?? String(t.seq),
      capacity: t.capacity ?? 4,
      shape:    (t.shape === 'Rectangle' ? 'rect' : (t.shape ?? 'Square').toLowerCase()) as TableWithStatus['shape'],
      group_id: t.group_id ?? null,
      posX:     (t as { pos_x?: number | null }).pos_x ?? null,
      posY:     (t as { pos_y?: number | null }).pos_y ?? null,
    }
    const order = orderMap.get(base.number)
    if (order) return { ...base, status: 'occupied' as const, guests: order.guests, orderTotal: order.total, openedAt: order.openedAt, orderId: order.orderId }
    if (reservedIds.has(base.id)) return { ...base, status: 'reserved' as const }
    if ((t as Record<string, unknown>).status === 'dirty') return { ...base, status: 'dirty' as const }
    return { ...base, status: 'available' as const }
  })

  return {
    tables,
    groups: (grps ?? []) as { id: string; name: string; color: string }[],
    floorElements: (floorElements ?? []).map((e): FloorElement => ({
      id: e.id, group_id: e.group_id ?? null, kind: e.kind,
      x: e.x, y: e.y, w: e.w, h: e.h, rot: e.rot ?? 0,
    })),
  }
}

export function useDashboardTables(restaurantId: string | null) {
  return useSWR<DashboardFullData>(
    restaurantId ? SWR_KEY(restaurantId) : null,
    () => fetchDashboardData(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval:  10_000,  // 10 s — orders change, keep reasonably fresh
      keepPreviousData:  true,    // show stale status while revalidating
    }
  )
}

export { mutate as mutateDashboard }
