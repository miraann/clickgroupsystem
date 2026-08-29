import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'
import {
  createRestaurantToken, RESTAURANT_COOKIE,
  verifyPendingToken, RESTAURANT_PENDING_COOKIE,
} from '@/lib/session'
import { verifySecret } from '@/lib/crypto'
import { attachRestaurantSupabaseSession } from '@/lib/supabase/session-bridge'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path:     '/',
}

// Build the success response: signed __pos_restaurant cookie + a real Supabase
// session (so RLS auth.uid() works in the browser), optionally clearing the
// pending cookie.
async function grantSession(
  req: NextRequest,
  restaurantId: string,
  role: 'owner' | 'staff',
  body: Record<string, unknown>,
  clearPending: boolean,
): Promise<NextResponse> {
  const token = await createRestaurantToken(restaurantId, role)
  const res = NextResponse.json(body)
  res.cookies.set(RESTAURANT_COOKIE, token, { ...COOKIE_OPTS, maxAge: 8 * 3600 })
  if (clearPending) res.cookies.set(RESTAURANT_PENDING_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 })

  const bridge = await attachRestaurantSupabaseSession(req, res, restaurantId)
  if (bridge !== 'ok') console.warn('[pos/login] supabase session not attached:', bridge)
  return res
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
    const enteredPin = pin.trim()

    const supabase = serviceClient()

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, name, menu_slug, settings')
      .eq('menu_slug', slug.trim())
      .maybeSingle()

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    const { data: secretRow } = await supabase
      .from('restaurant_secrets')
      .select('owner_pin_hash')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle()

    const settings = (restaurant.settings ?? {}) as Record<string, unknown>
    const pinHash = secretRow?.owner_pin_hash as string | undefined
    const legacyOwnerPin = settings.owner_pin as string | undefined
    const ownerPinConfigured = !!pinHash || !!legacyOwnerPin
    const checkOwnerPin = async (candidate: string) =>
      pinHash ? verifySecret(candidate, pinHash) : (!!legacyOwnerPin && candidate === legacyOwnerPin)

    const ownerBody = {
      ok: true,
      isOwner: true,
      restaurant: { id: restaurant.id, name: restaurant.name, menu_slug: restaurant.menu_slug },
    }

    // ── Owner PIN path (pending cookie present) ─────────────────────
    const pendingCookie = req.cookies.get(RESTAURANT_PENDING_COOKIE)?.value
    if (pendingCookie) {
      const rid = await verifyPendingToken(pendingCookie)
      if (rid === restaurant.id) {
        if (!ownerPinConfigured) {
          return NextResponse.json({ error: 'No owner PIN configured. Ask your administrator.' }, { status: 403 })
        }
        if (!(await checkOwnerPin(enteredPin))) {
          return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
        }
        return grantSession(req, restaurant.id, 'owner', ownerBody, true)
      }
    }

    // ── Staff PIN path ─────────────────────────────────────────────
    const { data: staffRow } = await supabase
      .from('staff')
      .select('id, name, role, color, role_id')
      .eq('restaurant_id', restaurant.id)
      .eq('pin', enteredPin)
      .eq('status', 'active')
      .maybeSingle()

    if (!staffRow) {
      // Fallback: owner PIN directly (no pending cookie required on re-login)
      if (ownerPinConfigured && await checkOwnerPin(enteredPin)) {
        return grantSession(req, restaurant.id, 'owner', ownerBody, false)
      }
      return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
    }

    // Role permissions
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

    return grantSession(req, restaurant.id, 'staff', {
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
    }, false)
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
