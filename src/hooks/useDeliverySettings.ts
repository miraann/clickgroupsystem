import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedDeliveryGeneral {
  delivery_enabled:        boolean
  show_delivery_button:    boolean
  default_delivery_fee:    number
  min_order_amount:        number
  estimated_delivery_time: number
  free_delivery_above:     number | null
  delivery_note:           string
}

export interface CachedDeliveryZone {
  id:             string
  restaurant_id:  string
  name:           string
  area:           string | null
  delivery_fee:   number
  min_order:      number
  estimated_time: number
  active:         boolean
  sort_order:     number
}

export interface DeliverySettingsData {
  general: CachedDeliveryGeneral
  zones:   CachedDeliveryZone[]
}

const GENERAL_DEFAULTS: CachedDeliveryGeneral = {
  delivery_enabled:        false,
  show_delivery_button:    true,
  default_delivery_fee:    0,
  min_order_amount:        0,
  estimated_delivery_time: 30,
  free_delivery_above:     null,
  delivery_note:           '',
}

async function fetchDeliverySettings(restaurantId: string): Promise<DeliverySettingsData> {
  const supabase = createClient()
  const [restRes, zonesRes] = await Promise.all([
    supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle(),
    supabase.from('delivery_zones').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
  ])
  if (restRes.error) throw restRes.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = ((restRes.data?.settings ?? {}) as any)
  return {
    general: {
      delivery_enabled:        s.delivery_enabled        ?? GENERAL_DEFAULTS.delivery_enabled,
      show_delivery_button:    s.show_delivery_button    ?? GENERAL_DEFAULTS.show_delivery_button,
      default_delivery_fee:    Number(s.default_delivery_fee    ?? 0),
      min_order_amount:        Number(s.min_order_amount        ?? 0),
      estimated_delivery_time: Number(s.estimated_delivery_time ?? 30),
      free_delivery_above:     s.free_delivery_above != null ? Number(s.free_delivery_above) : null,
      delivery_note:           s.delivery_note           ?? '',
    },
    zones: (zonesRes.data ?? []) as CachedDeliveryZone[],
  }
}

export function useDeliverySettings(restaurantId: string | null) {
  return useSWR<DeliverySettingsData>(
    restaurantId ? `delivery-settings-${restaurantId}` : null,
    () => fetchDeliverySettings(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
  )
}
