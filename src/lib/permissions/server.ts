// Server-side role-permission guard for API route handlers.
//
// The client <PermissionsContext> is UX only. This is the real boundary: it
// reads the signed __pos_restaurant cookie (src/lib/session.ts), and for a
// staff PIN session resolves the role's stored permission map to authorize the
// mutation.
//
// Post-C1, every staff member of a restaurant shares one Supabase auth user, so
// RLS cannot distinguish roles — role enforcement has to live here.

import 'server-only'
import { NextResponse } from 'next/server'
import { requireRestaurant, type Guard } from '@/lib/api-auth'
import { serviceClient } from '@/lib/supabase/service'
import type { RestaurantSession } from '@/lib/session'
import { hasPermission, type PermissionMap } from '@/lib/permissions/check'

/** Pass this instead of a permKey to require an owner session (no leaf perm covers it). */
export const OWNER_ONLY = '@owner'

// Small in-process cache of role_id -> permission map. Roles change rarely; a
// short TTL keeps a burst of writes from hammering the DB without letting a
// permission revocation linger.
const ROLE_TTL_MS = 30_000
const roleCache = new Map<string, { perms: PermissionMap; ts: number }>()

async function loadRolePermissions(roleId: string): Promise<PermissionMap | null> {
  const hit = roleCache.get(roleId)
  if (hit && Date.now() - hit.ts < ROLE_TTL_MS) return hit.perms

  const { data, error } = await serviceClient()
    .from('restaurant_roles')
    .select('permissions')
    .eq('id', roleId)
    .maybeSingle()
  if (error || !data) return null

  const perms = (data.permissions ?? {}) as PermissionMap
  roleCache.set(roleId, { perms, ts: Date.now() })
  return perms
}

const forbidden = () =>
  NextResponse.json({ error: 'You do not have permission to do that.' }, { status: 403 })

/**
 * Require a valid restaurant session that is authorized for `permKey`.
 *
 * - `permKey === OWNER_ONLY` ('@owner') → the session must be an owner session.
 * - otherwise → owner passes; a staff session passes when its role grants
 *   `permKey` (via hasPermission, same rule as the client `canAny`).
 *
 * When `restaurantId` is given the session is also bound to it (403 on mismatch).
 * On failure returns a ready-made NextResponse in `error`.
 */
export async function requirePermission(
  permKey: string,
  restaurantId?: string,
): Promise<Guard<RestaurantSession>> {
  const { session, error } = await requireRestaurant(restaurantId)
  if (error) return { session: null, error }

  if (session.role === 'owner') return { session, error: null }

  // staff session
  if (permKey === OWNER_ONLY) return { session: null, error: forbidden() }
  if (!session.rlid) return { session: null, error: forbidden() } // stale token — re-login

  const perms = await loadRolePermissions(session.rlid)
  if (!perms || !hasPermission(perms, permKey)) {
    return { session: null, error: forbidden() }
  }
  return { session, error: null }
}
