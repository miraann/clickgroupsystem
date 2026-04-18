import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedInvFlags {
  enabled:      boolean
  showOnDash:   boolean
  autoDeduct:   boolean
  lowThreshold: number
}

export interface CachedInvCategory {
  id:         string
  name:       string
  color:      string
  sort_order: number
}

export interface CachedInvUnit {
  id:           string
  name:         string
  abbreviation: string
  sort_order:   number
}

export interface CachedInvItem {
  id:            string
  name:          string
  sku:           string | null
  category_id:   string | null
  unit_id:       string | null
  current_stock: number
  min_stock:     number
  cost_price:    number
  active:        boolean
  sort_order:    number
}

export interface InventoryData {
  flags:      CachedInvFlags
  categories: CachedInvCategory[]
  units:      CachedInvUnit[]
  items:      CachedInvItem[]
}

async function fetchInventoryData(restaurantId: string): Promise<InventoryData> {
  const supabase = createClient()
  const [restRes, catsRes, unitsRes, itemsRes] = await Promise.all([
    supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle(),
    supabase.from('inventory_categories').select('id, name, color, sort_order').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('inventory_units').select('id, name, abbreviation, sort_order').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('inventory_items').select('id, name, sku, category_id, unit_id, current_stock, min_stock, cost_price, active, sort_order').eq('restaurant_id', restaurantId).order('sort_order'),
  ])
  const s = (restRes.data?.settings ?? {}) as Record<string, unknown>
  return {
    flags: {
      enabled:      s.inventory_enabled       === true,
      showOnDash:   s.inventory_on_dashboard  !== false && s.inventory_enabled === true,
      autoDeduct:   s.inventory_auto_deduct   === true,
      lowThreshold: Number(s.inventory_low_threshold ?? 5),
    },
    categories: (catsRes.data  ?? []) as CachedInvCategory[],
    units:      (unitsRes.data ?? []) as CachedInvUnit[],
    items:      (itemsRes.data ?? []) as CachedInvItem[],
  }
}

export function useInventoryData(restaurantId: string | null) {
  return useSWR<InventoryData>(
    restaurantId ? `inventory-data-${restaurantId}` : null,
    () => fetchInventoryData(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
  )
}
