// Load one restaurant's data into the local offline database — from the cloud
// at activation (the desktop app's first run) or from offline/scripts/import-restaurant.mjs.
//
// Payload: { restaurant, tables: { <name>: rows[] }, plans?, users?, profiles? }
// Rows are exactly as the cloud has them. `users` (auth.users rows) is only
// there when copied straight from the database; otherwise a local auth user is
// made for the restaurant with a fresh secret (session-bridge signs in as it).
const crypto = require('node:crypto')
const fs     = require('node:fs')
const path   = require('node:path')

const q = (name) => `"${String(name).replace(/"/g, '""')}"`

// What belongs to a restaurant: its own rows (restaurant_id), and child rows
// that point at a parent table's id. Parents come before their children.
const CONFIG = [
  'restaurant_secrets', 'restaurant_roles', 'staff', 'staff_secrets', 'restaurant_users',
  'currencies', 'payment_methods', 'discounts', 'surcharges', 'combo_discounts', 'discount_codes', 'void_reasons',
  'receipt_settings', 'order_number_settings', 'invoice_number_settings', 'menu_template_settings',
  'menu_categories', 'menu_items', 'menu_modifiers', 'kitchen_notes', 'events_offers',
  'inventory_categories', 'inventory_units', 'inventory_items', 'menu_item_ingredients',
  'kds_stations', 'printers', 'table_groups', 'tables', 'floor_elements',
  'customers', 'members', 'pay_later',
].map(table => ({ table, by: 'restaurant_id' })).concat([
  { table: 'modifier_options',       by: { col: 'modifier_id',  parent: 'menu_modifiers' } },
  { table: 'menu_item_modifiers',    by: { col: 'item_id',      parent: 'menu_items' } },
  { table: 'printer_categories',     by: { col: 'printer_id',   parent: 'printers' } },
  { table: 'kds_station_categories', by: { col: 'station_id',   parent: 'kds_stations' } },
  { table: 'pay_later_payments',     by: { col: 'pay_later_id', parent: 'pay_later' } },
])
const HISTORY = [
  'orders', 'order_items', 'invoices', 'expenses', 'reservations', 'audit_logs',
  'table_recoveries', 'role_messages', 'inventory_notifications',
].map(table => ({ table, by: 'restaurant_id' }))

/** SQL condition selecting a table's rows for restaurant $1. */
const whereFor = ({ by }) => by === 'restaurant_id'
  ? 'restaurant_id = $1'
  : `${q(by.col)} in (select id from public.${q(by.parent)} where restaurant_id = $1)`

// ── Pictures ────────────────────────────────────────────────────────────────
// Absolute storage links point at the cloud (no internet, no picture) or at
// one device's address. Saved relative, they work from the PC and every tablet.
const STORAGE_URL = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/([^/?#]+)\/([^?#]+)(?:[?#].*)?$/

function makeUrlRewriter(storageDir, { keepRemote = false } = {}) {
  const files = new Map() // relative link → { source, file }
  const root = path.resolve(storageDir)
  const rewrite = (value) => {
    if (typeof value === 'string') {
      const m = STORAGE_URL.exec(value)
      if (!m || keepRemote) return value
      const file = path.resolve(root, decodeURIComponent(m[1]), ...m[2].split('/').map(decodeURIComponent))
      if (!file.startsWith(root + path.sep)) return value
      const rel = `/storage/v1/object/public/${m[1]}/${m[2]}`
      files.set(rel, { source: value, file })
      return rel
    }
    if (Array.isArray(value)) return value.map(rewrite)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]))
    return value
  }
  return { rewrite, files }
}

/** Copy the pictures found while rewriting. Returns how many made it. */
async function downloadFiles(files) {
  let copied = 0
  const failed = []
  for (const [rel, { source, file }] of files) {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
      copied++
    } catch (e) {
      failed.push(`${rel} (${e.message})`)
    }
  }
  return { copied, failed }
}

// ── Database ────────────────────────────────────────────────────────────────
/** Delete a restaurant and everything under it. Runs inside the caller's transaction. */
async function removeRestaurant(db, rid) {
  const users = await db.query(
    `select owner_id as id from public.restaurants where id = $1 and owner_id is not null
     union select user_id from public.restaurant_users where restaurant_id = $1`, [rid])
  const ids = users.rows.map(r => r.id)
  // Without triggers (replica mode) nothing cascades, so go table by table,
  // children first: their conditions read the parent rows.
  await db.query('set local session_replication_role = replica')
  for (const t of [...CONFIG, ...HISTORY].reverse()) {
    await db.query(`delete from public.${q(t.table)} where ${whereFor(t)}`, [rid])
  }
  const others = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'restaurant_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'profiles'`)
  for (const { relname } of others.rows) await db.query(`delete from public.${q(relname)} where restaurant_id = $1`, [rid])
  await db.query('delete from public.restaurants where id = $1', [rid])
  await db.query('delete from public.profiles where id = any($1::uuid[]) or restaurant_id = $2', [ids, rid])
  await db.query('delete from auth.refresh_tokens where user_id = any($1::uuid[])', [ids])
  await db.query('delete from auth.users where id = any($1::uuid[])', [ids])
}

async function columnsOf(db, schema, table) {
  const r = await db.query(
    `select a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped`, [schema, table])
  return new Set(r.rows.map(x => x.attname))
}

/** Insert rows as given; columns this database doesn't have are skipped, missing ones get defaults. */
async function insertRows(db, schema, table, rows, conflict = '') {
  if (!rows?.length) return 0
  const have = await columnsOf(db, schema, table)
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => have.has(c)).map(q).join(', ')
  const t = `${q(schema)}.${q(table)}`
  const r = await db.query(
    `insert into ${t} (${cols}) select ${cols} from jsonb_populate_recordset(null::${t}, $1::jsonb) ${conflict}`,
    [JSON.stringify(rows)])
  return r.rowCount
}

/**
 * Load the payload. `db` is a connected pg client; this runs its own
 * transaction. Replaces an earlier copy of the same restaurant (same id or
 * email) when `replace` is set, else refuses. Pictures are only collected
 * (returned as `files`) — download them after, with downloadFiles().
 */
async function importRestaurant(db, payload, { storageDir, replace = false, keepRemoteImages = false } = {}) {
  const { rewrite, files } = makeUrlRewriter(storageDir, { keepRemote: keepRemoteImages })
  const restaurant = rewrite({ ...payload.restaurant })
  const rid = restaurant.id
  const email = String(restaurant.email || '').trim().toLowerCase()
  const tables = Object.fromEntries(Object.entries(payload.tables || {}).map(([t, rows]) => [t, rewrite(rows)]))
  const known = new Set([...CONFIG, ...HISTORY].map(t => t.table))
  for (const t of Object.keys(tables)) if (!known.has(t)) throw new Error(`unexpected table in the data: ${t}`)

  const counts = {}
  try {
    await db.query('begin')
    const existing = await db.query('select id from public.restaurants where id = $1 or (email is not null and lower(email) = $2)', [rid, email])
    if (existing.rows.length && !replace) {
      throw Object.assign(new Error(`"${restaurant.name}" is already in this database.`), { code: 'EXISTS' })
    }
    for (const old of existing.rows) await removeRestaurant(db, old.id)
    // No triggers while loading: rows land exactly as sent (PIN hashes aren't
    // re-hashed, totals aren't recalculated, nothing is broadcast).
    await db.query('set local session_replication_role = replica')

    let authSecret = null
    if (payload.users?.length) {
      await insertRows(db, 'auth', 'users', payload.users,
        'on conflict (id) do update set encrypted_password = excluded.encrypted_password, email = excluded.email')
      await insertRows(db, 'public', 'profiles', rewrite(payload.profiles || []), 'on conflict (id) do nothing')
    } else {
      // The cloud never sends its auth secrets: make this PC's own sign-in for
      // the restaurant, under the same user id.
      authSecret = crypto.randomBytes(24).toString('base64url')
      restaurant.owner_id = restaurant.owner_id || crypto.randomUUID()
      await db.query(
        `insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
         values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf', 10)), $4)
         on conflict (id) do update set email = excluded.email, encrypted_password = excluded.encrypted_password`,
        [restaurant.owner_id, email, authSecret, { restaurant_id: rid, provisioned: true }])
      await db.query(
        `insert into public.profiles (id, email, role, restaurant_id) values ($1, $2, 'owner', $3) on conflict (id) do nothing`,
        [restaurant.owner_id, email, rid])
    }
    await insertRows(db, 'public', 'plans', payload.plans || [], 'on conflict do nothing')
    await insertRows(db, 'public', 'restaurants', [restaurant])
    for (const t of [...CONFIG, ...HISTORY]) {
      if (tables[t.table]) counts[t.table] = await insertRows(db, 'public', t.table, tables[t.table])
    }
    if (authSecret) {
      await db.query(
        `insert into public.restaurant_secrets (restaurant_id, auth_secret) values ($1, $2)
         on conflict (restaurant_id) do update set auth_secret = excluded.auth_secret`, [rid, authSecret])
    }
    await db.query('commit')
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
  return { restaurantId: rid, name: restaurant.name, counts, files }
}

module.exports = { CONFIG, HISTORY, whereFor, importRestaurant, removeRestaurant, downloadFiles, makeUrlRewriter }
