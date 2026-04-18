import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedTable {
  id: string
  seq: number
  table_number: string
  name: string
  capacity: number
  group_id: string | null
  shape: 'Square' | 'Round' | 'Rectangle'
  active: boolean
}

async function fetchTables(restaurantId: string): Promise<CachedTable[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tables')
    .select('id, seq, table_number, name, capacity, group_id, shape, active')
    .eq('restaurant_id', restaurantId)
    .order('seq')
  if (error) throw error
  return (data ?? []) as CachedTable[]
}

export function useTables(restaurantId: string | null) {
  return useSWR<CachedTable[]>(
    restaurantId ? `tables-${restaurantId}` : null,
    () => fetchTables(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  )
}
