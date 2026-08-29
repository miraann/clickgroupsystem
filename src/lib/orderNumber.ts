import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Generates the next order number from order_number_settings, increments the
 * counter, and writes it to the orders record. Returns the generated string
 * (e.g. "ORD-008").
 *
 * Prefers the `guest_assign_order_number` SECURITY DEFINER function (added in
 * 20260829_02_tenant_rls.sql) so the guest / QR flow doesn't need anon UPDATE
 * rights. Falls back to the direct client path when that function isn't present
 * (pre-migration, or the offline-queue replay path).
 */
export async function assignOrderNumber(
  supabase: SupabaseClient,
  restaurantId: string,
  orderId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('guest_assign_order_number', {
    p_restaurant_id: restaurantId,
    p_order_id: orderId,
  })
  if (!error && typeof data === 'string' && data) return data

  return legacyAssignOrderNumber(supabase, restaurantId, orderId)
}

async function legacyAssignOrderNumber(
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

  const updates: Promise<unknown>[] = [
    supabase.from('orders').update({ order_num: ordNum }).eq('id', orderId) as unknown as Promise<unknown>,
  ]

  if (data) {
    updates.push(
      supabase.from('order_number_settings')
        .update({ current_num: num + 1, updated_at: new Date().toISOString() })
        .eq('restaurant_id', restaurantId) as unknown as Promise<unknown>
    )
  } else {
    updates.push(
      supabase.from('order_number_settings').insert({
        restaurant_id: restaurantId,
        prefix:        'ORD-',
        start_num:     1,
        current_num:   2,
        reset_period:  'never',
      }) as unknown as Promise<unknown>
    )
  }

  await Promise.all(updates)

  return ordNum
}
