import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedSurcharge {
  id: string
  name: string
  type: 'percentage' | 'fixed'
  value: number
  applied_to: string
  active: boolean
  sort_order: number
}

export interface SurchargesData {
  surcharges: CachedSurcharge[]
  currency: { symbol: string; decimal_places: number }
}

async function fetchSurcharges(restaurantId: string): Promise<SurchargesData> {
  const supabase = createClient()
  const [{ data: rows, error }, { data: cur }] = await Promise.all([
    supabase
      .from('surcharges')
      .select('id, name, type, value, applied_to, active, sort_order')
      .eq('restaurant_id', restaurantId)
      .order('sort_order'),
    supabase
      .from('currencies')
      .select('symbol, decimal_places')
      .eq('restaurant_id', restaurantId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle(),
  ])
  if (error) throw error
  return {
    surcharges: (rows ?? []) as CachedSurcharge[],
    currency: cur ? { symbol: cur.symbol, decimal_places: cur.decimal_places } : { symbol: '$', decimal_places: 2 },
  }
}

export function useSurcharges(restaurantId: string | null) {
  return useSWR<SurchargesData>(
    restaurantId ? `surcharges-${restaurantId}` : null,
    () => fetchSurcharges(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
  )
}
