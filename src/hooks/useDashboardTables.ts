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
  status: TableStatus
  guests?: number
  orderTotal?: number
  openedAt?: string
  orderId?: string
}

export interface DashboardFullData {
  restaurant: { name: string; logo_url: string | null; settings: Record<string, unknown> } | null
  tables: TableWithStatus[]
  groups: { id: string; name: string; color: string }[]
}

export const SWR_KEY = (restaurantId: string) => `dashboard-tables-v1-${restaurantId}`

async function fetchDashboardData(restaurantId: string): Promise<DashboardFullData> {
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)

  // All 5 queries run in a single parallel batch — no sequential round-trips
  const [
    { data: rest },
    { data: dbTables },
    { data: orders },
    { data: grps },
    { data: todayRes },
  ] = await Promise.all([
    supabase.from('restaurants')
      .select('name, logo_url, settings')
      .eq('id', restaurantId).maybeSingle(),
    supabase.from('tables')
      .select('id, seq, table_number, capacity, shape, group_id')
      .eq('restaurant_id', restaurantId).eq('active', true).order('table_number'),
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
  ])

  // Build order map keyed by table seq number
  const orderMap = new Map<number, { guests: number; total: number; openedAt: string; orderId: string }>()
  for (const o of orders ?? []) {
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
    }
    const order = orderMap.get(base.number)
    if (order) return { ...base, status: 'occupied' as const, guests: order.guests, orderTotal: order.total, openedAt: order.openedAt, orderId: order.orderId }
    if (reservedIds.has(base.id)) return { ...base, status: 'reserved' as const }
    return { ...base, status: 'available' as const }
  })

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restaurant: rest ? { name: rest.name, logo_url: rest.logo_url, settings: ((rest as any).settings as Record<string, unknown>) ?? {} } : null,
    tables,
    groups: (grps ?? []) as { id: string; name: string; color: string }[],
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
