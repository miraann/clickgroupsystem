import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, tooManyFailures, recordFailure } from '@/lib/rate-limit'
import { createPendingToken, RESTAURANT_PENDING_COOKIE } from '@/lib/session'
import { checkRestaurantPassword } from '@/lib/restaurant-password'

export async function POST(req: NextRequest) {
  if (!(await rateLimit(req, 'restaurant/login', 10, 60_000))) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  try {
    const { email, password } = await req.json() as { email?: string; password?: string }

    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    // Failed passwords are also counted per account, whatever IP they come from.
    const failKey = `restaurant/login:${email.trim().toLowerCase()}`
    if (await tooManyFailures(failKey, 10, 10 * 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    const check = await checkRestaurantPassword(email, password.trim())
    if (!check.ok) {
      if (check.status === 401) await recordFailure(failKey, 10 * 60_000)
      return NextResponse.json({ error: check.error }, { status: check.status })
    }
    const { restaurant } = check

    // Always require PIN step — issue a 5-min pending token and redirect to PIN page
    const pendingToken = await createPendingToken(restaurant.id)
    const res = NextResponse.json({
      requirePin: true,
      hasPin: check.hasOwnerPin,
      restaurant: { name: restaurant.name, menu_slug: restaurant.menu_slug },
    })
    res.cookies.set(RESTAURANT_PENDING_COOKIE, pendingToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   5 * 60,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
