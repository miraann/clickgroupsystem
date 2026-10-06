// Sends the sales made on this PC to the online system whenever there is
// internet (schema/40_upload_queue.sql queues every change). Idempotent: rows
// keep their ids, so sending the same row twice just updates it in the cloud.
// Orders still open on a table wait until they're paid or closed, so they
// can't clash with the same table being used online.
const pg = require('pg')

const EVERY_MS = 60 * 1000
const BATCH    = 400
const CHECK_IN_MS = 6 * 60 * 60 * 1000

// Parents before children, matching the cloud's insert order.
const TABLES = ['customers', 'members', 'orders', 'order_items', 'invoices', 'pay_later', 'pay_later_payments', 'expenses']

function createUploader({ cfg, pool, control, log = console.log }) {
  let timer = null
  let running = false
  let lastLoggedError = null
  let lastContact = 0

  async function pendingCount() {
    return Number((await pool.query('select count(distinct (tbl, row_id)) as n from cg_offline.outbox')).rows[0].n)
  }

  async function record(patch) {
    const prev = (await control.getState('sync')) ?? {}
    await control.setState('sync', { ...prev, ...patch, pending: await pendingCount() })
  }

  /** One round: up to BATCH changed rows. Returns how many were sent. */
  async function uploadOnce() {
    if (!(await control.syncEnabled())) return 0
    const cloud = await control.getState('cloud')
    const { rows: keys } = await pool.query(`
      with pending as (
        select tbl, row_id, max(id) as last_id, min(id) as first_id from cg_offline.outbox group by tbl, row_id
      )
      select p.tbl, p.row_id, p.last_id from pending p
       where not (p.tbl = 'orders' and exists (
               select 1 from public.orders o where o.id = p.row_id and o.status = 'active'))
         and not (p.tbl = 'order_items' and exists (
               select 1 from public.order_items i join public.orders o on o.id = i.order_id
                where i.id = p.row_id and o.status = 'active'))
       order by p.first_id
       limit $1`, [BATCH])
    // Nothing to send: still ask now and then, which brings any renewal code
    // (an expired PC makes no sales, so it would never hear of one).
    if (!keys.length && Date.now() - lastContact < CHECK_IN_MS) return 0

    const changes = {}
    for (const t of TABLES) {
      const ids = keys.filter(k => k.tbl === t).map(k => k.row_id)
      if (!ids.length) continue
      const { rows } = await pool.query(`select to_jsonb(x) as r from public.${pg.escapeIdentifier(t)} x where id = any($1::uuid[])`, [ids])
      const found = new Set(rows.map(r => r.r.id))
      // Gone here (deleted since it was queued) means delete it there too.
      changes[t] = { rows: rows.map(r => r.r), deleted: ids.filter(id => !found.has(id)) }
    }

    const res = await fetch(`${cfg.cloudUrl}/api/offline-cloud/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloud.token}` },
      body: JSON.stringify({ changes }),
      signal: AbortSignal.timeout(60000),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(body?.error ?? `the online system answered ${res.status}`)
    lastContact = Date.now()

    // Clear only what was sent; changes made meanwhile stay queued.
    for (const k of keys) {
      await pool.query('delete from cg_offline.outbox where tbl = $1 and row_id = $2 and id <= $3', [k.tbl, k.row_id, k.last_id])
    }
    if (body?.serverTime) await control.trustCloudTime(body.serverTime)
    // A renewal the seller made online arrives by itself.
    if (body?.license) await control.offerLicense(body.license).catch(() => {})
    for (const s of body?.skipped ?? []) log(`[upload] the online system skipped ${s.table} ${s.id}: ${s.reason}`)
    return keys.length
  }

  async function round() {
    if (running) return
    running = true
    try {
      let sent = 0
      for (let n = await uploadOnce(); n; n = await uploadOnce()) sent += n
      if (sent) {
        log(`[upload] sent ${sent} change(s) to the online system`)
        await record({ lastUploadAt: new Date().toISOString(), lastError: null })
      } else {
        await record({ lastCheckAt: new Date().toISOString(), lastError: null })
      }
      lastLoggedError = null
    } catch (e) {
      const offline = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout|aborted/i.test(`${e.message} ${e.cause?.code ?? ''}`)
      const message = offline ? 'No internet connection' : e.message
      // A PC without internet is normal: log the change of state, not every minute.
      if (message !== lastLoggedError) log(`[upload] waiting: ${message}`)
      lastLoggedError = message
      await record({ lastError: message }).catch(() => {})
    } finally {
      running = false
    }
  }

  return {
    start() {
      if (timer) return
      setTimeout(round, 10 * 1000).unref?.()
      timer = setInterval(round, EVERY_MS)
      timer.unref?.()
    },
    stop() { clearInterval(timer); timer = null },
    runNow: round,
    pendingCount,
  }
}

module.exports = { createUploader, UPLOAD_TABLES: TABLES }
