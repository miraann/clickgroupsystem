import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { KeyedMutator } from 'swr'

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
  center_lat?:    number | null
  center_lng?:    number | null
  radius_meters?: number | null
  polygon?:       { lat: number; lng: number }[] | null
}

export type ZoneDraft = Omit<CachedDeliveryZone, 'id' | 'restaurant_id'>

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
  const swr = useSWR<DeliverySettingsData>(
    restaurantId ? `delivery-settings-${restaurantId}` : null,
    () => fetchDeliverySettings(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
  )

  return {
    ...swr,
    addZone:    (zone: ZoneDraft) => addDeliveryZone(restaurantId!, zone, swr.mutate),
    updateZone: (id: string, patch: Partial<ZoneDraft>) => updateDeliveryZone(restaurantId!, id, patch, swr.mutate),
    deleteZone: (id: string) => deleteDeliveryZone(restaurantId!, id, swr.mutate),
    toggleZone: (id: string, active: boolean) => updateDeliveryZone(restaurantId!, id, { active }, swr.mutate),
  }
}

async function addDeliveryZone(
  restaurantId: string, zone: ZoneDraft, mutate: KeyedMutator<DeliverySettingsData>,
) {
  const supabase = createClient()
  const { error } = await supabase.from('delivery_zones').insert({ ...zone, restaurant_id: restaurantId })
  if (error) throw error
  await mutate()
}

async function updateDeliveryZone(
  restaurantId: string, id: string, patch: Partial<ZoneDraft>, mutate: KeyedMutator<DeliverySettingsData>,
) {
  const supabase = createClient()
  const { error } = await supabase.from('delivery_zones').update(patch).eq('id', id).eq('restaurant_id', restaurantId)
  if (error) throw error
  await mutate()
}

async function deleteDeliveryZone(
  restaurantId: string, id: string, mutate: KeyedMutator<DeliverySettingsData>,
) {
  const supabase = createClient()
  const { error } = await supabase.from('delivery_zones').delete().eq('id', id).eq('restaurant_id', restaurantId)
  if (error) throw error
  await mutate()
}
