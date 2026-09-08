import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Atomic "send to kitchen".
 *
 * One round-trip that, inside a single DB transaction and under a per-table
 * advisory lock, finds-or-creates the table's active order, assigns its order
 * number, and inserts every item. Replaces the old 4-step client sequence
 * (find/insert order → assign number → insert items → update total) that could
 * half-complete on a dropped connection and let two devices open the same
 * table twice.
 *
 * Returns `null` when the `pos_send_to_kitchen` RPC isn't deployed yet, so
 * callers fall back to the legacy path (same shape as `assignOrderNumber`).
 * Any other RPC error is thrown.
 */

export interface SendItemInput {
  menu_item_id: string | null
  item_name:    string
  item_price:   number
  qty:          number
  note:         string | null
  station_id:   string | null
}

export interface SentItem {
  id:         string
  item_name:  string
  item_price: number
  qty:        number
  status:     string
  note:       string | null
}

export interface SendResult {
  order_id:  string
  order_num: string | null
  is_new:    boolean
  items:     SentItem[]
  total:     number
}

// Postgres "function does not exist" / PostgREST "no such function in schema cache"
const RPC_ABSENT = new Set(['42883', 'PGRST202'])

export async function sendToKitchenAtomic(
  supabase: SupabaseClient,
  args: {
    restaurantId: string
    tableNumber:  number
    guests:       number
    items:        SendItemInput[]
    source?:      'staff' | 'guest'
    itemStatus?:  'sent' | 'pending'
  },
): Promise<SendResult | null> {
  const { data, error } = await supabase.rpc('pos_send_to_kitchen', {
    p_restaurant_id: args.restaurantId,
    p_table_number:  args.tableNumber,
    p_guests:        args.guests,
    p_items:         args.items,
    p_source:        args.source ?? 'staff',
    p_item_status:   args.itemStatus ?? 'sent',
  })

  if (error) {
    if (RPC_ABSENT.has(error.code ?? '')) return null
    throw error
  }
  return data as SendResult
}
