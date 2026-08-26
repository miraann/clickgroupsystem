import { useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export type InventoryNotificationType =
  | 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired'
  | 'rapid_depletion' | 'restock' | 'manual_adjustment'

export type InventoryNotificationSeverity = 'info' | 'warning' | 'critical'

export interface InventoryNotification {
  id:                string
  restaurant_id:     string
  inventory_item_id: string | null
  type:              InventoryNotificationType
  severity:          InventoryNotificationSeverity
  message:           string
  metadata:          Record<string, unknown>
  is_read:           boolean
  created_at:        string
  item_name:         string | null
}

const PAGE_SIZE = 50

async function fetchNotifications(restaurantId: string): Promise<InventoryNotification[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('inventory_notifications')
    .select('*, inventory_items(name)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (error) throw error
  return ((data ?? []) as Array<InventoryNotification & { inventory_items: { name: string } | null }>)
    .map(({ inventory_items, ...rest }) => ({ ...rest, item_name: inventory_items?.name ?? null }))
}

export function useInventoryNotifications(restaurantId: string | null) {
  const key = restaurantId ? `inventory-notifications-${restaurantId}` : null
  const { data, error, isLoading, mutate } = useSWR<InventoryNotification[]>(
    key,
    () => fetchNotifications(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 15_000, keepPreviousData: true }
  )

  // Realtime: new notifications stream in immediately; reads/updates elsewhere
  // (e.g. another staff device marking one read) stay in sync too.
  useEffect(() => {
    if (!restaurantId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`inv-notif-${restaurantId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'inventory_notifications',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, () => {
        // Revalidate (rather than splicing payload.new) so the joined
        // inventory_items.name is populated for the new row.
        mutate()
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'inventory_notifications',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, payload => {
        const row = payload.new as InventoryNotification
        // Merge only the raw columns — payload.new has no joined item_name,
        // so keep whatever is already cached for that field.
        mutate(prev => prev?.map(n => n.id === row.id ? { ...n, ...row, item_name: n.item_name } : n), { revalidate: false })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [restaurantId, mutate])

  const markAsRead = useCallback(async (id: string) => {
    const supabase = createClient()
    mutate(prev => prev?.map(n => n.id === id ? { ...n, is_read: true } : n), { revalidate: false })
    const { error } = await supabase.from('inventory_notifications').update({ is_read: true }).eq('id', id)
    if (error) mutate() // resync on failure
  }, [mutate])

  const markAllAsRead = useCallback(async () => {
    if (!restaurantId) return
    const supabase = createClient()
    mutate(prev => prev?.map(n => ({ ...n, is_read: true })), { revalidate: false })
    const { error } = await supabase
      .from('inventory_notifications')
      .update({ is_read: true })
      .eq('restaurant_id', restaurantId)
      .eq('is_read', false)
    if (error) mutate()
  }, [restaurantId, mutate])

  const notifications = data ?? []
  const unreadCount = notifications.filter(n => !n.is_read).length

  return { notifications, unreadCount, isLoading, error, markAsRead, markAllAsRead, refresh: mutate }
}
