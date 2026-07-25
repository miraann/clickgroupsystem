import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Lightweight check for printer/device endpoints: verifies the restaurantId
 * exists in the database without requiring a Supabase user auth session.
 * Safe to use for endpoints that only return ESC/POS bytes or device info.
 */
export async function requireRestaurantId(restaurantId: string) {
  if (!restaurantId) {
    return { error: NextResponse.json({ error: 'Missing restaurantId' }, { status: 400 }) }
  }
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .maybeSingle()
  if (!data) {
    return { error: NextResponse.json({ error: 'Restaurant not found' }, { status: 404 }) }
  }
  return { error: null }
}

/**
 * Verifies the request has a valid session AND that the authenticated user
 * belongs to the given restaurantId (either as owner or staff member).
 * Returns the user + supabase client on success, or a ready-made error response.
 */
export async function requireRestaurantAccess(restaurantId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, supabase: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  // Check owner first (owners may not have a restaurant_users row)
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('owner_id')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    return { user: null, supabase: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  if (restaurant.owner_id !== user.id) {
    const { data: staff } = await supabase
      .from('restaurant_users')
      .select('id')
      .eq('user_id', user.id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (!staff) {
      return { user: null, supabase: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
  }

  return { user, supabase, error: null }
}

/**
 * Verifies the request has a valid session.
 * For routes that don't access restaurant data (device scan, printer test, etc.)
 */
export async function requireAuth() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { user, error: null }
}
