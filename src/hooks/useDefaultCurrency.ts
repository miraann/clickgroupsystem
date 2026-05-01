'use client'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

interface DefaultCurrency {
  symbol: string
  decimalPlaces: number
  formatPrice: (amount: number) => string
}

function makeCurrency(symbol: string, decimalPlaces: number): DefaultCurrency {
  return {
    symbol,
    decimalPlaces,
    formatPrice: (amount: number) =>
      symbol + amount.toLocaleString('en-US', {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      }),
  }
}

const FALLBACK = makeCurrency('$', 2)

async function fetchDefaultCurrency(): Promise<DefaultCurrency> {
  const restaurantId = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  if (!restaurantId) return FALLBACK
  const supabase = createClient()
  const { data } = await supabase
    .from('currencies')
    .select('symbol, decimal_places')
    .eq('restaurant_id', restaurantId)
    .eq('is_default', true)
    .maybeSingle()
  return makeCurrency(data?.symbol ?? '$', data?.decimal_places ?? 2)
}

export function useDefaultCurrency(): DefaultCurrency {
  const { data } = useSWR<DefaultCurrency>('default-currency', fetchDefaultCurrency, {
    revalidateOnFocus: false,
    dedupingInterval:  300_000, // 5 min — currency rarely changes
    keepPreviousData:  true,
    fallbackData:      FALLBACK,
  })
  return data ?? FALLBACK
}
