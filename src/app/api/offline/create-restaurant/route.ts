import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/api-auth'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import { serviceClient, createRestaurantRecords } from '@/lib/provision'

export const runtime = 'nodejs'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Offline edition, first run without internet: make the restaurant on this PC,
// the same way the seller panel makes one online. Only while the PC has no
// restaurant yet (the gateway lets this through before setup). The seller
// then sends a licence code for the Restaurant ID the licence screen shows.
export async function POST(req: NextRequest) {
  if (!IS_OFFLINE_EDITION) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const admin = serviceClient()
    const { count } = await admin.from('restaurants').select('id', { count: 'exact', head: true })
    if (count) return NextResponse.json({ error: 'This PC is already set up.' }, { status: 409 })

    const body = await req.json() as { name?: string; email?: string; password?: string; ownerPin?: string; phone?: string }
    const name = body.name?.trim()
    const email = body.email?.trim().toLowerCase()
    const password = body.password ?? ''
    const ownerPin = body.ownerPin?.trim()
    if (!name) return NextResponse.json({ error: 'Restaurant name is required.' }, { status: 400 })
    if (!email || !emailRe.test(email)) return NextResponse.json({ error: 'A valid owner email is required.' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    if (!ownerPin || !/^\d{6}$/.test(ownerPin)) return NextResponse.json({ error: 'Owner PIN must be 6 digits.' }, { status: 400 })

    const id = await createRestaurantRecords(admin, { name, email, password, ownerPin, phone: body.phone, plan: 'offline' })
    return NextResponse.json({ ok: true, id, name })
  } catch (e) {
    return serverError(e)
  }
}
