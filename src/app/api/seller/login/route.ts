import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { createSellerToken, SELLER_COOKIE } from '@/lib/session'

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'seller/login', 5, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  try {
    const { password } = await req.json()
    const sellerPassword = process.env.SELLER_PASSWORD

    if (!sellerPassword) {
      return NextResponse.json({ error: 'Seller password not configured.' }, { status: 500 })
    }

    if (!password || password !== sellerPassword) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }

    const token = await createSellerToken()

    const res = NextResponse.json({ ok: true })

    res.cookies.set(SELLER_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   2 * 3600,
    })

    return res
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}
