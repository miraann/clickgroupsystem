import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, serverError } from '@/lib/api-auth'
import { serviceClient, provisionRestaurantAuth, updateRestaurantSecrets } from '@/lib/provision'

export const runtime = 'nodejs'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── GET: restaurants + plans + staff count for the seller table & stats ─────
export async function GET() {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const admin = serviceClient()
    const [{ data: restaurants }, { data: plans }, { count: staffCount }] = await Promise.all([
      admin.from('restaurants')
        .select('id, name, email, phone, plan, status, created_at, settings')
        .order('created_at', { ascending: false }),
      admin.from('plans').select('*').order('sort_order', { ascending: true }),
      admin.from('staff').select('id', { count: 'exact', head: true }),
    ])
    return NextResponse.json({
      restaurants: restaurants ?? [],
      plans: plans ?? [],
      staffCount: staffCount ?? 0,
    })
  } catch (e) {
    return serverError(e)
  }
}

// ── POST: create a restaurant, seed defaults, provision its auth user ───────
export async function POST(req: NextRequest) {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const body = await req.json() as {
      name?: string; email?: string; phone?: string; plan?: string
      password?: string; ownerName?: string; ownerPin?: string
      modules?: Record<string, boolean>
    }

    const name = body.name?.trim()
    const email = body.email?.trim().toLowerCase()
    const password = body.password?.trim()

    if (!name) return NextResponse.json({ error: 'Restaurant name is required.' }, { status: 400 })
    if (!email || !emailRe.test(email)) return NextResponse.json({ error: 'A valid owner email is required.' }, { status: 400 })
    if (!password || password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    if (body.ownerPin && !/^\d{6}$/.test(body.ownerPin)) return NextResponse.json({ error: 'Owner PIN must be 6 digits.' }, { status: 400 })

    const admin = serviceClient()

    const settings: Record<string, unknown> = {}
    if (body.ownerName?.trim()) settings.owner_name = body.ownerName.trim()
    if (body.modules) settings.modules = body.modules

    const { data: rest, error: insErr } = await admin.from('restaurants').insert({
      name,
      email,
      phone: body.phone?.trim() || null,
      plan: body.plan || null,
      status: 'active',
      settings,
    }).select('id').single()
    if (insErr || !rest) return serverError(insErr ?? new Error('insert failed'))

    // default currency + payment method
    await Promise.all([
      admin.from('currencies').insert({
        restaurant_id: rest.id, name: 'Iraqi Dinar', symbol: 'IQD',
        decimal_places: 0, is_default: true, sort_order: 0,
      }),
      admin.from('payment_methods').insert({
        restaurant_id: rest.id, name: 'کاش', icon_type: 'cash',
        active: true, is_default: true, sort_order: 0,
      }),
    ])

    await provisionRestaurantAuth(admin, {
      restaurantId: rest.id,
      email,
      password,
      ownerPin: body.ownerPin?.trim() || undefined,
    })

    return NextResponse.json({ ok: true, id: rest.id })
  } catch (e) {
    return serverError(e)
  }
}

// ── PATCH: update details / plan / status / password / owner PIN ────────────
export async function PATCH(req: NextRequest) {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const body = await req.json() as {
      id?: string; name?: string; email?: string; phone?: string; plan?: string
      status?: string; ownerName?: string; ownerPin?: string; password?: string
      modules?: Record<string, boolean>
    }
    if (!body.id) return NextResponse.json({ error: 'Missing restaurant id.' }, { status: 400 })
    if (body.email && !emailRe.test(body.email.trim())) return NextResponse.json({ error: 'Invalid email.' }, { status: 400 })
    if (body.password && body.password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    if (body.ownerPin && !/^\d{6}$/.test(body.ownerPin)) return NextResponse.json({ error: 'Owner PIN must be 6 digits.' }, { status: 400 })

    const admin = serviceClient()

    const { data: current } = await admin.from('restaurants')
      .select('owner_id, email, settings').eq('id', body.id).maybeSingle()
    if (!current) return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })

    const settings: Record<string, unknown> = { ...((current.settings ?? {}) as Record<string, unknown>) }
    // never keep raw secrets in settings
    delete settings.password
    delete settings.owner_pin
    if (body.ownerName?.trim()) settings.owner_name = body.ownerName.trim()
    if (body.modules) settings.modules = body.modules

    const patch: Record<string, unknown> = { settings }
    if (body.name?.trim()) patch.name = body.name.trim()
    if (body.email?.trim()) patch.email = body.email.trim().toLowerCase()
    if (body.phone !== undefined) patch.phone = body.phone?.trim() || null
    if (body.plan) patch.plan = body.plan
    if (body.status) patch.status = body.status

    const { error: upErr } = await admin.from('restaurants').update(patch).eq('id', body.id)
    if (upErr) return serverError(upErr)

    // keep the auth user's email in sync
    const newEmail = body.email?.trim().toLowerCase()
    if (newEmail && newEmail !== current.email?.toLowerCase() && current.owner_id) {
      await admin.auth.admin.updateUserById(current.owner_id, { email: newEmail })
    }

    if (body.password || body.ownerPin) {
      await updateRestaurantSecrets(admin, body.id, {
        password: body.password?.trim() || undefined,
        ownerPin: body.ownerPin?.trim() || undefined,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}

// ── DELETE: remove restaurant + its auth user ──────────────────────────────
export async function DELETE(req: NextRequest) {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const { id } = await req.json() as { id?: string }
    if (!id) return NextResponse.json({ error: 'Missing restaurant id.' }, { status: 400 })

    const admin = serviceClient()
    const { data: current } = await admin.from('restaurants').select('owner_id').eq('id', id).maybeSingle()

    const { error: delErr } = await admin.from('restaurants').delete().eq('id', id)
    if (delErr) return serverError(delErr)

    if (current?.owner_id) {
      await admin.auth.admin.deleteUser(current.owner_id).catch(() => {})
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
