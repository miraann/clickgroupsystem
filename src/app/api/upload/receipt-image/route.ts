import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurantAccess } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'upload/receipt-image', 5)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json(
        { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set in environment variables. Add it to .env.local.' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false } }
    )

    const formData = await req.formData()
    const file         = formData.get('file')         as File   | null
    const restaurantId = formData.get('restaurantId') as string | null
    const type         = formData.get('type')         as string | null

    if (!file || !restaurantId || !type) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }

    const { error: authError } = await requireRestaurantAccess(restaurantId)
    if (authError) return authError

    if (type !== 'logo' && type !== 'qr') {
      return NextResponse.json({ ok: false, error: 'type must be logo or qr' }, { status: 400 })
    }

    const ext  = file.name.split('.').pop() ?? 'png'
    const path = `receipt/${restaurantId}/${type}.${ext}`
    const buf  = Buffer.from(await file.arrayBuffer())

    const { error } = await supabaseAdmin.storage
      .from('menu-images')
      .upload(path, buf, { upsert: true, contentType: file.type })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const { data } = supabaseAdmin.storage.from('menu-images').getPublicUrl(path)
    return NextResponse.json({ ok: true, url: data.publicUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
