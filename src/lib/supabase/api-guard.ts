import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Verifies the request has a valid session AND that the authenticated user
 * belongs to the given restaurantId (either as owner or staff member).
 * Returns the user + supabase client on success, or a ready-made error response.
 */
export async function requireRestaurantAccess(restaurantId: string) {
  const supabase = await createClient()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { user, error: null }
}
