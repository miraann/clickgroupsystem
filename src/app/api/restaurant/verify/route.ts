import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { RESTAURANT_COOKIE, verifyRestaurantToken } from '@/lib/session'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(RESTAURANT_COOKIE)?.value
  if (!token) return NextResponse.json({ ok: false }, { status: 401 })

  const session = await verifyRestaurantToken(token)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data } = await supabase
    .from('restaurants')
    .select('id, name, menu_slug')
    .eq('id', session.rid)
    .maybeSingle()

  if (!data) return NextResponse.json({ ok: false }, { status: 401 })

  return NextResponse.json({ ok: true, restaurant: data, role: session.role })
}
