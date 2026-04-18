import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────
export interface DashboardTableItem {
  id: string
  number: number
  label: string
  capacity: number
  shape: 'square' | 'round' | 'rect'
  group_id: string | null
}

export interface DashboardGroup {
  id: string
  name: string
  color: string
}

export interface DashboardLayout {
  restaurant: { name: string; logo_url: string | null; settings: Record<string, unknown> } | null
  tables: DashboardTableItem[]
  groups: DashboardGroup[]
}

// ── Fetcher ───────────────────────────────────────────────────────
async function fetchDashboardLayout(restaurantId: string): Promise<DashboardLayout> {
  const supabase = createClient()
  const [{ data: rest }, { data: tables }, { data: groups }] = await Promise.all([
    supabase.from('restaurants').select('name, logo_url, settings').eq('id', restaurantId).maybeSingle(),
    supabase.from('tables').select('id, seq, table_number, capacity, shape, group_id').eq('restaurant_id', restaurantId).eq('active', true).order('table_number'),
    supabase.from('table_groups').select('id, name, color').eq('restaurant_id', restaurantId).order('sort_order'),
  ])

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restaurant: rest ? { name: rest.name, logo_url: rest.logo_url, settings: (rest as any).settings ?? {} } : null,
    tables: (tables ?? []).map(t => ({
      id:       t.id,
      number:   t.seq,
      label:    t.table_number ?? String(t.seq),
      capacity: t.capacity ?? 4,
      shape:    (t.shape === 'Rectangle' ? 'rect' : (t.shape ?? 'Square').toLowerCase()) as 'square' | 'round' | 'rect',
      group_id: t.group_id ?? null,
    })),
    groups: (groups ?? []) as DashboardGroup[],
  }
}

// ── Hook ──────────────────────────────────────────────────────────
export function useDashboardLayout(restaurantId: string | null) {
  return useSWR<DashboardLayout>(
    restaurantId ? `dashboard-layout-${restaurantId}` : null,
    () => fetchDashboardLayout(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 120_000, // 2 min — layout (tables, groups) rarely changes
      keepPreviousData: true,    // show stale data while revalidating
    }
  )
}
