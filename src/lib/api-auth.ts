// Server-side auth helpers for route handlers.
//
// These verify the signed session cookies issued by the login routes
// (src/lib/session.ts). They are the real security boundary for API routes —
// the client-side <AuthGuard> components are UX only and must never be relied
// on for access control.

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  verifyRestaurantToken, RESTAURANT_COOKIE, type RestaurantSession,
  verifySellerToken, SELLER_COOKIE,
} from '@/lib/session'

type Guard<T> =
  | { session: T; error: null }
  | { session: null; error: NextResponse }

/**
 * Require a valid restaurant session (owner or staff). When `restaurantId` is
 * passed, also require the session to belong to that restaurant.
 */
export async function requireRestaurant(restaurantId?: string): Promise<Guard<RestaurantSession>> {
  const token = (await cookies()).get(RESTAURANT_COOKIE)?.value
  const session = token ? await verifyRestaurantToken(token) : null
  if (!session) {
    return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (restaurantId && session.rid !== restaurantId) {
    return { session: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, error: null }
}

/** Read the restaurant session if present, without failing the request. */
export async function getRestaurantSession(): Promise<RestaurantSession | null> {
  const token = (await cookies()).get(RESTAURANT_COOKIE)?.value
  return token ? verifyRestaurantToken(token) : null
}

/** Require a valid seller session. */
export async function requireSeller(): Promise<Guard<true>> {
  const token = (await cookies()).get(SELLER_COOKIE)?.value
  const ok = token ? await verifySellerToken(token) : false
  if (!ok) {
    return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { session: true, error: null }
}

/** Generic 500 that never leaks a driver/DB message to the client. */
export function serverError(e: unknown): NextResponse {
  console.error('[api]', e)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}
