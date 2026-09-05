'use client'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { DbDiscount, DbSurcharge, DbPayMethod } from '@/components/restaurant/payment/types'

export interface CheckoutData {
  payMethods:      DbPayMethod[]
  discounts:       DbDiscount[]
  surcharges:      DbSurcharge[]
  invoicePreview:  string   // formatted preview e.g. "INV-1042", or ''
}

export const CHECKOUT_KEY = (id: string) => `checkout-v1-${id}`

const EMPTY: CheckoutData = { payMethods: [], discounts: [], surcharges: [], invoicePreview: '' }

async function fetchCheckoutData(rid: string): Promise<CheckoutData> {
  const supabase = createClient()

  const [methodsRes, discRes, surchRes, invRes] = await Promise.all([
    supabase.from('payment_methods').select('id, name, icon_type, is_default')
      .eq('restaurant_id', rid).eq('active', true).order('sort_order'),
    supabase.from('discounts').select('id,name,type,value,min_order,active')
      .eq('restaurant_id', rid).eq('active', true).order('sort_order'),
    supabase.from('surcharges').select('id,name,type,value,applied_to,active')
      .eq('restaurant_id', rid).eq('active', true).order('sort_order'),
    supabase.from('invoice_number_settings').select('prefix, current_num, start_num')
      .eq('restaurant_id', rid).maybeSingle(),
  ])

  let invoicePreview = ''
  const inv = invRes.data as { prefix?: string; current_num?: number; start_num?: number } | null
  if (inv) {
    const num = inv.current_num ?? inv.start_num ?? 1001
    invoicePreview = `${inv.prefix ?? 'INV-'}${num}`
  }

  return {
    payMethods: (methodsRes.data ?? []) as DbPayMethod[],
    discounts:  (discRes.data   ?? []) as DbDiscount[],
    surcharges: (surchRes.data  ?? []) as DbSurcharge[],
    invoicePreview,
  }
}

/**
 * Payment-screen reference data (methods / discounts / surcharges / invoice
 * number). Restaurant-level and slow-changing, so it is prefetched while the
 * order screen is open and served instantly when the user taps Pay.
 */
export function useCheckoutData(restaurantId: string | null) {
  const { data, isLoading } = useSWR<CheckoutData>(
    restaurantId ? CHECKOUT_KEY(restaurantId) : null,
    () => fetchCheckoutData(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval:  60_000,
      keepPreviousData:  true,
    },
  )
  return { checkout: data ?? EMPTY, loading: isLoading && !data }
}
