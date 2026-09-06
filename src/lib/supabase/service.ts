import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — bypasses RLS. Only for server routes that have
 * already authorized the caller (requireRestaurant / requirePermission) and that
 * scope every query to the session's restaurant_id themselves.
 */
export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
