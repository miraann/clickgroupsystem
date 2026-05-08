import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedMenuItem {
  id:            string
  category_id:   string | null
  name:          string
  description:   string
  price:         number
  cost:          number
  image_url:     string | null
  available:     boolean
  has_modifiers: boolean
  sort_order:    number
}

export interface MenuItemsData {
  items:  CachedMenuItem[]
  modMap: Map<string, string[]>
}

async function fetchMenuItems(restaurantId: string): Promise<MenuItemsData> {
  const supabase = createClient()
  const [{ data: items, error: e1 }, { data: itemMods, error: e2 }] = await Promise.all([
    supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('menu_item_modifiers').select('item_id, modifier_id'),
  ])
  if (e1 || e2) throw e1 ?? e2

  const modMap = new Map<string, string[]>()
  ;(itemMods ?? []).forEach((r: { item_id: string; modifier_id: string }) => {
    const arr = modMap.get(r.item_id) ?? []
    arr.push(r.modifier_id)
    modMap.set(r.item_id, arr)
  })

  return { items: (items ?? []) as CachedMenuItem[], modMap }
}

export function useMenuItems(restaurantId: string | null) {
  return useSWR<MenuItemsData>(
    restaurantId ? `menu-items-${restaurantId}` : null,
    () => fetchMenuItems(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 30_000, keepPreviousData: true },
  )
}
