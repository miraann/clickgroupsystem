import { useEffect } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { createClient } from '@/lib/supabase/client'

// ── Types ────────────────────────────────────────────────────────
export interface MenuRestaurant {
  id: string
  name: string
  logo_url: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any
}

export interface MenuCategory {
  id: string
  name: string
  color: string | null
  icon: string | null
  sort_order: number
}

export interface MenuOffer {
  id: string
  title: string
  description: string | null
  date_label: string | null
  image_url: string | null
}

export interface MenuItem {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category_id: string | null
  available_delivery: boolean
  available_guest: boolean
}

export interface KitchenNote {
  id: string
  text: string
}

export interface RestaurantMenuData {
  restaurant: MenuRestaurant | null
  categories: MenuCategory[]
  offers: MenuOffer[]
  items: MenuItem[]
  notes: KitchenNote[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: any | null
}

// ── Fetcher ──────────────────────────────────────────────────────
async function fetchRestaurantMenu(restaurantId: string): Promise<RestaurantMenuData> {
  const supabase = createClient()

  const [restaurant, categories, offers, items, notes, template] = await Promise.all([
    supabase.from('restaurants').select('id, name, logo_url, settings').eq('id', restaurantId).maybeSingle(),
    supabase.from('menu_categories').select('id, name, color, icon, sort_order').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order'),
    supabase.from('events_offers').select('id, title, description, date_label, image_url').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order'),
    supabase.from('menu_items').select('id, name, description, price, image_url, category_id, available_delivery, available_guest').eq('restaurant_id', restaurantId).eq('available', true).order('sort_order'),
    supabase.from('kitchen_notes').select('id, text').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order'),
    supabase.from('menu_template_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
  ])

  return {
    restaurant: restaurant.data ?? null,
    categories: (categories.data ?? []) as MenuCategory[],
    offers: (offers.data ?? []) as MenuOffer[],
    items: (items.data ?? []) as MenuItem[],
    notes: (notes.data ?? []) as KitchenNote[],
    template: template.data ?? null,
  }
}

// ── Hook ─────────────────────────────────────────────────────────
export function useRestaurantMenu(restaurantId: string | null) {
  const swrKey = restaurantId ? `restaurant-menu-${restaurantId}` : null

  const result = useSWR<RestaurantMenuData>(
    swrKey,
    () => fetchRestaurantMenu(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    }
  )

  // Realtime: revalidate whenever any menu_item row for this restaurant changes
  useEffect(() => {
    if (!restaurantId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`menu-items-rt-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${restaurantId}` },
        () => { swrMutate(`restaurant-menu-${restaurantId}`) },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  return result
}
