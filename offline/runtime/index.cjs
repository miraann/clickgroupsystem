// Entry point for the offline backend: one call brings up PostgreSQL,
// PostgREST and the gateway; nextEnv() gives the Next.js process the
// environment that points it at them instead of Supabase cloud.
const pg = require('pg')
const postgres  = require('./postgres.cjs')
const postgrest = require('./postgrest.cjs')
const { createGateway } = require('./gateway.cjs')
const { createUploader } = require('./upload.cjs')
const { loadConfig } = require('./config.cjs')
const { PUBLIC_ANON_KEY } = require('./jwt.cjs')

/**
 * Start everything in order. Each step waits for the one before it, because
 * PostgREST reads the schema at boot and the gateway needs a live pool.
 * autoLicense: development only — makes a licence when the restaurant has none.
 * @returns {Promise<{ pool: import('pg').Pool, stop: () => Promise<void>, control: object }>}
 */
async function startBackend({ cfg, log = console.log, autoLicense = null }) {
  const stops = []
  const stop = async () => {
    // Reverse order: stop accepting requests before the database goes away.
    for (const fn of stops.splice(0).reverse()) {
      try { await fn() } catch (e) { log(`[offline] stop: ${e.message}`) }
    }
  }

  try {
    await postgres.ensureCluster(cfg, log)
    await postgres.start(cfg, log)
    stops.push(() => postgres.stop(cfg))
    await postgres.migrate(cfg, log)

    const pool = new pg.Pool({ ...cfg.pg, max: 10 })
    // An idle client losing its connection (postgres restart) must not crash the process.
    pool.on('error', e => log(`[pg] ${e.message}`))
    stops.push(() => pool.end())

    const rest = await postgrest.start(cfg, log)
    stops.push(() => new Promise(resolve => {
      if (rest.exitCode !== null) return resolve()
      rest.once('exit', () => resolve())
      rest.kill()
    }))

    const gateway = createGateway({ cfg, pool, log, autoLicense })
    await gateway.control.load()
    await gateway.listen()
    stops.push(() => gateway.close())

    // Sales go up to the online system whenever this PC has internet.
    const uploader = createUploader({ cfg, pool, control: gateway.control, log })
    uploader.start()
    gateway.control.setUploader(uploader.runNow)
    stops.push(() => uploader.stop())

    return { pool, stop, control: gateway.control, uploader }
  } catch (e) {
    await stop()
    throw e
  }
}

/**
 * Environment for the Next.js server. Cloud-only keys are set to '' rather
 * than left out: Next.js only fills a variable from .env.local when it is
 * missing, so '' keeps a developer's cloud secrets out of the offline app.
 */
function nextEnv(cfg) {
  return {
    NEXT_PUBLIC_EDITION:           'offline',
    // Server-side calls go through the gateway on the same PC; browsers use
    // their own origin instead (src/lib/edition.ts).
    NEXT_PUBLIC_SUPABASE_URL:      `http://127.0.0.1:${cfg.ports.gateway}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLIC_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:     cfg.serviceKey,
    SESSION_SECRET:                cfg.secrets.sessionSecret,

    NEXT_PUBLIC_VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY:            '',
    VAPID_SUBJECT:                '',
    FIREBASE_SERVICE_ACCOUNT:     '',
    SUPABASE_DB_URL:              '',
    SELLER_PASSWORD:              '',
    CRON_SECRET:                  '',
    UPSTASH_REDIS_REST_URL:       '',
    UPSTASH_REDIS_REST_TOKEN:     '',
    KV_REST_API_URL:              '',
    KV_REST_API_TOKEN:            '',
  }
}

module.exports = { startBackend, nextEnv, loadConfig }
