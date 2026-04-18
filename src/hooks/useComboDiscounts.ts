import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedCombo {
  id: string
  name: string
  description: string
  buy_qty: number
  get_qty: number
  discount_pct: number
  active: boolean
  sort_order: number
}

async function fetchComboDiscounts(restaurantId: string): Promise<CachedCombo[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('combo_discounts')
    .select('id, name, description, buy_qty, get_qty, discount_pct, active, sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CachedCombo[]
}

export function useComboDiscounts(restaurantId: string | null) {
  return useSWR<CachedCombo[]>(
    restaurantId ? `combo-discounts-${restaurantId}` : null,
    () => fetchComboDiscounts(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
  )
}
