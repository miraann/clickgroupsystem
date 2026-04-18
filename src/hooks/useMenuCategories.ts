import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedCategory {
  id: string
  name: string
  color: string
  icon: string | null
  sort_order: number
  active: boolean
}

async function fetchMenuCategories(restaurantId: string): Promise<CachedCategory[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('menu_categories')
    .select('id, name, color, icon, sort_order, active')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CachedCategory[]
}

export function useMenuCategories(restaurantId: string | null) {
  return useSWR<CachedCategory[]>(
    restaurantId ? `menu-categories-${restaurantId}` : null,
    () => fetchMenuCategories(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,   // 1 min — categories change rarely mid-session
      keepPreviousData: true,
    }
  )
}
