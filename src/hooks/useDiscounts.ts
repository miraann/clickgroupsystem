import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedDiscount {
  id: string
  name: string
  type: 'percentage' | 'fixed'
  value: number
  min_order: number
  active: boolean
  sort_order: number
}

async function fetchDiscounts(restaurantId: string): Promise<CachedDiscount[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('discounts')
    .select('id, name, type, value, min_order, active, sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CachedDiscount[]
}

export function useDiscounts(restaurantId: string | null) {
  return useSWR<CachedDiscount[]>(
    restaurantId ? `discounts-${restaurantId}` : null,
    () => fetchDiscounts(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  )
}
