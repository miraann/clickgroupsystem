import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/server'
import { serverError } from '@/lib/api-auth'
import { serviceClient } from '@/lib/supabase/service'
import { logAuditServer } from '@/lib/logAudit.server'

// Role editor mutations. Guarded server-side because every staff member of a
// restaurant shares one Supabase auth identity, so RLS can't stop a cashier from
// granting themselves permissions. Requires the `settings.users` permission.
const PERM = 'settings.users'

// POST { name } — create an empty role
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requirePermission(PERM)
    if (error) return error

    const { name } = (await req.json()) as { name?: string }
    const clean = (name ?? '').trim()
    if (!clean) return NextResponse.json({ error: 'Role name is required.' }, { status: 400 })

    const { data, error: dbErr } = await serviceClient()
      .from('restaurant_roles')
      .insert({ restaurant_id: session.rid, name: clean, permissions: {} })
      .select()
      .single()
    if (dbErr) return serverError(dbErr)

    await logAuditServer(session, 'add', { entity: 'role', name: clean }, data.id)
    return NextResponse.json({ role: data })
  } catch (e) {
    return serverError(e)
  }
}

// PATCH { id, permissions } — replace a role's permission map
export async function PATCH(req: NextRequest) {
  try {
    const { session, error } = await requirePermission(PERM)
    if (error) return error

    const { id, permissions } = (await req.json()) as {
      id?: string
      permissions?: Record<string, boolean>
    }
    if (!id || typeof permissions !== 'object' || permissions === null) {
      return NextResponse.json({ error: 'id and permissions are required.' }, { status: 400 })
    }
    // keep only boolean-true entries
    const clean: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(permissions)) if (v === true) clean[k] = true

    const { error: dbErr } = await serviceClient()
      .from('restaurant_roles')
      .update({ permissions: clean })
      .eq('id', id)
      .eq('restaurant_id', session.rid)
    if (dbErr) return serverError(dbErr)

    await logAuditServer(session, 'edit', { entity: 'role_permissions' }, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}

// DELETE { id }
export async function DELETE(req: NextRequest) {
  try {
    const { session, error } = await requirePermission(PERM)
    if (error) return error

    const { id } = (await req.json()) as { id?: string }
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

    const { error: dbErr } = await serviceClient()
      .from('restaurant_roles')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', session.rid)
    if (dbErr) return serverError(dbErr)

    await logAuditServer(session, 'delete', { entity: 'role' }, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
