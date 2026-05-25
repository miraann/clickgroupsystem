import type { SupabaseClient } from '@supabase/supabase-js'
import { assignOrderNumber } from '@/lib/orderNumber'

export interface QueuedItem {
  menu_item_id: string
  item_name:    string
  item_price:   number
  qty:          number
  note:         string | null
  station_id:   string | null
}

export interface QueuedOrder {
  local_id:      string
  restaurant_id: string
  table_number:  number
  table_label:   string
  guests:        number
  items:         QueuedItem[]
  queued_at:     string
  staff_id:      string | null
  staff_name:    string | null
}

const QUEUE_KEY = 'offline_order_queue'

export function getQueue(): QueuedOrder[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as QueuedOrder[]
  } catch { return [] }
}

export function enqueueOrder(order: Omit<QueuedOrder, 'local_id' | 'queued_at'>): QueuedOrder {
  const entry: QueuedOrder = {
    ...order,
    local_id:  crypto.randomUUID(),
    queued_at: new Date().toISOString(),
  }
  const queue = getQueue()
  queue.push(entry)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  return entry
}

export function dequeueOrder(localId: string): void {
  const queue = getQueue().filter(o => o.local_id !== localId)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY)
}

export function getQueueCount(): number {
  return getQueue().length
}

export async function syncAllQueued(
  supabase: SupabaseClient,
): Promise<{ synced: number; failed: number }> {
  const queue = getQueue()
  let synced = 0, failed = 0

  for (const bundle of queue) {
    try {
      // Find or create an active order for this table
      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('restaurant_id', bundle.restaurant_id)
        .eq('table_number', bundle.table_number)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let oid: string
      if (existing) {
        oid = existing.id
      } else {
        const { data: newOrder, error } = await supabase
          .from('orders')
          .insert({
            restaurant_id: bundle.restaurant_id,
            table_number:  bundle.table_number,
            guests:        bundle.guests,
            status:        'active',
            total:         0,
          })
          .select('id')
          .single()
        if (error || !newOrder) { failed++; continue }
        oid = newOrder.id
        await assignOrderNumber(supabase, bundle.restaurant_id, oid)
      }

      const rows = bundle.items.map(item => ({
        order_id:     oid,
        menu_item_id: item.menu_item_id,
        item_name:    item.item_name,
        item_price:   item.item_price,
        qty:          item.qty,
        status:       'sent',
        sent_at:      bundle.queued_at,
        note:         item.note,
        station_id:   item.station_id,
      }))

      const { error: insertErr } = await supabase.from('order_items').insert(rows)
      if (insertErr) { failed++; continue }

      // Recalculate total from all non-void items
      const { data: allItems } = await supabase
        .from('order_items')
        .select('item_price, qty')
        .eq('order_id', oid)
        .neq('status', 'void')
      const total = (allItems ?? []).reduce((s, i) => s + i.item_price * i.qty, 0)
      await supabase.from('orders').update({ total, updated_at: new Date().toISOString() }).eq('id', oid)

      dequeueOrder(bundle.local_id)
      synced++
    } catch {
      failed++
    }
  }

  return { synced, failed }
}
