import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'
import { requireRestaurant, serverError } from '@/lib/api-auth'

export const runtime = 'nodejs'

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB
// SVG is intentionally excluded — it can carry script and these files are
// served from a public bucket.
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])

// Magic-byte sniff — don't trust the client-provided content type.
function sniff(buf: Buffer): string | null {
  const hex = buf.subarray(0, 4).toString('hex')
  if (hex.startsWith('ffd8ff')) return 'image/jpeg'
  if (hex === '89504e47') return 'image/png'
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'upload/receipt-image', 5)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ ok: false, error: 'Server storage is not configured.' }, { status: 500 })
    }

    const formData = await req.formData()
    const file         = formData.get('file')         as File   | null
    const restaurantId = formData.get('restaurantId') as string | null
    const type         = formData.get('type')         as string | null

    if (!file || !restaurantId || !type) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Auth: caller must be signed in to this restaurant.
    const { session, error: authErr } = await requireRestaurant(restaurantId)
    if (authErr) return authErr

    if (type !== 'logo' && type !== 'qr') {
      return NextResponse.json({ ok: false, error: 'type must be logo or qr' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'Image must be between 1 byte and 4 MB' }, { status: 413 })
    }
    const sniffed = sniff(buf)
    if (!sniffed || !ALLOWED.has(sniffed)) {
      return NextResponse.json({ ok: false, error: 'File is not a supported image (PNG, JPEG, WebP, SVG)' }, { status: 400 })
    }

    const ext = sniffed === 'image/jpeg' ? 'jpg'
      : sniffed === 'image/png' ? 'png' : 'webp'
    // Path is derived from the verified session, never a raw request field.
    const path = `receipt/${session.rid}/${type}.${ext}`

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { persistSession: false },
    })

    const { error } = await supabaseAdmin.storage
      .from('menu-images')
      .upload(path, buf, { upsert: true, contentType: sniffed })

    if (error) return serverError(error)

    const { data } = supabaseAdmin.storage.from('menu-images').getPublicUrl(path)
    return NextResponse.json({ ok: true, url: data.publicUrl })
  } catch (err: unknown) {
    return serverError(err)
  }
}
