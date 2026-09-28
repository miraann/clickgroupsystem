import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { checkRestaurantPassword } from '@/lib/restaurant-password'
import { attachRestaurantSupabaseSession } from '@/lib/supabase/session-bridge'

// Pairs a Customer Facing Display with a restaurant. Unlike the dashboard
// login there is no PIN step and no __pos_restaurant cookie — the display gets
// only a Supabase session, which is what lets it read its own restaurant's
// active order + items (and receive their realtime changes) under tenant RLS
// now that orders / order_items are no longer anon-readable.
export async function POST(req: NextRequest) {
  if (!(await rateLimit(req, 'cfd/pair', 10, 60_000))) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  try {
    const { email, password } = await req.json() as { email?: string; password?: string }
    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const check = await checkRestaurantPassword(email, password.trim())
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status })
    }
    const { restaurant } = check

    const res = NextResponse.json({
      ok: true,
      restaurant: { name: restaurant.name, menu_slug: restaurant.menu_slug },
    })
    const bridge = await attachRestaurantSupabaseSession(req, res, restaurant.id)
    if (bridge !== 'ok') {
      console.error('[cfd/pair] supabase session not attached:', bridge)
      return NextResponse.json({ error: 'This restaurant is not fully set up yet. Contact support.' }, { status: 503 })
    }
    return res
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
