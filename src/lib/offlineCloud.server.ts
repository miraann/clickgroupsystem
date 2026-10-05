// Server-only. The online system's side of the offline edition (the Windows
// desktop app, see offline/README.md): issuing licence codes, and handing a
// restaurant's set-up to its PC at first run. The code format and the list of
// tables are shared with the desktop app's own runtime.
import 'server-only'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import license from '../../offline/runtime/license.cjs'
import restaurantImport from '../../offline/runtime/restaurant-import.cjs'

type Row = Record<string, unknown>
type Spec = { table: string; by: 'restaurant_id' | { col: string; parent: string } }

const PAGE = 1000 // PostgREST hands back at most this many rows per request

// Paging needs a stable order; these tables have no `id` column.
const SORT_KEY: Record<string, string> = {
  restaurant_secrets: 'restaurant_id', staff_secrets: 'staff_id',
  menu_item_modifiers: 'item_id', printer_categories: 'printer_id', kds_station_categories: 'station_id',
}
const sortKey = (table: string) => SORT_KEY[table] ?? 'id'

/** The seller's signing key (OFFLINE_LICENSE_PRIVATE_KEY, from offline/scripts/license-keygen.mjs). */
export function licenseKeyConfigured(): boolean {
  return !!process.env.OFFLINE_LICENSE_PRIVATE_KEY
}

export function createLicenseCode(restaurantId: string, validUntil: string): string {
  return license.createLicense({ restaurantId, validUntil }, process.env.OFFLINE_LICENSE_PRIVATE_KEY)
}

/** Records the code; a missing table (migration 20261005_01 not run yet) isn't fatal. */
export async function recordLicense(admin: SupabaseClient, restaurantId: string, validUntil: string, code: string, note: string | null) {
  const { error } = await admin.from('offline_licenses').insert({ restaurant_id: restaurantId, valid_until: validUntil, code, note })
  if (error) console.warn('[offline-license] not recorded:', error.message)
  return !error
}

/** The latest code still valid today, if the seller issued one. */
export async function latestLicense(admin: SupabaseClient, restaurantId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await admin.from('offline_licenses')
    .select('code').eq('restaurant_id', restaurantId).gte('valid_until', today)
    .order('valid_until', { ascending: false }).limit(1).maybeSingle()
  return (data?.code as string | undefined) ?? null
}

/** A new PC's upload token; only its hash is kept. Null if offline_installs doesn't exist yet. */
export async function createInstall(admin: SupabaseClient, restaurantId: string): Promise<string | null> {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { error } = await admin.from('offline_installs').insert({ restaurant_id: restaurantId, token_hash: tokenHash })
  if (error) { console.warn('[offline-install] not recorded:', error.message); return null }
  return token
}

/** Which restaurant an upload token belongs to (and that it isn't revoked). */
export async function installForToken(admin: SupabaseClient, token: string): Promise<{ id: string; restaurantId: string } | null> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { data } = await admin.from('offline_installs')
    .select('id, restaurant_id, revoked_at').eq('token_hash', tokenHash).maybeSingle()
  if (!data || data.revoked_at) return null
  return { id: data.id as string, restaurantId: data.restaurant_id as string }
}

async function allRows(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/**
 * Everything the desktop app needs to run the restaurant from day one: menu,
 * tables, staff + roles (PIN hashes), printers, settings, customers, members
 * and open pay-later accounts. Not the cloud's own auth secret: the PC makes
 * its own sign-in.
 */
export async function exportRestaurant(admin: SupabaseClient, restaurantId: string) {
  const { data: restaurant, error } = await admin.from('restaurants').select('*').eq('id', restaurantId).single()
  if (error || !restaurant) throw new Error(error?.message ?? 'restaurant not found')
  const tables: Record<string, Row[]> = {}
  for (const spec of restaurantImport.CONFIG as Spec[]) {
    if (spec.by === 'restaurant_id') {
      tables[spec.table] = await allRows((a, b) => admin.from(spec.table).select('*').eq('restaurant_id', restaurantId).order(sortKey(spec.table)).range(a, b))
    } else {
      const { col, parent } = spec.by
      const ids = (tables[parent] ?? []).map(r => r.id as string)
      const rows: Row[] = []
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100)
        rows.push(...await allRows((a, b) => admin.from(spec.table).select('*').in(col, chunk).order(sortKey(spec.table)).range(a, b)))
      }
      tables[spec.table] = rows
    }
  }
  tables.restaurant_secrets = (tables.restaurant_secrets ?? []).map(({ auth_secret: _drop, ...rest }) => rest) // eslint-disable-line @typescript-eslint/no-unused-vars
  const { data: plans } = await admin.from('plans').select('*').eq('slug', restaurant.plan as string)
  return { version: 1, restaurant, tables, plans: plans ?? [] }
}
