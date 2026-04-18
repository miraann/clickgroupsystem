import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedStation {
  id: string
  name: string
  color: string
  active: boolean
  sort_order: number
  category_ids: string[]
}

async function fetchKdsStations(restaurantId: string): Promise<CachedStation[]> {
  const supabase = createClient()
  const [{ data: stationsData }, { data: assignData }] = await Promise.all([
    supabase.from('kds_stations').select('id,name,color,active,sort_order').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order'),
    supabase.from('kds_station_categories').select('station_id,category_id'),
  ])
  const assignMap = new Map<string, string[]>()
  for (const a of (assignData ?? [])) {
    const arr = assignMap.get(a.station_id) ?? []
    arr.push(a.category_id)
    assignMap.set(a.station_id, arr)
  }
  return ((stationsData ?? []) as Omit<CachedStation, 'category_ids'>[]).map(s => ({
    ...s,
    category_ids: assignMap.get(s.id) ?? [],
  }))
}

export function useKdsStations(restaurantId: string | null) {
  return useSWR<CachedStation[]>(
    restaurantId ? `kds-stations-${restaurantId}` : null,
    () => fetchKdsStations(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 120_000, // 2 min — stations rarely change
      keepPreviousData: true,
    }
  )
}
