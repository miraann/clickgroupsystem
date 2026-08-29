import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'
import {
  verifyPendingToken, RESTAURANT_PENDING_COOKIE,
  createRestaurantToken, RESTAURANT_COOKIE,
} from '@/lib/session'
import { verifySecret } from '@/lib/crypto'
import { attachRestaurantSupabaseSession } from '@/lib/supabase/session-bridge'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'restaurant/verify-pin', 5, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  try {
    const pendingCookie = req.cookies.get(RESTAURANT_PENDING_COOKIE)?.value
    if (!pendingCookie) {
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 })
    }

    const rid = await verifyPendingToken(pendingCookie)
    if (!rid) {
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 })
    }

    const { pin } = await req.json() as { pin?: string }
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'Invalid PIN.' }, { status: 400 })
    }

    const supabase = serviceClient()
    const [{ data: restaurant }, { data: secretRow }] = await Promise.all([
      supabase.from('restaurants').select('id, name, menu_slug, settings').eq('id', rid).maybeSingle(),
      supabase.from('restaurant_secrets').select('owner_pin_hash').eq('restaurant_id', rid).maybeSingle(),
    ])

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    const settings = (restaurant.settings ?? {}) as Record<string, unknown>
    const pinHash = secretRow?.owner_pin_hash as string | undefined
    const legacyPin = settings.owner_pin as string | undefined

    if (!pinHash && !legacyPin) {
      return NextResponse.json({ error: 'No PIN configured. Ask your seller administrator to set an owner PIN.' }, { status: 403 })
    }

    const pinOk = pinHash ? await verifySecret(pin, pinHash) : pin === legacyPin
    if (!pinOk) {
      return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
    }

    const token = await createRestaurantToken(restaurant.id, 'owner')

    const res = NextResponse.json({
      ok: true,
      restaurant: {
        id:        restaurant.id,
        name:      restaurant.name,
        menu_slug: restaurant.menu_slug,
      },
    })

    res.cookies.set(RESTAURANT_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   8 * 3600,
    })

    // Clear the pending cookie
    res.cookies.set(RESTAURANT_PENDING_COOKIE, '', {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   0,
    })

    // Mint a real Supabase session so RLS (auth.uid()) applies in the browser.
    const bridge = await attachRestaurantSupabaseSession(req, res, restaurant.id)
    if (bridge !== 'ok') console.warn('[verify-pin] supabase session not attached:', bridge)

    return res
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
