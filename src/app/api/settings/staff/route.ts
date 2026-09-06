import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/server'
import { serverError } from '@/lib/api-auth'
import { serviceClient } from '@/lib/supabase/service'
import { logAuditServer } from '@/lib/logAudit.server'
import type { RestaurantSession } from '@/lib/session'

// Staff account mutations (create / edit / PIN reset / status / role assignment).
// Guarded by `settings.users` — otherwise a staff session could create an admin
// account or reset another user's PIN by calling Supabase directly.
const PERM = 'settings.users'
const PIN_RE = /^\d{4,8}$/

// A role_id supplied by the client must belong to this restaurant.
async function assertRoleInTenant(roleId: string | null | undefined, rid: string): Promise<boolean> {
  if (!roleId) return true
  const { data } = await serviceClient()
    .from('restaurant_roles')
    .select('id')
    .eq('id', roleId)
    .eq('restaurant_id', rid)
    .maybeSingle()
  return !!data
}

interface StaffBody {
  id?:      string
  name?:    string
  email?:   string | null
  phone?:   string | null
  role?:    string
  pin?:     string
  color?:   string
  status?:  string
  role_id?: string | null
}

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requirePermission(PERM)
    if (error) return error
    const b = (await req.json()) as StaffBody

    if (!b.name?.trim()) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    if (!b.pin || !PIN_RE.test(b.pin)) return NextResponse.json({ error: 'PIN must be 4–8 digits.' }, { status: 400 })
    if (!(await assertRoleInTenant(b.role_id ?? null, session.rid))) {
      return NextResponse.json({ error: 'Unknown role.' }, { status: 400 })
    }
    if (await pinTaken(b.pin, session.rid, null)) {
      return NextResponse.json({ error: 'That PIN is already in use.' }, { status: 409 })
    }

    const { data, error: dbErr } = await serviceClient()
      .from('staff')
      .insert({
        restaurant_id: session.rid,
        name: b.name.trim(), email: b.email || null, phone: b.phone || null,
        role: b.role, pin: b.pin, color: b.color, status: b.status ?? 'active',
        role_id: b.role_id ?? null,
      })
      .select()
      .single()
    if (dbErr) return serverError(dbErr)

    await logAuditServer(session, 'add', { entity: 'staff', name: b.name.trim(), role: b.role }, data.id)
    return NextResponse.json({ staff: data })
  } catch (e) {
    return serverError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { session, error } = await requirePermission(PERM)
    if (error) return error
    const b = (await req.json()) as StaffBody
    if (!b.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (b.name !== undefined)   patch.name   = b.name.trim()
    if (b.email !== undefined)  patch.email  = b.email || null
    if (b.phone !== undefined)  patch.phone  = b.phone || null
    if (b.role !== undefined)   patch.role   = b.role
    if (b.color !== undefined)  patch.color  = b.color
    if (b.status !== undefined) patch.status = b.status
    if (b.pin !== undefined) {
      if (!PIN_RE.test(b.pin)) return NextResponse.json({ error: 'PIN must be 4–8 digits.' }, { status: 400 })
      if (await pinTaken(b.pin, session.rid, b.id)) {
        return NextResponse.json({ error: 'That PIN is already in use.' }, { status: 409 })
      }
      patch.pin = b.pin
    }
    if (b.role_id !== undefined) {
      if (!(await assertRoleInTenant(b.role_id, session.rid))) {
        return NextResponse.json({ error: 'Unknown role.' }, { status: 400 })
      }
      patch.role_id = b.role_id
    }

    const { data, error: dbErr } = await serviceClient()
      .from('staff')
      .update(patch)
      .eq('id', b.id)
      .eq('restaurant_id', session.rid)
      .select()
      .maybeSingle()
    if (dbErr) return serverError(dbErr)
    if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    await auditStaffPatch(session, b, b.id)
    return NextResponse.json({ staff: data })
  } catch (e) {
    return serverError(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { session, error } = await requirePermission(PERM)
    if (error) return error
    const { id } = (await req.json()) as { id?: string }
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

    const { error: dbErr } = await serviceClient()
      .from('staff')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', session.rid)
    if (dbErr) return serverError(dbErr)

    await logAuditServer(session, 'delete', { entity: 'staff' }, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}

async function pinTaken(pin: string, rid: string, exceptId: string | null): Promise<boolean> {
  let q = serviceClient().from('staff').select('id').eq('restaurant_id', rid).eq('pin', pin)
  if (exceptId) q = q.neq('id', exceptId)
  const { data } = await q.maybeSingle()
  return !!data
}

async function auditStaffPatch(session: RestaurantSession, b: StaffBody, id: string) {
  if (b.pin !== undefined && Object.keys(b).length <= 2) {
    await logAuditServer(session, 'edit', { entity: 'staff_pin' }, id)
  } else if (b.status !== undefined && Object.keys(b).length <= 2) {
    await logAuditServer(session, 'toggle', { entity: 'staff_status', status: b.status }, id)
  } else {
    await logAuditServer(session, 'edit', { entity: 'staff', name: b.name }, id)
  }
}
