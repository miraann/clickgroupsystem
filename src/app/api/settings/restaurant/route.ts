import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, OWNER_ONLY } from '@/lib/permissions/server'
import { serverError } from '@/lib/api-auth'
import { serviceClient } from '@/lib/supabase/service'
import { logAuditServer } from '@/lib/logAudit.server'

// Single write path for the `restaurants.settings` JSON blob (backs
// useRestaurantSettings). The caller names the permission its page requires; the
// guard enforces the caller actually holds it. '@owner' for ownerOnly pages.
const PERM_KEY_RE = /^(settings|finance)\.[a-z_]+$/
const MAX_PATCH_BYTES = 100_000

export async function PATCH(req: NextRequest) {
  try {
    const { patch, permKey } = (await req.json()) as {
      patch?: Record<string, unknown>
      permKey?: string
    }

    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return NextResponse.json({ error: 'patch must be an object.' }, { status: 400 })
    }
    if (JSON.stringify(patch).length > MAX_PATCH_BYTES) {
      return NextResponse.json({ error: 'Settings payload too large.' }, { status: 413 })
    }
    const key = permKey === OWNER_ONLY || (permKey && PERM_KEY_RE.test(permKey)) ? permKey : null
    if (!key) return NextResponse.json({ error: 'Invalid permKey.' }, { status: 400 })

    const { session, error } = await requirePermission(key)
    if (error) return error

    const sb = serviceClient()
    const { data: row, error: readErr } = await sb
      .from('restaurants')
      .select('settings')
      .eq('id', session.rid)
      .maybeSingle()
    if (readErr) return serverError(readErr)

    const existing = (row?.settings ?? {}) as Record<string, unknown>
    const merged = { ...existing, ...patch }

    const { error: writeErr } = await sb
      .from('restaurants')
      .update({ settings: merged })
      .eq('id', session.rid)
    if (writeErr) return serverError(writeErr)

    await logAuditServer(session, 'update_settings', { keys: Object.keys(patch), permKey: key })
    return NextResponse.json({ settings: merged })
  } catch (e) {
    return serverError(e)
  }
}
