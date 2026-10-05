import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, tooManyFailures, recordFailure } from '@/lib/rate-limit'
import { checkRestaurantPassword } from '@/lib/restaurant-password'
import { serviceClient } from '@/lib/supabase/service'
import { serverError } from '@/lib/api-auth'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import { exportRestaurant, latestLicense, createInstall } from '@/lib/offlineCloud.server'

export const runtime = 'nodejs'
export const maxDuration = 60

// First run of the offline desktop app: the owner signs in with the
// restaurant's email + password, and the PC gets the restaurant's set-up plus
// the latest licence code the seller issued and a token to upload sales.
// Only restaurants the seller enabled (Offline plan, or a licence issued) get it.
export async function POST(req: NextRequest) {
  if (IS_OFFLINE_EDITION) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await rateLimit(req, 'offline-cloud/export', 5, 60_000))) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  try {
    const { email, password } = await req.json() as { email?: string; password?: string }
    if (!email?.trim() || !password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })

    // Wrong passwords count against the account, as on the login page.
    const failKey = `restaurant/login:${email.trim().toLowerCase()}`
    if (await tooManyFailures(failKey, 10, 10 * 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }
    const check = await checkRestaurantPassword(email, password)
    if (!check.ok) {
      if (check.status === 401) await recordFailure(failKey, 10 * 60_000)
      return NextResponse.json({ error: check.error }, { status: check.status })
    }

    const admin = serviceClient()
    const rid = check.restaurant.id
    const { data: rest } = await admin.from('restaurants').select('plan, status').eq('id', rid).single()
    const license = await latestLicense(admin, rid)
    if (rest?.plan !== 'offline' && !license) {
      return NextResponse.json({ error: 'This restaurant does not have the offline edition yet. Ask your seller to enable it.' }, { status: 403 })
    }
    if (rest?.status === 'suspended') {
      return NextResponse.json({ error: 'This restaurant is suspended. Contact your seller.' }, { status: 403 })
    }

    const data = await exportRestaurant(admin, rid)
    const token = await createInstall(admin, rid)
    return NextResponse.json({
      ...data,
      license,
      install: token ? { token, restaurantId: rid } : null,
      serverTime: Date.now(),
    })
  } catch (e) {
    return serverError(e)
  }
}
