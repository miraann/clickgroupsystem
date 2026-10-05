import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, serverError } from '@/lib/api-auth'
import { serviceClient } from '@/lib/supabase/service'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import { licenseKeyConfigured, createLicenseCode, recordLicense } from '@/lib/offlineCloud.server'

export const runtime = 'nodejs'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// Seller panel: licence / renewal codes for a restaurant's offline desktop
// app. The code is signed here and checked on the restaurant's PC with no
// internet; the restaurant types or pastes it into the app.
export async function POST(req: NextRequest) {
  if (IS_OFFLINE_EDITION) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await requireSeller()
  if (error) return error
  try {
    if (!licenseKeyConfigured()) {
      return NextResponse.json({ error: 'Offline licences are not set up on the server (OFFLINE_LICENSE_PRIVATE_KEY is missing).' }, { status: 500 })
    }
    const body = await req.json() as { restaurantId?: string; validUntil?: string; note?: string }
    const validUntil = body.validUntil ?? ''
    if (!body.restaurantId) return NextResponse.json({ error: 'Missing restaurant.' }, { status: 400 })
    const today = new Date().toISOString().slice(0, 10)
    if (!DATE.test(validUntil) || validUntil < today || validUntil > '2099-12-31') {
      return NextResponse.json({ error: 'Choose an end date from today on.' }, { status: 400 })
    }
    const admin = serviceClient()
    const { data: rest } = await admin.from('restaurants').select('id').eq('id', body.restaurantId).maybeSingle()
    if (!rest) return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })

    const code = createLicenseCode(body.restaurantId, validUntil)
    const recorded = await recordLicense(admin, body.restaurantId, validUntil, code, body.note?.trim() || null)
    return NextResponse.json({ ok: true, code, validUntil, recorded })
  } catch (e) {
    return serverError(e)
  }
}

export async function GET(req: NextRequest) {
  if (IS_OFFLINE_EDITION) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await requireSeller()
  if (error) return error
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  if (!restaurantId) return NextResponse.json({ error: 'Missing restaurant.' }, { status: 400 })
  const { data, error: qErr } = await serviceClient().from('offline_licenses')
    .select('id, valid_until, code, note, issued_at').eq('restaurant_id', restaurantId)
    .order('issued_at', { ascending: false }).limit(50)
  // Before the migration runs there is simply no history to show.
  return NextResponse.json({ licenses: qErr ? [] : data ?? [], keyConfigured: licenseKeyConfigured() })
}
