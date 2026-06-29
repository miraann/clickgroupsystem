import { NextRequest, NextResponse } from 'next/server'
import { SELLER_COOKIE, verifySellerToken } from '@/lib/session'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SELLER_COOKIE)?.value
  if (!token) return NextResponse.json({ ok: false }, { status: 401 })
  const valid = await verifySellerToken(token)
  return valid
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false }, { status: 401 })
}
