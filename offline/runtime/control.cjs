// This PC's own controls, served by the gateway under /offline/v1/:
//   GET  status    activated? licence? the address tablets use — for the setup,
//                  licence and settings screens (no login needed, nothing secret)
//   POST activate  first run: { email, password } → the restaurant's data from
//                  the cloud's export API, loaded into the local database
//   POST activate-file  first run without internet: a setup file the seller
//                  downloaded (seller panel → Offline licence), copied by USB
//   POST license   { code } → a licence / renewal code from the seller
//   POST connect   { email, password } → link to the online system and send
//                  sales there whenever there is internet
//   POST disconnect { password } → stop using the internet (until connect)
// It also decides what the app may do before activation or after the licence
// has run out (gate()).
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const pg = require('pg')
const { readJson, sendJson, bearer } = require('./http-util.cjs')
const { verify } = require('./jwt.cjs')
const { verifyLicense, trustedPublicKey } = require('./license.cjs')
const { importRestaurant, downloadFiles, CONFIG, whereFor } = require('./restaurant-import.cjs')
const { lanAddresses } = require('./net.cjs')

const DAY = 86400000
const GRACE_DAYS  = 3   // keeps working this long after the end date, with a warning
const ENDING_DAYS = 14  // warn this long before
const STATE_TTL   = 5000

// Reachable whatever the licence says: this API, the setup / licence screens
// and what they need to render.
// /api/offline/ is "make a new restaurant on this PC", which refuses once set up.
const ALWAYS_OPEN = /^\/(offline\/|api\/offline\/|_next\/|favicon\.ico|icon|logo\/|font\/|app-icons\/|manifest\.json|sw\.js|__nextjs)/
const API = /^\/(api|rest|auth|storage|realtime)\//

const SETUP_FILE_KIND = 'clickgroup-offline-setup'

/** Checks a password against restaurant_secrets.password_hash (src/lib/crypto.ts format). */
function passwordMatches(password, stored) {
  if (!stored) return false
  if (!stored.startsWith('pbkdf2:')) {
    const a = Buffer.from(String(password)), b = Buffer.from(stored)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }
  const [, salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const got = crypto.pbkdf2Sync(String(password), Buffer.from(salt, 'hex'), 100000, 32, 'sha256')
  const want = Buffer.from(hash, 'hex')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

const looksOffline = (e) => /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|timeout|aborted/i.test(`${e.message} ${e.cause?.code ?? ''}`)

/** End of the valid-until day, PC local time. */
const endOf = (date) => new Date(`${date}T23:59:59.999`).getTime()

function licenseStatus(lic, now) {
  if (!lic) return { state: 'none' }
  const end = endOf(lic.validUntil)
  const daysLeft = Math.ceil((end - now) / DAY)
  const state = now <= end
    ? (daysLeft <= ENDING_DAYS ? 'ending' : 'valid')
    : (now <= end + GRACE_DAYS * DAY ? 'grace' : 'expired')
  return { state, validUntil: lic.validUntil, daysLeft, graceDaysLeft: Math.ceil((end + GRACE_DAYS * DAY - now) / DAY) }
}

function createControl({ cfg, pool, log = console.log, autoLicense = null }) {
  let cache = null
  let uploadNow = null // set by startBackend once the uploader runs
  let loadedAt = 0

  const getState = async (key) => (await pool.query('select value from cg_offline.state where key = $1', [key])).rows[0]?.value ?? null
  const setState = (key, value) => pool.query(
    `insert into cg_offline.state (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, value])

  // The latest time this PC has seen. Licence checks use whichever is later,
  // this or the clock, so winding the clock back can't stretch a licence.
  // A time from the cloud (sales upload) may correct it either way.
  async function seenNow() {
    const clock = (await getState('clock')) ?? { lastSeen: 0 }
    const now = Math.max(Date.now(), clock.lastSeen)
    if (now - clock.lastSeen > 60000) await setState('clock', { lastSeen: now })
    return now
  }

  async function load() {
    const r = await pool.query(`select id, name, menu_slug, email from public.restaurants order by created_at limit 1`)
    const restaurant = r.rows[0] ?? null
    let license = await getState('license')
    if (license && restaurant && license.restaurantId !== restaurant.id) license = null
    if (restaurant && !license && autoLicense) {
      // Development only (offline/scripts/dev.mjs): a licence from a local test key.
      const code = autoLicense(restaurant.id)
      const v = verifyLicense(code, trustedPublicKey())
      if (v.ok) { license = { code, restaurantId: v.restaurantId, validUntil: v.validUntil }; await setState('license', license); log('[license] applied a development licence') }
    }
    const now = await seenNow()
    cache = { activated: !!restaurant, restaurant, license, status: licenseStatus(license, now) }
    loadedAt = Date.now()
    return cache
  }

  async function state() {
    // Not set up yet: look every time, since a restaurant can be made on this
    // PC by the app (/api/offline/create-restaurant), not through here.
    if (!cache || !cache.activated || Date.now() - loadedAt > STATE_TTL) await load()
    return cache
  }

  /** Called after a successful upload, with the cloud's clock. */
  async function trustCloudTime(serverTime) {
    if (Number.isFinite(serverTime)) { await setState('clock', { lastSeen: serverTime }); cache = null }
  }

  async function applyCode(code, restaurantId) {
    const v = verifyLicense(code, trustedPublicKey())
    if (!v.ok) return { ok: false, error: v.reason }
    if (v.restaurantId !== restaurantId) return { ok: false, error: 'That code is for a different restaurant.' }
    const current = await getState('license')
    // Re-entering an older code must not shorten the licence.
    if (current?.restaurantId === restaurantId && current.validUntil > v.validUntil) {
      return { ok: false, error: `This code ends on ${v.validUntil}, before the current licence (${current.validUntil}).` }
    }
    await setState('license', { code: String(code).trim(), restaurantId, validUntil: v.validUntil })
    log(`[license] valid until ${v.validUntil}`)
    await load()
    return { ok: true }
  }

  /** A licence the online system sent (sales upload, connect): kept only if it is newer. */
  async function offerLicense(code) {
    const s = await state()
    if (!code || !s.restaurant) return
    const current = await getState('license')
    if (current?.code === String(code).trim()) return
    const v = verifyLicense(code, trustedPublicKey())
    if (v.ok && (!current || v.validUntil > current.validUntil)) await applyCode(code, s.restaurant.id)
  }

  const pendingUploads = async () =>
    Number((await pool.query('select count(distinct (tbl, row_id)) as n from cg_offline.outbox')).rows[0].n)

  /**
   * Sales go to the online system only when this PC is linked (it has an
   * upload token) and the owner hasn't switched that off. Off, the app never
   * uses the internet.
   */
  async function syncEnabled() {
    const cloud = await getState('cloud')
    return !!cloud?.token && (await getState('cloudSync'))?.enabled !== false
  }

  async function status() {
    const s = await state()
    const cloud = await getState('cloud')
    return {
      activated:  s.activated,
      restaurant: s.restaurant ? { id: s.restaurant.id, name: s.restaurant.name, slug: s.restaurant.menu_slug, email: s.restaurant.email } : null,
      license:    s.status,
      tablets:    lanAddresses().map(ip => `http://${ip}:${cfg.ports.gateway}`),
      cloud:      { linked: !!cloud?.token, enabled: await syncEnabled() },
      sync:       { ...((await getState('sync')) ?? {}), pending: await pendingUploads() },
    }
  }

  /** The owner's email + password, checked on this PC (no internet needed). */
  async function checkOwner(email, password) {
    const s = await state()
    if (!s.restaurant) return false
    if (email != null && String(email).trim().toLowerCase() !== String(s.restaurant.email || '').toLowerCase()) return false
    const r = await pool.query('select password_hash from public.restaurant_secrets where restaurant_id = $1', [s.restaurant.id])
    return passwordMatches(password, r.rows[0]?.password_hash)
  }

  // ── Activation ────────────────────────────────────────────────────────────
  let attempts = []
  async function activate(req, res) {
    const s = await state()
    if (s.activated) return sendJson(res, 409, { error: 'This PC is already set up.' })
    attempts = attempts.filter(t => Date.now() - t < 3600000)
    if (attempts.length >= 10) return sendJson(res, 429, { error: 'Too many attempts. Try again in an hour.' })
    attempts.push(Date.now())

    const { email, password } = await readJson(req)
    if (!email || !password) return sendJson(res, 400, { error: 'Enter the restaurant email and password.' })
    let payload
    try {
      const r = await fetch(`${cfg.cloudUrl}/api/offline-cloud/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email).trim(), password: String(password) }),
        signal: AbortSignal.timeout(120000),
      })
      payload = await r.json().catch(() => null)
      if (!r.ok || !payload?.restaurant) return sendJson(res, r.status === 200 ? 502 : r.status, { error: payload?.error ?? 'The online system did not answer properly.' })
    } catch {
      return sendJson(res, 503, { error: 'No internet connection. Setting up needs internet once — connect this PC and try again.' })
    }

    const db = new pg.Client(cfg.pg)
    await db.connect()
    let result
    try {
      result = await importRestaurant(db, payload, { storageDir: cfg.storageDir })
    } catch (e) {
      log(`[activate] import failed: ${e.message}`)
      return sendJson(res, 500, { error: `Could not save the restaurant on this PC: ${e.message}` })
    } finally {
      await db.end().catch(() => {})
    }
    const pics = await downloadFiles(result.files)
    if (payload.install) await setState('cloud', payload.install)
    let license = null
    if (payload.license) {
      const r = await applyCode(payload.license, result.restaurantId)
      license = r.ok ? 'applied' : r.error
    }
    await load()
    log(`[activate] "${result.name}" set up (${Object.values(result.counts).reduce((a, b) => a + b, 0)} rows, ${pics.copied}/${result.files.size} pictures)`)
    sendJson(res, 200, { ok: true, restaurant: result.name, license, pictures: { copied: pics.copied, total: result.files.size } })
  }

  // ── Set-up file (no internet) ─────────────────────────────────────────────
  // Made by the seller panel: the same data the online set-up downloads, plus
  // the pictures inside and the latest licence code.
  async function activateFile(req, res) {
    const s = await state()
    if (s.activated) return sendJson(res, 409, { error: 'This PC is already set up.' })
    const file = await readJson(req, 400 * 1024 * 1024)
    if (file?.kind !== SETUP_FILE_KIND || !file.data?.restaurant) {
      return sendJson(res, 400, { error: 'This is not a ClickGroup setup file.' })
    }
    const db = new pg.Client(cfg.pg)
    await db.connect()
    let result
    try {
      result = await importRestaurant(db, file.data, { storageDir: cfg.storageDir })
    } catch (e) {
      log(`[activate] import from file failed: ${e.message}`)
      return sendJson(res, 500, { error: `Could not save the restaurant on this PC: ${e.message}` })
    } finally {
      await db.end().catch(() => {})
    }
    // Only pictures the data actually links to, written where those links point.
    let copied = 0
    for (const [rel, { file: target }] of result.files) {
      const b64 = file.files?.[rel]
      if (typeof b64 !== 'string') continue
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, Buffer.from(b64, 'base64'))
      copied++
    }
    let license = null
    if (file.license) {
      const r = await applyCode(file.license, result.restaurantId)
      license = r.ok ? 'applied' : r.error
    }
    await load()
    log(`[activate] "${result.name}" set up from a file (${copied}/${result.files.size} pictures)`)
    sendJson(res, 200, { ok: true, restaurant: result.name, license, pictures: { copied, total: result.files.size } })
  }

  // ── Link to the online system ─────────────────────────────────────────────
  let ownerFailures = []
  async function ownerOk(email, password) {
    ownerFailures = ownerFailures.filter(t => Date.now() - t < 3600000)
    if (ownerFailures.length >= 10) return { ok: false, status: 429, error: 'Too many attempts. Try again in an hour.' }
    if (await checkOwner(email, password)) return { ok: true }
    ownerFailures.push(Date.now())
    return { ok: false, status: 401, error: 'Incorrect email or password.' }
  }

  /** The restaurant's set-up on this PC, for a restaurant the online system doesn't have yet. */
  async function localSetup(rid) {
    const { rows: [restaurant] } = await pool.query('select to_jsonb(r) as r from public.restaurants r where id = $1', [rid])
    const tables = {}
    for (const spec of CONFIG) {
      // Sign-ins are made fresh online; only the owner PIN hash goes along.
      if (spec.table === 'restaurant_users') continue
      const { rows } = await pool.query(`select to_jsonb(x) as r from public.${pg.escapeIdentifier(spec.table)} x where ${whereFor(spec)}`, [rid])
      tables[spec.table] = rows.map(r => r.r)
    }
    tables.restaurant_secrets = tables.restaurant_secrets.map(r => ({ restaurant_id: r.restaurant_id, owner_pin_hash: r.owner_pin_hash }))
    return { restaurant: restaurant.r, tables }
  }

  async function callCloud(route, body) {
    const r = await fetch(`${cfg.cloudUrl}/api/offline-cloud/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    return { status: r.status, json: await r.json().catch(() => null) }
  }

  async function connect(req, res) {
    const s = await state()
    if (!s.activated) return sendJson(res, 409, { error: 'Set up the restaurant first.' })
    const { email, password } = await readJson(req)
    const owner = await ownerOk(email, password)
    if (!owner.ok) return sendJson(res, owner.status, { error: owner.error })

    if ((await getState('cloud'))?.token) {
      await setState('cloudSync', { enabled: true })
      log('[connect] sending sales to the online system again')
      if (uploadNow) uploadNow()
      return sendJson(res, 200, await status())
    }

    const rid = s.restaurant.id
    const ask = { email: String(email).trim(), password: String(password), restaurantId: rid, license: s.license?.code ?? null }
    let reply
    try {
      reply = await callCloud('connect', ask)
      // A restaurant made on this PC: the online system gets its set-up too.
      if (reply.status === 409 && reply.json?.needsSetup) reply = await callCloud('connect', { ...ask, setup: await localSetup(rid) })
    } catch (e) {
      if (looksOffline(e)) return sendJson(res, 503, { error: 'No internet connection. Connect this PC to the internet and try again.' })
      throw e
    }
    if (reply.status !== 200 || !reply.json?.install?.token) {
      return sendJson(res, reply.status === 200 ? 502 : reply.status, { error: reply.json?.error ?? 'The online system did not answer properly.' })
    }

    // Pictures of a restaurant made here, into the online storage.
    let pictures = 0
    for (const u of reply.json.uploads ?? []) {
      const m = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(u.path ?? '')
      if (!m) continue
      const file = path.resolve(cfg.storageDir, decodeURIComponent(m[1]), ...m[2].split('/').map(decodeURIComponent))
      if (!file.startsWith(path.resolve(cfg.storageDir) + path.sep) || !fs.existsSync(file)) continue
      const put = await fetch(u.url, { method: 'PUT', body: fs.readFileSync(file), signal: AbortSignal.timeout(60000) }).catch(() => null)
      if (put?.ok) pictures++
    }

    await setState('cloud', reply.json.install)
    await setState('cloudSync', { enabled: true })
    if (Number.isFinite(reply.json.serverTime)) await trustCloudTime(reply.json.serverTime)
    await offerLicense(reply.json.license)
    log(`[connect] linked to the online system${reply.json.created ? ' (restaurant created online)' : ''}${pictures ? `, ${pictures} pictures sent` : ''}`)
    if (uploadNow) uploadNow()
    sendJson(res, 200, await status())
  }

  async function disconnect(req, res) {
    const { password } = await readJson(req)
    const owner = await ownerOk(null, password)
    if (!owner.ok) return sendJson(res, owner.status, { error: owner.error === 'Incorrect email or password.' ? 'Incorrect password.' : owner.error })
    await setState('cloudSync', { enabled: false })
    log('[connect] sales upload switched off — the app no longer uses the internet')
    sendJson(res, 200, await status())
  }

  async function handle(req, res) {
    const path = new URL(req.url, 'http://local').pathname.replace(/^\/offline\/v1\/?/, '')
    try {
      if (path === 'status' && req.method === 'GET') return sendJson(res, 200, await status(), { 'Cache-Control': 'no-store' })
      if (path === 'activate' && req.method === 'POST') return await activate(req, res)
      if (path === 'activate-file' && req.method === 'POST') return await activateFile(req, res)
      if (path === 'connect' && req.method === 'POST') return await connect(req, res)
      if (path === 'disconnect' && req.method === 'POST') return await disconnect(req, res)
      if (path === 'upload' && req.method === 'POST') {
        // "Upload now" — just runs the regular upload early; nothing to abuse.
        if (uploadNow) await uploadNow()
        return sendJson(res, 200, await status())
      }
      if (path === 'license' && req.method === 'POST') {
        const s = await state()
        if (!s.activated) return sendJson(res, 409, { error: 'Set up the restaurant first.' })
        const { code } = await readJson(req)
        const r = await applyCode(code, s.restaurant.id)
        return sendJson(res, r.ok ? 200 : 400, r.ok ? await status() : { error: r.error })
      }
      sendJson(res, 404, { error: 'Not found' })
    } catch (e) {
      log(`[control] ${e.message}`)
      sendJson(res, 500, { error: 'Something went wrong on this PC — see the logs.' })
    }
  }

  /**
   * null when the request may go ahead; otherwise where to send a page
   * ({ redirect }) or that an API call is refused ({ status, error }).
   */
  async function gate(req) {
    if (ALWAYS_OPEN.test(req.url)) return null
    // The app server's own calls (service key, never leaves this PC) — e.g.
    // making a restaurant on the PC, which happens before setup by definition.
    if (verify(bearer(req), cfg.secrets.jwtSecret)?.role === 'service_role') return null
    const s = await state()
    const to = !s.activated ? '/offline/setup'
      : (s.status.state === 'none' || s.status.state === 'expired') ? '/offline/license'
      : null
    if (!to) return null
    if (API.test(req.url)) {
      return { status: 403, error: to === '/offline/setup' ? 'This PC is not set up yet.' : 'The licence has ended — enter a renewal code.' }
    }
    return { redirect: to }
  }

  return {
    handle, gate, state, load, status, trustCloudTime, getState, setState, syncEnabled, offerLicense,
    setUploader: (fn) => { uploadNow = fn },
  }
}

module.exports = { createControl, licenseStatus }
