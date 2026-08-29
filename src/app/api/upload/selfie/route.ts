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

    const base64 = dataUrl.replace(/^data:image\/[\w+.-]+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    // Size cap — this endpoint is public (guest delivery checkout), so bound it.
    const MAX_BYTES = 3 * 1024 * 1024
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'Image must be under 3 MB' }, { status: 413 })
    }

    // Magic-byte check — reject anything that isn't a real JPEG / PNG / WebP.
    const hex = buffer.subarray(0, 4).toString('hex')
    const mimeType =
      hex.startsWith('ffd8ff') ? 'image/jpeg' :
      hex === '89504e47'       ? 'image/png'  :
      (buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
       buffer.subarray(8, 12).toString('ascii') === 'WEBP') ? 'image/webp' : null
    if (!mimeType) {
      return NextResponse.json({ ok: false, error: 'File is not a valid image' }, { status: 400 })
    }
    const ext = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/png' ? 'png' : 'jpg'

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
      console.error('[upload/selfie]', error)
      return NextResponse.json({ ok: false, error: 'Upload failed' }, { status: 500 })
    }

    // Prefer a signed URL so the bucket can be flipped to private without
    // breaking delivery-order identity verification. Falls back to the public
    // URL if signing is unavailable.
    const signed = await supabaseAdmin.storage
      .from('customer-selfies')
      .createSignedUrl(data.path, 60 * 60 * 24 * 365)
    const url = signed.data?.signedUrl
      ?? supabaseAdmin.storage.from('customer-selfies').getPublicUrl(data.path).data.publicUrl

    return NextResponse.json({ ok: true, url })
  } catch (err) {
    console.error('[upload/selfie]', err)
    return NextResponse.json({ ok: false, error: 'Upload failed' }, { status: 500 })
  }
}
