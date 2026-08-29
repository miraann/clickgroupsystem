// Server-only. After a PIN check passes, sign the browser in as the
// restaurant's Supabase auth user (provisioned by scripts/provision-auth-users.mjs
// or the seller "create restaurant" route). This is what populates auth.uid()
// so the tenant RLS policies apply. The signed __pos_restaurant cookie is still
// set by the caller and remains the proxy gate (src/proxy.ts) / pre-migration fallback.

import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Writes Supabase `sb-*` session cookies onto `res` for the given restaurant.
 * Returns:
 *  - 'ok'            — session attached
 *  - 'not_provisioned' — restaurant has no email / auth_secret yet (run provisioning)
 *  - 'error'        — sign-in failed (bad secret, auth user missing, network)
 */
export async function attachRestaurantSupabaseSession(
  req: NextRequest,
  res: NextResponse,
  restaurantId: string,
): Promise<'ok' | 'not_provisioned' | 'error'> {
  const sb = admin()
  const [{ data: rest }, { data: secret }] = await Promise.all([
    sb.from('restaurants').select('email').eq('id', restaurantId).maybeSingle(),
    sb.from('restaurant_secrets').select('auth_secret').eq('restaurant_id', restaurantId).maybeSingle(),
  ])

  const email = (rest?.email ?? '').trim().toLowerCase()
  const authSecret = secret?.auth_secret ?? ''
  if (!email || !authSecret) return 'not_provisioned'

  const authed = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll().map(c => ({ name: c.name, value: c.value })),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    },
  )

  const { error } = await authed.auth.signInWithPassword({ email, password: authSecret })
  if (error) {
    console.error('[session-bridge] signInWithPassword failed:', error.message)
    return 'error'
  }
  return 'ok'
}
