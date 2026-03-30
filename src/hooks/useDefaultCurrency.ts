'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DefaultCurrency {
  symbol: string
  decimalPlaces: number
  formatPrice: (amount: number) => string
}

const cache: { value: DefaultCurrency | null; restaurantId: string | null } = {
  value: null,
  restaurantId: null,
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

export function useDefaultCurrency(): DefaultCurrency {
  const [currency, setCurrency] = useState<DefaultCurrency>(makeCurrency('$', 2))

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: rest } = await supabase
        .from('restaurants').select('id').limit(1).maybeSingle()
      if (!rest) return

      // Use cache if same restaurant
      if (cache.value && cache.restaurantId === rest.id) {
        setCurrency(cache.value)
        return
      }

      const { data } = await supabase
        .from('currencies')
        .select('symbol, decimal_places')
        .eq('restaurant_id', rest.id)
        .eq('is_default', true)
        .maybeSingle()

      const result = makeCurrency(data?.symbol ?? '$', data?.decimal_places ?? 2)
      cache.value        = result
      cache.restaurantId = rest.id
      setCurrency(result)
    }
    load()
  }, [])

  return currency
}
