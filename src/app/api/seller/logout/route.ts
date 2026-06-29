import { NextResponse } from 'next/server'
import { SELLER_COOKIE } from '@/lib/session'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SELLER_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
