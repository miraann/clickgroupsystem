// Server-only. The online system's side of the offline edition (the Windows
// desktop app, see offline/README.md): issuing licence codes, and handing a
// restaurant's set-up to its PC at first run. The code format and the list of
// tables are shared with the desktop app's own runtime.
import 'server-only'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import license from '../../offline/runtime/license.cjs'
import restaurantImport from '../../offline/runtime/restaurant-import.cjs'
import { provisionRestaurantAuth } from '@/lib/provision'

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

/** Is `code` a licence this server signed for `restaurantId`? (Its end date doesn't matter here.) */
export function isIssuedLicense(code: unknown, restaurantId: string): { ok: boolean; validUntil?: string } {
  if (typeof code !== 'string' || !licenseKeyConfigured()) return { ok: false }
  const publicKey = crypto.createPublicKey(crypto.createPrivateKey({
    key: Buffer.from(process.env.OFFLINE_LICENSE_PRIVATE_KEY!, 'base64'), format: 'der', type: 'pkcs8',
  })).export({ type: 'spki', format: 'pem' })
  const v = license.verifyLicense(code, publicKey)
  return v.ok && v.restaurantId === restaurantId ? { ok: true, validUntil: v.validUntil } : { ok: false }
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

// ── Pictures ────────────────────────────────────────────────────────────────
const STORAGE_REL = '/storage/v1/object/public/'
const PICTURE_BUCKETS = new Set(['menu-images', 'logos', 'receipts'])

/** Every storage link (absolute or relative) found anywhere in `value`. */
function storageLinks(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const at = value.indexOf(STORAGE_REL)
    if (at === 0 || (at > 0 && /^https?:\/\//.test(value))) out.add(value.split(/[?#]/)[0])
  } else if (Array.isArray(value)) value.forEach(v => storageLinks(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => storageLinks(v, out))
  return out
}

/**
 * The seller panel's setup file, for a PC with no internet at all: the same
 * data the online set-up downloads, the latest licence, and the pictures to
 * fetch (the browser adds them, so the response stays small).
 */
export async function setupFileData(admin: SupabaseClient, restaurantId: string) {
  const data = await exportRestaurant(admin, restaurantId)
  const pictures = [...storageLinks(data)]
    .filter(u => u.startsWith('http'))
    .map(url => ({ url, rel: url.slice(url.indexOf(STORAGE_REL)) }))
  return { kind: 'clickgroup-offline-setup', version: 1, createdAt: new Date().toISOString(), data, license: await latestLicense(admin, restaurantId), pictures }
}

// ── A restaurant made on a PC, joining the online system ────────────────────
type Setup = { restaurant: Row; tables: Record<string, Row[]> }

/** Relative storage links (how the PC saves them) made absolute for the online app. */
function absolutize(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith(STORAGE_REL) ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}${value}` : value
  if (Array.isArray(value)) return value.map(absolutize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, absolutize(v)]))
  return value
}

/**
 * Creates the restaurant online from the PC's set-up (same ids, so the PC's
 * sales upload onto it), with its sign-in from `email` + `password`. Returns
 * signed upload links for its pictures. The caller has checked that the
 * seller issued a licence for this id.
 */
export async function registerPcRestaurant(
  admin: SupabaseClient,
  opts: { restaurantId: string; email: string; password: string; setup: Setup },
): Promise<{ uploads: { path: string; url: string }[] }> {
  const rid = opts.restaurantId
  const email = opts.email.trim().toLowerCase()
  const { setup } = opts
  if (setup?.restaurant?.id !== rid) throw Object.assign(new Error('The set-up sent is for a different restaurant.'), { status: 400 })

  const { restaurant_secrets: secrets, restaurant_users: _users, ...rest } = setup.tables ?? {} // eslint-disable-line @typescript-eslint/no-unused-vars
  const { owner_id: _owner, ...restaurant } = setup.restaurant // eslint-disable-line @typescript-eslint/no-unused-vars
  const { error: insErr } = await admin.from('restaurants').insert(absolutize({ ...restaurant, email, status: 'active' }) as Row)
  if (insErr) throw Object.assign(new Error(`Could not create the restaurant online: ${insErr.message}`), { status: 409 })

  try {
    const ids: Record<string, Set<string>> = {}
    for (const spec of restaurantImport.CONFIG as Spec[]) {
      if (spec.table === 'restaurant_secrets' || spec.table === 'restaurant_users') continue
      let rows = (rest[spec.table] ?? []) as Row[]
      if (spec.by === 'restaurant_id') rows = rows.map(r => ({ ...r, restaurant_id: rid }))
      // A child row must hang off a parent row of this same restaurant.
      else rows = rows.filter(r => ids[(spec.by as { parent: string }).parent]?.has(String(r[(spec.by as { col: string }).col])))
      ids[spec.table] = new Set(rows.map(r => String(r.id)))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await admin.from(spec.table).insert(absolutize(rows.slice(i, i + 200)) as Row[])
        if (error) throw new Error(`${spec.table}: ${error.message}`)
      }
    }
    await provisionRestaurantAuth(admin, { restaurantId: rid, email, password: opts.password })
    const pin = (secrets as Row[] | undefined)?.[0]?.owner_pin_hash
    if (typeof pin === 'string') await admin.from('restaurant_secrets').update({ owner_pin_hash: pin }).eq('restaurant_id', rid)
  } catch (e) {
    await admin.from('restaurants').delete().eq('id', rid) // children go with it (on delete cascade)
    throw e
  }

  // Upload links only for files that don't exist yet, so nothing can be overwritten.
  const uploads: { path: string; url: string }[] = []
  for (const rel of storageLinks(setup)) {
    if (!rel.startsWith(STORAGE_REL)) continue
    const [bucket, ...parts] = rel.slice(STORAGE_REL.length).split('/')
    if (!PICTURE_BUCKETS.has(bucket) || !parts.length) continue
    const { data } = await admin.storage.from(bucket).createSignedUploadUrl(parts.map(decodeURIComponent).join('/'))
    if (data?.signedUrl) uploads.push({ path: rel, url: data.signedUrl })
  }
  return { uploads }
}
