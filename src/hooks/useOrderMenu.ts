'use client'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { DbCategory, DbMenuItem, KitchenNote } from '@/app/(restaurant)/dashboard/order/[table]/types'

export interface OrderMenuData {
  categories:    DbCategory[]
  menuItems:     DbMenuItem[]
  kitchenNotes:  KitchenNote[]
  /** category_id -> station_id */
  catStationMap: [string, string][]
}

export const ORDER_MENU_KEY = (id: string) => `order-menu-v1-${id}`

const EMPTY: OrderMenuData = { categories: [], menuItems: [], kitchenNotes: [], catStationMap: [] }

async function fetchOrderMenu(rid: string): Promise<OrderMenuData> {
  const supabase = createClient()

  const [catsRes, itemsRes, notesRes, stationCatRes] = await Promise.all([
    supabase.from('menu_categories').select('id,name,color')
      .eq('restaurant_id', rid).eq('active', true).order('sort_order'),
    supabase.from('menu_items').select('id,name,price,category_id,image_url')
      .eq('restaurant_id', rid).eq('available', true).order('sort_order'),
    supabase.from('kitchen_notes').select('id,text')
      .eq('restaurant_id', rid).eq('active', true).order('sort_order'),
    // kds_station_categories has no restaurant_id column by design — it holds
    // menu-structure links and is tenant-scoped via its parent kds_stations RLS.
    supabase.from('kds_station_categories').select('station_id,category_id'),
  ])

  return {
    categories:   (catsRes.data  ?? []) as DbCategory[],
    menuItems:    (itemsRes.data ?? []) as DbMenuItem[],
    kitchenNotes: (notesRes.data ?? []) as KitchenNote[],
    catStationMap: ((stationCatRes.data ?? []) as { station_id: string; category_id: string }[])
      .map(a => [a.category_id, a.station_id] as [string, string]),
  }
}

/**
 * Menu data (categories / items / kitchen notes / station map) shared across
 * every order screen for a restaurant. Changes rarely, so it is cached and
 * reused between table opens instead of re-fetched each navigation.
 */
export function useOrderMenu(restaurantId: string | null) {
  const { data, isLoading } = useSWR<OrderMenuData>(
    restaurantId ? ORDER_MENU_KEY(restaurantId) : null,
    () => fetchOrderMenu(restaurantId!),
    {
      revalidateOnFocus: true,     // pick up menu edits on refocus
      dedupingInterval:  30_000,
      keepPreviousData:  true,
    },
  )
  return { menu: data ?? EMPTY, loading: isLoading && !data }
}
