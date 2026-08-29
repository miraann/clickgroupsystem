#!/usr/bin/env node
/**
 * One-off: create a Supabase auth user for every restaurant that doesn't have
 * one, link it via restaurants.owner_id, and store the generated password in
 * restaurant_secrets.auth_secret.
 *
 * After this, the login routes sign in as this user (server-side, after the
 * PIN check) so that auth.uid() is populated and the tenant RLS policies in
 * 20260829_02_tenant_rls.sql apply.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/provision-auth-users.mjs
 *
 * Idempotent: safe to re-run. Run against STAGING first.
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1)
}

const admin = createClient(URL, KEY, { auth: { persistSession: false } })

const { data: restaurants, error } = await admin
  .from('restaurants')
  .select('id, name, email, owner_id')
if (error) { console.error(error); process.exit(1) }

let created = 0, linked = 0, skipped = 0

for (const r of restaurants) {
  if (!r.email) { console.warn(`skip ${r.name}: no email`); skipped++; continue }
  if (r.owner_id) { skipped++; continue }

  const password = crypto.randomBytes(24).toString('base64url')

  // Create (or find) the auth user for this email.
  let userId
  const { data: made, error: cErr } = await admin.auth.admin.createUser({
    email: r.email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { restaurant_id: r.id, provisioned: true },
  })
  if (cErr && !/already been registered/i.test(cErr.message)) {
    console.error(`create failed for ${r.email}:`, cErr.message); continue
  }
  if (made?.user) {
    userId = made.user.id
    created++
  } else {
    // Already exists — look it up and reset the password so we know it.
    const { data: list } = await admin.auth.admin.listUsers()
    const existing = list.users.find(u => u.email?.toLowerCase() === r.email.toLowerCase())
    if (!existing) { console.error(`cannot resolve user for ${r.email}`); continue }
    userId = existing.id
    await admin.auth.admin.updateUserById(userId, { password })
  }

  // Link restaurant -> owner user (the profiles row is auto-created by the
  // on-auth-user trigger in supabase-schema.sql).
  const { error: uErr } = await admin
    .from('restaurants').update({ owner_id: userId }).eq('id', r.id)
  if (uErr) { console.error(`link failed for ${r.name}:`, uErr.message); continue }
  linked++

  const { error: sErr } = await admin
    .from('restaurant_secrets')
    .upsert({ restaurant_id: r.id, auth_secret: password, updated_at: new Date().toISOString() })
  if (sErr) console.error(`secret store failed for ${r.name}:`, sErr.message)

  console.log(`ok  ${r.name}  (${r.email})`)
}

console.log(`\ndone — created ${created}, linked ${linked}, skipped ${skipped}`)
