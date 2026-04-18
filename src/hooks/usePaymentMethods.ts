import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedPayMethod {
  id: string
  name: string
  icon_type: string
  active: boolean
  is_default: boolean
  sort_order: number
}

export interface CachedCurrency {
  id: string
  name: string
  symbol: string
  decimal_places: number
  is_default: boolean
  sort_order: number
}

export interface PaymentData {
  methods:    CachedPayMethod[]
  currencies: CachedCurrency[]
}

async function fetchPaymentData(restaurantId: string): Promise<PaymentData> {
  const supabase = createClient()
  const [{ data: pm, error: pmErr }, { data: cur, error: curErr }] = await Promise.all([
    supabase
      .from('payment_methods')
      .select('id, name, icon_type, active, is_default, sort_order')
      .eq('restaurant_id', restaurantId)
      .order('sort_order'),
    supabase
      .from('currencies')
      .select('id, name, symbol, decimal_places, is_default, sort_order')
      .eq('restaurant_id', restaurantId)
      .order('sort_order'),
  ])
  if (pmErr) throw pmErr
  if (curErr) throw curErr
  return {
    methods:    (pm  ?? []) as CachedPayMethod[],
    currencies: (cur ?? []) as CachedCurrency[],
  }
}

export function usePaymentMethods(restaurantId: string | null) {
  return useSWR<PaymentData>(
    restaurantId ? `payment-methods-${restaurantId}` : null,
    () => fetchPaymentData(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
  )
}
