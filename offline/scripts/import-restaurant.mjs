// Copy ONE restaurant from the cloud database into the local offline database,
// so the offline edition can be tried with a real menu, tables, staff, printers
// and the restaurant's usual logins (email + password, owner PIN, staff PINs).
//
// This reads real restaurant data from the cloud, so the owner runs it:
//
//   cd offline && npm run import-restaurant -- --email owner@example.com
//
// Options:
//   --with-history   also copy orders, invoices, expenses, reservations, audit log
//   --replace        overwrite this restaurant if it was imported before
//   --remove         delete this restaurant from the local database (no cloud access)
//   --no-images      keep image links pointing at the cloud instead of copying the files
//   --from <url>     read from another Postgres URL instead of SUPABASE_DB_URL (testing)
//   --data <dir>     local data folder (default offline/.data)   --pg-port <n>  its port
//
// The cloud is only read (one read-only transaction). Online-only data —
// delivery, WhatsApp, push subscriptions, guest waiter calls — is not copied.
// The desktop app does the same at first run through the cloud's export API.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require  = createRequire(import.meta.url)
const here     = path.dirname(fileURLToPath(import.meta.url))
const offline  = path.resolve(here, '..')
const pg       = require('pg')
const postgres = require('../runtime/postgres.cjs')
const { loadConfig } = require('../runtime/config.cjs')
const { CONFIG, HISTORY, whereFor, importRestaurant, removeRestaurant, downloadFiles } = require('../runtime/restaurant-import.cjs')

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }

const email = opt('--email')?.trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run import-restaurant -- --email <restaurant login email> [--with-history] [--replace] [--remove]')
  process.exit(1)
}
const TABLES = flag('--with-history') ? [...CONFIG, ...HISTORY] : CONFIG

function cloudUrl() {
  if (opt('--from')) return opt('--from')
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  try {
    const env = fs.readFileSync(path.join(offline, '..', '.env.local'), 'utf8')
    return /^SUPABASE_DB_URL\s*=\s*(.+)$/m.exec(env)?.[1].trim().replace(/^["']|["']$/g, '')
  } catch { return undefined }
}

const cfg = loadConfig({
  dataDir:   path.resolve(opt('--data') ?? path.join(offline, '.data')),
  vendorDir: path.join(offline, 'vendor'),
  ports:     opt('--pg-port') ? { postgres: Number(opt('--pg-port')) } : {},
})
await postgres.ensureCluster(cfg)
const wasRunning = await postgres.isRunning(cfg)
await postgres.start(cfg)
await postgres.migrate(cfg)
const local = new pg.Client(cfg.pg)
await local.connect()
const finish = async (code = 0) => {
  await local.end().catch(() => {})
  if (!wasRunning) await postgres.stop(cfg)
  process.exit(code)
}

// ── --remove: local only ────────────────────────────────────────────────────
if (flag('--remove')) {
  const r = await local.query('select id, name from public.restaurants where lower(email) = $1', [email])
  if (!r.rows[0]) { console.log(`No local restaurant with email ${email}.`); await finish() }
  try {
    await local.query('begin')
    await removeRestaurant(local, r.rows[0].id)
    await local.query('commit')
    console.log(`Removed "${r.rows[0].name}" from the local database.`)
    await finish()
  } catch (e) {
    await local.query('rollback').catch(() => {})
    console.error(e.message)
    await finish(1)
  }
}

// ── Read the cloud (one consistent, read-only snapshot) ────────────────────
const url = cloudUrl()
if (!url) {
  console.error('SUPABASE_DB_URL is not set (environment or .env.local). It is the Session pooler URI from Supabase → Connect.')
  await finish(1)
}
const isLocalUrl = /@(127\.0\.0\.1|localhost)[:/]/.test(url)
const cloud = new pg.Client({ connectionString: url, ssl: isLocalUrl ? false : { rejectUnauthorized: false } })
const payload = { tables: {} }
try {
  await cloud.connect()
  await cloud.query('begin transaction isolation level repeatable read read only')
  const r = await cloud.query('select to_jsonb(r) as row from public.restaurants r where lower(r.email) = $1', [email])
  if (!r.rows[0]) throw new Error(`No restaurant in the cloud with email ${email}.`)
  payload.restaurant = r.rows[0].row
  const rid = payload.restaurant.id
  const rows = async (sql, params) => (await cloud.query(`select coalesce(jsonb_agg(x), '[]'::jsonb) as rows from (${sql}) x`, params)).rows[0].rows
  for (const t of TABLES) payload.tables[t.table] = await rows(`select * from public.${pg.escapeIdentifier(t.table)} where ${whereFor(t)}`, [rid])
  // The restaurant's own auth user (session-bridge signs in as it) and any linked accounts.
  const ids = [payload.restaurant.owner_id, ...payload.tables.restaurant_users.map(u => u.user_id)].filter(Boolean)
  payload.profiles = await rows('select * from public.profiles where id = any($1::uuid[])', [ids])
  payload.users = await rows(
    `select id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, email_confirmed_at, created_at, updated_at
       from auth.users where id = any($1::uuid[])`, [ids])
  payload.plans = await rows('select * from public.plans where slug = $1', [payload.restaurant.plan])
  await cloud.query('commit')
} catch (e) {
  console.error(e.message)
  await cloud.end().catch(() => {})
  await finish(1)
}
await cloud.end()
if (!payload.users.find(u => u.id === payload.restaurant.owner_id)) {
  console.warn('Note: this restaurant has no auth user in the cloud (not provisioned) — a local one is made instead.')
  delete payload.users
}

// ── Write locally ───────────────────────────────────────────────────────────
let result
try {
  result = await importRestaurant(local, payload, {
    storageDir: cfg.storageDir, replace: flag('--replace'), keepRemoteImages: flag('--no-images'),
  })
} catch (e) {
  console.error(e.code === 'EXISTS' ? `${e.message} Run again with --replace to overwrite it.` : e.message)
  await finish(1)
}
// Pictures last: the database copy is the part that must be all-or-nothing.
const pics = await downloadFiles(result.files)

console.log(`Imported "${result.name}" (${result.restaurantId}).`)
for (const [t, n] of Object.entries(result.counts)) if (n) console.log(`  ${t.padEnd(24)} ${n}`)
if (result.files.size) console.log(`  images copied            ${pics.copied}/${result.files.size}`)
for (const f of pics.failed) console.log(`  ! image not copied: ${f}`)
if (!flag('--with-history')) console.log('Orders, invoices and expenses were not copied (add --with-history to include them).')
console.log(`Log in at http://localhost:${cfg.ports.gateway}/restaurant-login with ${email} and the restaurant's usual password, then its owner PIN.`)
await finish()
