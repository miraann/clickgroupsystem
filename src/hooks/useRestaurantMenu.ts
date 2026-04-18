import useSWR from 'swr'
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
    supabase.from('menu_items').select('id, name, description, price, image_url, category_id').eq('restaurant_id', restaurantId).eq('available', true).order('sort_order'),
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
  return useSWR<RestaurantMenuData>(
    restaurantId ? `restaurant-menu-${restaurantId}` : null,
    () => fetchRestaurantMenu(restaurantId!),
    {
      revalidateOnFocus: false,       // don't re-fetch when tab regains focus
      dedupingInterval: 60_000,       // one fetch per minute max per restaurantId
      revalidateOnReconnect: true,    // re-fetch if internet was lost
      keepPreviousData: true,         // show stale data while revalidating
    }
  )
}
