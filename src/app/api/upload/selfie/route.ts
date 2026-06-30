import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'upload/selfie', 10)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' },
      { status: 500 }
    )
  }

  try {
    const body = await req.json() as { dataUrl?: string }
    const { dataUrl } = body

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid image data' }, { status: 400 })
    }

    // Detect mime type and extension from the dataUrl
    const mimeMatch = dataUrl.match(/^data:(image\/[\w+.-]+);base64,/)
    const mimeType  = mimeMatch?.[1] ?? 'image/jpeg'
    const ext       = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/png' ? 'png' : 'jpg'

    const base64 = dataUrl.replace(/^data:image\/[\w+.-]+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    const fileName = `selfie_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false } }
    )

    const { data, error } = await supabaseAdmin.storage
      .from('customer-selfies')
      .upload(fileName, buffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('customer-selfies')
      .getPublicUrl(data.path)

    return NextResponse.json({ ok: true, url: publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
