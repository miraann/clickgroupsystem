import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, tooManyFailures, recordFailure } from '@/lib/rate-limit'
import { checkRestaurantPassword } from '@/lib/restaurant-password'
import { serviceClient } from '@/lib/supabase/service'
import { serverError } from '@/lib/api-auth'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import {
  latestLicense, createInstall, isIssuedLicense, recordLicense, registerPcRestaurant,
} from '@/lib/offlineCloud.server'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// An offline PC that was set up without internet (setup file, or a restaurant
// made on the PC) switching on "send sales to the online system". The owner
// signs in; the PC gets a token to upload with.
//  - The restaurant exists online: its usual email + password.
//  - Made on the PC: the online system doesn't know it, so the licence code
//    the seller issued for its id is the proof the seller approved it. The
//    first call answers needsSetup; the PC calls again with its set-up, and
//    the restaurant is created online with the same ids.
export async function POST(req: NextRequest) {
  if (IS_OFFLINE_EDITION) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await rateLimit(req, 'offline-cloud/connect', 5, 60_000))) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  try {
    const body = await req.json() as {
      email?: string; password?: string; restaurantId?: string; license?: string | null
      setup?: Parameters<typeof registerPcRestaurant>[1]['setup']
    }
    const email = body.email?.trim().toLowerCase()
    const rid = body.restaurantId ?? ''
    if (!email || !body.password || !UUID.test(rid)) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })

    const admin = serviceClient()
    const { data: existing } = await admin.from('restaurants').select('id, status').eq('id', rid).maybeSingle()

    if (existing) {
      const failKey = `restaurant/login:${email}`
      if (await tooManyFailures(failKey, 10, 10 * 60_000)) {
        return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
      }
      const check = await checkRestaurantPassword(email, body.password)
      if (!check.ok) {
        if (check.status === 401) await recordFailure(failKey, 10 * 60_000)
        return NextResponse.json({ error: check.error }, { status: check.status })
      }
      if (check.restaurant.id !== rid) {
        return NextResponse.json({ error: 'That email belongs to a different restaurant online.' }, { status: 403 })
      }
      if (existing.status === 'suspended') {
        return NextResponse.json({ error: 'This restaurant is suspended. Contact your seller.' }, { status: 403 })
      }
      const token = await createInstall(admin, rid)
      if (!token) return serverError(new Error('offline_installs is missing'))
      return NextResponse.json({ install: { token, restaurantId: rid }, license: await latestLicense(admin, rid), serverTime: Date.now() })
    }

    const issued = isIssuedLicense(body.license, rid)
    if (!issued.ok) {
      return NextResponse.json({ error: 'The online system does not know this restaurant. Enter the licence code from your seller first.' }, { status: 403 })
    }
    if (!body.setup) return NextResponse.json({ needsSetup: true }, { status: 409 })
    if (body.password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    const { data: taken } = await admin.from('restaurants').select('id').eq('email', email).maybeSingle()
    if (taken) return NextResponse.json({ error: 'Another restaurant online already uses this email.' }, { status: 409 })

    let uploads
    try {
      ({ uploads } = await registerPcRestaurant(admin, { restaurantId: rid, email, password: body.password, setup: body.setup }))
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status) return NextResponse.json({ error: (e as Error).message }, { status })
      throw e
    }
    await recordLicense(admin, rid, issued.validUntil!, body.license!, 'made on the offline PC')
    const token = await createInstall(admin, rid)
    if (!token) return serverError(new Error('offline_installs is missing'))
    return NextResponse.json({ install: { token, restaurantId: rid }, created: true, uploads, license: body.license, serverTime: Date.now() })
  } catch (e) {
    return serverError(e)
  }
}
