import { NextResponse } from 'next/server'
import { RESTAURANT_COOKIE } from '@/lib/session'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(RESTAURANT_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
