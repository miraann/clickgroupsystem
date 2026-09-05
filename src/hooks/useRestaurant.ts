'use client'
import useSWR, { mutate } from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface RestaurantRow {
  id:        string
  name:      string
  logo_url:  string | null
  settings:  Record<string, unknown>
  menu_slug: string | null
  owner_id:  string | null
}

export const RESTAURANT_KEY = (id: string) => `restaurant-v1-${id}`

function currentRestaurantId(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
}

async function fetchRestaurant(id: string): Promise<RestaurantRow | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('restaurants')
    .select('id, name, logo_url, settings, menu_slug, owner_id')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  return {
    id:        row.id,
    name:      row.name ?? '',
    logo_url:  row.logo_url ?? null,
    settings:  (row.settings as Record<string, unknown>) ?? {},
    menu_slug: row.menu_slug ?? null,
    owner_id:  row.owner_id ?? null,
  }
}

/**
 * Shared, deduped read of the tenant `restaurants` row. Every consumer that
 * used to issue its own `restaurants` query (favicon, appearance, permissions,
 * dashboard, order screen, settings) reads from this single SWR key instead —
 * one round-trip per session instead of 5-6 per navigation.
 */
export function useRestaurant(restaurantId?: string | null) {
  const id = restaurantId ?? currentRestaurantId()
  const { data, isLoading, mutate: revalidate } = useSWR<RestaurantRow | null>(
    id ? RESTAURANT_KEY(id) : null,
    () => fetchRestaurant(id!),
    {
      revalidateOnFocus: false,
      dedupingInterval:  60_000,  // row rarely changes within a shift
      keepPreviousData:  true,
    },
  )
  return { restaurant: data ?? null, loading: isLoading, revalidate }
}

/** Convenience selector — just the parsed `settings` blob. */
export function useRestaurantSettingsValue(restaurantId?: string | null): Record<string, unknown> {
  return useRestaurant(restaurantId).restaurant?.settings ?? {}
}

/**
 * Fire-and-forget cache write. Pass `patch` to optimistically merge fields
 * (e.g. after a settings save); pass nothing to force a revalidation.
 */
export function mutateRestaurant(id: string, patch?: Partial<RestaurantRow>) {
  if (patch) {
    mutate(
      RESTAURANT_KEY(id),
      (prev: RestaurantRow | null | undefined) => (prev ? { ...prev, ...patch } : prev),
      false,
    )
  } else {
    mutate(RESTAURANT_KEY(id))
  }
}
