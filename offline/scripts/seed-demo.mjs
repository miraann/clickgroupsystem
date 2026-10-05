// Create a demo restaurant in the LOCAL offline database (offline/.data), so
// the offline edition can be tried without copying any real restaurant.
//
//   cd offline && npm run seed:demo            (add --reset to recreate it)
//
// It writes the same rows the seller "create restaurant" route and
// provisioning do, plus a small menu, tables and a network printer.
//
// Demo login (local test data only):
//   http://localhost:4100/restaurant-login   demo@clickgroup.local / demo12345
//   owner PIN 123456 · staff PIN 111111 (Cashier) · POS login /pos/demo/login
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const here    = path.dirname(fileURLToPath(import.meta.url))
const offline = path.resolve(here, '..')
const repo    = path.resolve(offline, '..')
const pg       = require('pg')
const postgres = require('../runtime/postgres.cjs')
const { loadConfig } = require('../runtime/config.cjs')

// Test runs can seed a second, separate database (e.g. a stand-in "cloud"):
//   --data <dir> --pg-port <n> --name <s> --email <s> --slug <s>
const opt = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }

const DEMO = {
  name:     opt('--name')  ?? 'Demo Restaurant',
  email:    opt('--email') ?? 'demo@clickgroup.local',
  password: 'demo12345',
  ownerPin: '123456',
  slug:     opt('--slug')  ?? 'demo',
  staff:    [{ name: 'Cashier', pin: '111111', role: 'cashier', roleName: 'Cashier', color: 'from-sky-500 to-blue-600' }],
  printer:  { name: 'Demo Printer', ip: '127.0.0.1', port: 9100 },
}

// Same format as hashSecret() in src/lib/crypto.ts: PBKDF2-SHA256, 100k rounds.
function hashSecret(secret) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.pbkdf2Sync(secret, salt, 100_000, 32, 'sha256')
  return `pbkdf2:${salt.toString('hex')}:${hash.toString('hex')}`
}

// One source of truth for the starter roles. Node runs this .ts file directly
// (it only uses erasable type annotations).
const { DEFAULT_ROLES } = await import(pathToFileURL(path.join(repo, 'src', 'lib', 'defaultRoles.ts')).href)

const cfg = loadConfig({
  dataDir:   path.resolve(opt('--data') ?? path.join(offline, '.data')),
  vendorDir: path.join(offline, 'vendor'),
  ports:     opt('--pg-port') ? { postgres: Number(opt('--pg-port')) } : {},
})
const reset = process.argv.includes('--reset')

await postgres.ensureCluster(cfg)
const wasRunning = await postgres.isRunning(cfg)
await postgres.start(cfg)
await postgres.migrate(cfg)

const db = new pg.Client(cfg.pg)
await db.connect()
const q = (sql, params) => db.query(sql, params)

try {
  const existing = await q('select id from public.restaurants where email = $1', [DEMO.email])
  if (existing.rows[0] && !reset) {
    console.log('Demo restaurant already exists (run with --reset to recreate it).')
  } else {
    await q('begin')
    if (existing.rows[0]) {
      const rid = existing.rows[0].id
      const owner = await q('select owner_id from public.restaurants where id = $1', [rid])
      await q('delete from public.restaurants where id = $1', [rid])
      if (owner.rows[0]?.owner_id) await q('delete from auth.users where id = $1', [owner.rows[0].owner_id])
    }

    const rid = crypto.randomUUID()
    await q(
      `insert into public.restaurants (id, name, email, phone, status, plan, menu_slug, settings)
       values ($1, $2, $3, $4, 'active', 'offline', $5, $6)`,
      [rid, DEMO.name, DEMO.email, '07500000000', DEMO.slug,
       { owner_name: 'Demo Owner', currency: 'IQD', default_language: 'ku' }],
    )

    // The restaurant's auth user — what session-bridge signs in as, so that
    // auth.uid() (and with it every tenant RLS policy) works.
    const authSecret = crypto.randomBytes(24).toString('base64url')
    const user = await q(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data)
       values ($1, extensions.crypt($2, extensions.gen_salt('bf', 10)), $3) returning id`,
      [DEMO.email, authSecret, { restaurant_id: rid, provisioned: true }],
    )
    await q('update public.restaurants set owner_id = $1 where id = $2', [user.rows[0].id, rid])
    await q(
      `insert into public.restaurant_secrets (restaurant_id, password_hash, owner_pin_hash, auth_secret)
       values ($1, $2, $3, $4)`,
      [rid, hashSecret(DEMO.password), hashSecret(DEMO.ownerPin), authSecret],
    )

    const roleIds = {}
    for (const r of DEFAULT_ROLES) {
      const row = await q(
        'insert into public.restaurant_roles (restaurant_id, name, permissions) values ($1, $2, $3) returning id',
        [rid, r.name, r.permissions],
      )
      roleIds[r.name] = row.rows[0].id
    }
    // staff.pin is hashed into staff_secrets by the fn_staff_hash_pin trigger.
    for (const s of DEMO.staff) {
      await q(
        `insert into public.staff (restaurant_id, name, role, pin, color, status, role_id)
         values ($1, $2, $3, $4, $5, 'active', $6)`,
        [rid, s.name, s.role, s.pin, s.color, roleIds[s.roleName]],
      )
    }

    await q(
      `insert into public.currencies (restaurant_id, name, symbol, decimal_places, is_default, sort_order)
       values ($1, 'Iraqi Dinar', 'IQD', 0, true, 0)`, [rid])
    await q(
      `insert into public.payment_methods (restaurant_id, name, icon_type, active, is_default, sort_order)
       values ($1, 'کاش', 'cash', true, true, 0), ($1, 'Card', 'card', true, false, 1)`, [rid])
    await q(
      `insert into public.receipt_settings (restaurant_id, shop_name, phone, address, currency_symbol, language, show_qr)
       values ($1, $2, '07500000000', 'Erbil', 'IQD', 'ku', false)`, [rid, DEMO.name])
    await q('insert into public.order_number_settings (restaurant_id) values ($1)', [rid])
    await q('insert into public.invoice_number_settings (restaurant_id) values ($1)', [rid])

    const menu = [
      { name: 'خواردن', color: '#f59e0b', items: [['کەبابی گۆشت', 8000], ['تکە', 9000], ['پیتزا', 12000], ['Burger', 7000]] },
      { name: 'خواردنەوە', color: '#3b82f6', items: [['چا', 500], ['کۆکاکۆلا', 1000], ['ئاو', 500]] },
    ]
    for (const [ci, cat] of menu.entries()) {
      const c = await q(
        'insert into public.menu_categories (restaurant_id, name, color, sort_order) values ($1, $2, $3, $4) returning id',
        [rid, cat.name, cat.color, ci])
      for (const [ii, [name, price]] of cat.items.entries()) {
        await q(
          'insert into public.menu_items (restaurant_id, category_id, name, price, sort_order) values ($1, $2, $3, $4, $5)',
          [rid, c.rows[0].id, name, price, ii])
      }
    }

    const group = await q(
      `insert into public.table_groups (restaurant_id, name, sort_order) values ($1, 'Hall', 0) returning id`, [rid])
    for (let n = 1; n <= 8; n++) {
      await q(
        `insert into public.tables (restaurant_id, group_id, seq, table_number, capacity, sort_order)
         values ($1, $2, $3, $4, 4, $3)`, [rid, group.rows[0].id, n, String(n)])
    }

    await q(
      `insert into public.printers (restaurant_id, name, purpose, purposes, connection_type, ip_address, port, paper_width)
       values ($1, $2, 'receipt', array['receipt','kitchen','report'], 'ip', $3, $4, 80)`,
      [rid, DEMO.printer.name, DEMO.printer.ip, DEMO.printer.port])

    await q('commit')
    console.log(`Demo restaurant created (id ${rid}).`)
    console.log('Logins are listed at the top of offline/scripts/seed-demo.mjs.')
  }
} catch (e) {
  await q('rollback').catch(() => {})
  console.error(e.message)
  process.exitCode = 1
} finally {
  await db.end()
  if (!wasRunning) await postgres.stop(cfg)
}
