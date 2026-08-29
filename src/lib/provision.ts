// Server-only. Shared restaurant / auth-user provisioning used by the seller
// API route. Mirrors scripts/provision-auth-users.mjs (which stays as the
// one-time backfill for restaurants created before this existed).

import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { hashSecret } from '@/lib/crypto'

export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<string | undefined> {
  const target = email.toLowerCase()
  // listUsers is paginated; walk until found or exhausted (seller tenant counts are small)
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const users = data?.users ?? []
    const hit = users.find(u => u.email?.toLowerCase() === target)
    if (hit) return hit.id
    if (users.length < 1000) break
  }
  return undefined
}

/**
 * Ensure a restaurant has an auth.users row, `restaurants.owner_id` set, and a
 * `restaurant_secrets` row. Rotates `auth_secret` every call. Hashes
 * `password` / `ownerPin` into the secrets row when provided. Idempotent.
 */
export async function provisionRestaurantAuth(
  admin: SupabaseClient,
  opts: { restaurantId: string; email: string; password?: string; ownerPin?: string },
): Promise<{ userId: string; authSecret: string }> {
  const email = opts.email.trim().toLowerCase()
  if (!email) throw new Error('email is required to provision a restaurant')

  const authSecret = crypto.randomBytes(24).toString('base64url')

  let userId: string | undefined
  const { data: made, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: authSecret,
    email_confirm: true,
    user_metadata: { restaurant_id: opts.restaurantId, provisioned: true },
  })
  if (made?.user) {
    userId = made.user.id
  } else if (cErr && /(registered|already exists)/i.test(cErr.message)) {
    userId = await findAuthUserByEmail(admin, email)
    if (userId) await admin.auth.admin.updateUserById(userId, { password: authSecret })
  }
  if (!userId) throw new Error(cErr?.message ?? 'could not create auth user')

  const { error: linkErr } = await admin
    .from('restaurants').update({ owner_id: userId }).eq('id', opts.restaurantId)
  if (linkErr) throw new Error(`link owner_id: ${linkErr.message}`)

  const patch: Record<string, unknown> = {
    restaurant_id: opts.restaurantId,
    auth_secret: authSecret,
    updated_at: new Date().toISOString(),
  }
  if (opts.password) patch.password_hash = await hashSecret(opts.password)
  if (opts.ownerPin) patch.owner_pin_hash = await hashSecret(opts.ownerPin)

  const { error: secErr } = await admin.from('restaurant_secrets').upsert(patch)
  if (secErr) throw new Error(`store secrets: ${secErr.message}`)

  return { userId, authSecret }
}

/** Store / rotate just the hashed password &/or owner PIN (no auth-user change). */
export async function updateRestaurantSecrets(
  admin: SupabaseClient,
  restaurantId: string,
  opts: { password?: string; ownerPin?: string },
): Promise<void> {
  const patch: Record<string, unknown> = { restaurant_id: restaurantId, updated_at: new Date().toISOString() }
  if (opts.password) patch.password_hash = await hashSecret(opts.password)
  if (opts.ownerPin) patch.owner_pin_hash = await hashSecret(opts.ownerPin)
  if (Object.keys(patch).length === 2) return // nothing to change
  const { error } = await admin.from('restaurant_secrets').upsert(patch)
  if (error) throw new Error(error.message)
}
