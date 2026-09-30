import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Postgres "function does not exist" / PostgREST "no such function in schema cache"
const RPC_ABSENT = new Set(['42883', 'PGRST202'])

/**
 * Ids of the restaurant's staff whose PIN is `pin`. Service-role client only.
 *
 * PINs live bcrypt-hashed in `staff_secrets` (migration 20260930_03) and are
 * compared inside Postgres by `staff_pin_match`, which only the service role
 * can execute. Until that migration has run, falls back to the legacy
 * plaintext `staff.pin` column so logins keep working across the deploy.
 */
export async function staffIdsWithPin(sb: SupabaseClient, restaurantId: string, pin: string): Promise<string[]> {
  const { data, error } = await sb.rpc('staff_pin_match', { p_restaurant_id: restaurantId, p_pin: pin })
  if (!error) return (data as string[] | null) ?? []
  if (!RPC_ABSENT.has(error.code ?? '')) throw error

  const { data: rows } = await sb.from('staff').select('id').eq('restaurant_id', restaurantId).eq('pin', pin)
  return (rows ?? []).map(r => r.id as string)
}
