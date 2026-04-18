import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedModOption {
  id: string
  name: string
  price: number
  sort_order: number
}

export interface CachedModifier {
  id: string
  name: string
  required: boolean
  min_select: number
  max_select: number
  sort_order: number
  modifier_options: CachedModOption[]
}

async function fetchMenuModifiers(restaurantId: string): Promise<CachedModifier[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('menu_modifiers')
    .select('id, name, required, min_select, max_select, sort_order, modifier_options(id, name, price, sort_order)')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
    .order('sort_order', { referencedTable: 'modifier_options' })
  if (error) throw error
  return (data ?? []) as CachedModifier[]
}

export function useMenuModifiers(restaurantId: string | null) {
  return useSWR<CachedModifier[]>(
    restaurantId ? `menu-modifiers-${restaurantId}` : null,
    () => fetchMenuModifiers(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  )
}
