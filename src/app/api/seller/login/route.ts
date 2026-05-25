import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { password } = await req.json()
    const sellerPassword = process.env.SELLER_PASSWORD

    if (!sellerPassword) {
      return NextResponse.json({ error: 'Seller password not configured.' }, { status: 500 })
    }

    if (!password || password !== sellerPassword) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}
