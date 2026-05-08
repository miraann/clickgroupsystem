import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedVoidReason {
  id:         string
  text:       string
  active:     boolean
  sort_order: number
}

async function fetchVoidReasons(restaurantId: string): Promise<CachedVoidReason[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('void_reasons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CachedVoidReason[]
}

export function useVoidReasons(restaurantId: string | null) {
  return useSWR<CachedVoidReason[]>(
    restaurantId ? `void-reasons-${restaurantId}` : null,
    () => fetchVoidReasons(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true },
  )
}
