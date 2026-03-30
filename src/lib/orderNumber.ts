import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Generates the next order number from order_number_settings,
 * increments the counter, and writes it to the orders record.
 * Returns the generated string (e.g. "ORD-008").
 */
export async function assignOrderNumber(
  supabase: SupabaseClient,
  restaurantId: string,
  orderId: string,
): Promise<string> {
  const { data } = await supabase
    .from('order_number_settings')
    .select('prefix, start_num, current_num')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  const num    = data?.current_num ?? data?.start_num ?? 1
  const prefix = data?.prefix ?? 'ORD-'
  const ordNum = `${prefix}${String(num).padStart(3, '0')}`

  await Promise.all([
    supabase
      .from('order_number_settings')
      .update({ current_num: num + 1, updated_at: new Date().toISOString() })
      .eq('restaurant_id', restaurantId),
    supabase
      .from('orders')
      .update({ order_num: ordNum })
      .eq('id', orderId),
  ])

  return ordNum
}
