// This PC's own controls, served by the gateway under /offline/v1/:
//   GET  status    activated? licence? the address tablets use — for the setup,
//                  licence and settings screens (no login needed, nothing secret)
//   POST activate  first run: { email, password } → the restaurant's data from
//                  the cloud's export API, loaded into the local database
//   POST license   { code } → a licence / renewal code from the seller
// It also decides what the app may do before activation or after the licence
// has run out (gate()).
const pg = require('pg')
const { readJson, sendJson } = require('./http-util.cjs')
const { verifyLicense, trustedPublicKey } = require('./license.cjs')
const { importRestaurant, downloadFiles } = require('./restaurant-import.cjs')
const { lanAddresses } = require('./net.cjs')

const DAY = 86400000
const GRACE_DAYS  = 3   // keeps working this long after the end date, with a warning
const ENDING_DAYS = 14  // warn this long before
const STATE_TTL   = 5000

// Reachable whatever the licence says: this API, the setup / licence screens
// and what they need to render.
const ALWAYS_OPEN = /^\/(offline\/|_next\/|favicon\.ico|icon|logo\/|font\/|app-icons\/|manifest\.json|sw\.js|__nextjs)/
const API = /^\/(api|rest|auth|storage|realtime)\//

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
    const r = await pool.query(`select id, name, menu_slug from public.restaurants order by created_at limit 1`)
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
    if (!cache || Date.now() - loadedAt > STATE_TTL) await load()
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

  const pendingUploads = async () =>
    Number((await pool.query('select count(distinct (tbl, row_id)) as n from cg_offline.outbox')).rows[0].n)

  async function status() {
    const s = await state()
    return {
      activated:  s.activated,
      restaurant: s.restaurant ? { name: s.restaurant.name, slug: s.restaurant.menu_slug } : null,
      license:    s.status,
      tablets:    lanAddresses().map(ip => `http://${ip}:${cfg.ports.gateway}`),
      sync:       { ...((await getState('sync')) ?? {}), pending: await pendingUploads() },
    }
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

  async function handle(req, res) {
    const path = new URL(req.url, 'http://local').pathname.replace(/^\/offline\/v1\/?/, '')
    try {
      if (path === 'status' && req.method === 'GET') return sendJson(res, 200, await status(), { 'Cache-Control': 'no-store' })
      if (path === 'activate' && req.method === 'POST') return await activate(req, res)
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
    handle, gate, state, load, status, trustCloudTime, getState, setState,
    setUploader: (fn) => { uploadNow = fn },
  }
}

module.exports = { createControl, licenseStatus }
