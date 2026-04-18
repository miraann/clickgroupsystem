import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedTableGroup {
  id: string
  name: string
  color: string
  sort_order: number
}

async function fetchTableGroups(restaurantId: string): Promise<CachedTableGroup[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('table_groups')
    .select('id, name, color, sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CachedTableGroup[]
}

export function useTableGroups(restaurantId: string | null) {
  return useSWR<CachedTableGroup[]>(
    restaurantId ? `table-groups-${restaurantId}` : null,
    () => fetchTableGroups(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  )
}
