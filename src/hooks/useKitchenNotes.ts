import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedKNote {
  id:         string
  text:       string
  active:     boolean
  sort_order: number
}

async function fetchKitchenNotes(restaurantId: string): Promise<CachedKNote[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kitchen_notes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CachedKNote[]
}

export function useKitchenNotes(restaurantId: string | null) {
  return useSWR<CachedKNote[]>(
    restaurantId ? `kitchen-notes-${restaurantId}` : null,
    () => fetchKitchenNotes(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true },
  )
}
