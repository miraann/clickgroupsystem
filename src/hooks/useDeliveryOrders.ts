import { useEffect } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import { createClient } from '@/lib/supabase/client'

type DeliveryStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled'

export interface CachedDeliveryItem {
  id: string
  item_name: string
  item_price: number
  qty: number
  note: string | null
  status: string
  image_url: string | null
}

export interface CachedDeliveryOrder {
  delivery_id: string
  order_id: string
  customer_name: string
  customer_phone: string
  latitude: number | null
  longitude: number | null
  address_text: string | null
  delivery_fee: number
  status: DeliveryStatus
  created_at: string
  order_total: number
  order_num: string | null
  driver_id: string | null
  driver_name: string | null
  selfie_url: string | null
  items: CachedDeliveryItem[]
}

async function fetchDeliveryOrders(restaurantId: string): Promise<CachedDeliveryOrder[]> {
  const supabase = createClient()

  const [{ data }, { data: menuItems }] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, total, order_num, created_at,
        delivery_orders ( id, customer_name, customer_phone, latitude, longitude, address_text, delivery_fee, status, driver_id, driver_name, selfie_url ),
        order_items ( id, item_name, item_price, qty, note, status )
      `)
      .eq('restaurant_id', restaurantId)
      .eq('source', 'delivery')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('menu_items').select('name, image_url').eq('restaurant_id', restaurantId),
  ])

  const imageMap = new Map<string, string | null>()
  for (const mi of (menuItems ?? [])) imageMap.set(mi.name, mi.image_url ?? null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).flatMap((row: any) => {
    const di = Array.isArray(row.delivery_orders) ? row.delivery_orders[0] : row.delivery_orders
    if (!di) return []
    return [{
      delivery_id:    di.id,
      order_id:       row.id,
      customer_name:  di.customer_name,
      customer_phone: di.customer_phone,
      latitude:       di.latitude,
      longitude:      di.longitude,
      address_text:   di.address_text ?? null,
      delivery_fee:   di.delivery_fee ?? 0,
      status:         di.status as DeliveryStatus,
      created_at:     row.created_at,
      order_total:    row.total ?? 0,
      order_num:      row.order_num ?? null,
      driver_id:      di.driver_id ?? null,
      driver_name:    di.driver_name ?? null,
      selfie_url:     di.selfie_url ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (row.order_items ?? [])
        .filter((i: any) => di.status === 'cancelled' ? true : i.status !== 'void')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((i: any) => ({ ...i, image_url: imageMap.get(i.item_name) ?? null })),
    }]
  })
}

export function useDeliveryOrders(restaurantId: string | null) {
  const swrKey = restaurantId ? `delivery-orders-${restaurantId}` : null

  const result = useSWR<CachedDeliveryOrder[]>(
    swrKey,
    () => fetchDeliveryOrders(restaurantId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 8_000,
      keepPreviousData: true,
    }
  )

  // Realtime: revalidate on any order or delivery_orders change for this restaurant
  useEffect(() => {
    if (!restaurantId) return
    const supabase = createClient()
    const revalidate = () => swrMutate(`delivery-orders-${restaurantId}`)
    const channel = supabase
      .channel(`delivery-orders-hook-rt-${restaurantId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders',          filter: `restaurant_id=eq.${restaurantId}` }, revalidate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_orders'                                              }, revalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'delivery_orders'                                              }, revalidate)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  return result
}
