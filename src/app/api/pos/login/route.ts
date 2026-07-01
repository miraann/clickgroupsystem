import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'
import {
  createRestaurantToken, RESTAURANT_COOKIE,
  verifyPendingToken, RESTAURANT_PENDING_COOKIE,
} from '@/lib/session'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'pos/login', 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  try {
    const { slug, pin } = await req.json() as { slug?: string; pin?: string }

    if (!slug?.trim() || !pin?.trim()) {
      return NextResponse.json({ error: 'Missing slug or PIN.' }, { status: 400 })
    }

    const supabase = serviceClient()

    // Resolve slug → restaurant (include settings for owner PIN check)
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, name, menu_slug, settings')
      .eq('menu_slug', slug.trim())
      .maybeSingle()

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    // ── Owner PIN path ──────────────────────────────────────────────
    // If a valid pending-restaurant cookie exists for this restaurant,
    // check the entered PIN against settings.owner_pin.
    const pendingCookie = req.cookies.get(RESTAURANT_PENDING_COOKIE)?.value
    if (pendingCookie) {
      const rid = await verifyPendingToken(pendingCookie)
      if (rid === restaurant.id) {
        const settings = (restaurant.settings ?? {}) as Record<string, unknown>
        const ownerPin = settings.owner_pin as string | undefined

        if (!ownerPin) {
          return NextResponse.json(
            { error: 'No owner PIN configured. Ask your administrator.' },
            { status: 403 },
          )
        }

        if (pin.trim() !== ownerPin) {
          return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
        }

        // PIN correct — grant owner session, clear pending cookie
        const token = await createRestaurantToken(restaurant.id, 'owner')
        const res = NextResponse.json({
          ok: true,
          isOwner: true,
          restaurant: { id: restaurant.id, name: restaurant.name, menu_slug: restaurant.menu_slug },
        })
        res.cookies.set(RESTAURANT_COOKIE, token, {
          httpOnly: true,
          secure:   process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path:     '/',
          maxAge:   8 * 3600,
        })
        res.cookies.set(RESTAURANT_PENDING_COOKIE, '', {
          httpOnly: true,
          secure:   process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path:     '/',
          maxAge:   0,
        })
        return res
      }
    }

    // ── Staff PIN path ──────────────────────────────────────────────
    const { data: staffRow } = await supabase
      .from('staff')
      .select('id, name, role, color, role_id')
      .eq('restaurant_id', restaurant.id)
      .eq('pin', pin.trim())
      .eq('status', 'active')
      .maybeSingle()

    if (!staffRow) {
      return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
    }

    // Fetch role permissions
    let rolePermissions: Record<string, boolean> = {}
    let roleName: string | null = null

    if (staffRow.role_id) {
      const { data: roleRow } = await supabase
        .from('restaurant_roles')
        .select('name, permissions')
        .eq('id', staffRow.role_id)
        .maybeSingle()

      if (roleRow) {
        rolePermissions = (roleRow.permissions as Record<string, boolean>) ?? {}
        roleName = roleRow.name as string
      }
    }

    const token = await createRestaurantToken(restaurant.id, 'staff')

    const res = NextResponse.json({
      ok: true,
      restaurant: { id: restaurant.id, name: restaurant.name, menu_slug: restaurant.menu_slug },
      staff: {
        id:          staffRow.id,
        name:        staffRow.name,
        role:        staffRow.role,
        color:       staffRow.color,
        role_id:     staffRow.role_id,
        permissions: rolePermissions,
        roleName,
      },
    })

    res.cookies.set(RESTAURANT_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   8 * 3600,
    })

    return res
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
