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

// Not concurrency-safe (plain read-then-write, no row lock) and, for an
// anon-key / PIN-login session, `order_number_settings` is RLS-restricted to
// `authenticated` (see 20260829_02_tenant_rls.sql) — the select below comes
// back empty rather than erroring, which used to make every call silently
// compute the SAME fallback number ("ORD-001") and swallow the resulting
// write failures (unchecked `Promise.all`), handing out that duplicate number
// as if it had succeeded. This path should only ever run when the
// `guest_assign_order_number` RPC itself is unavailable (see assignOrderNumber
// above); every write here is now checked so a failure surfaces as a real
// error instead of a silently-wrong order number.
async function legacyAssignOrderNumber(
  supabase: SupabaseClient,
  restaurantId: string,
  orderId: string,
): Promise<string> {
  const { data, error: selectErr } = await supabase
    .from('order_number_settings')
    .select('prefix, start_num, current_num')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (selectErr) throw selectErr

  const num    = data?.current_num ?? data?.start_num ?? 1
  const prefix = data?.prefix ?? 'ORD-'
  const ordNum = `${prefix}${String(num).padStart(3, '0')}`

  const { error: orderErr } = await supabase.from('orders').update({ order_num: ordNum }).eq('id', orderId)
  if (orderErr) throw orderErr

  if (data) {
    const { error: counterErr } = await supabase
      .from('order_number_settings')
      .update({ current_num: num + 1, updated_at: new Date().toISOString() })
      .eq('restaurant_id', restaurantId)
    if (counterErr) throw counterErr
  } else {
    const { error: insertErr } = await supabase.from('order_number_settings').insert({
      restaurant_id: restaurantId,
      prefix:        'ORD-',
      start_num:     1,
      current_num:   2,
      reset_period:  'never',
    })
    if (insertErr) throw insertErr
  }

  return ordNum
}
