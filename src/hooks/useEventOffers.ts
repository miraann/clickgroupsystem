import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedEventOffer {
  id:            string
  restaurant_id: string
  title:         string
  description:   string | null
  date_label:    string | null
  image_url:     string | null
  active:        boolean
  sort_order:    number
}

async function fetchEventOffers(restaurantId: string): Promise<CachedEventOffer[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('events_offers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CachedEventOffer[]
}

export function useEventOffers(restaurantId: string | null) {
  return useSWR<CachedEventOffer[]>(
    restaurantId ? `event-offers-${restaurantId}` : null,
    () => fetchEventOffers(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true },
  )
}
