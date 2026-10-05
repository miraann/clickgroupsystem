// The backend as its own process, for the desktop app (electron-offline/).
// Electron starts it with ELECTRON_RUN_AS_NODE=1 and these environment variables:
//   CG_DATA_DIR    data folder (database, pictures, logs, backups, secrets)
//   CG_VENDOR_DIR  folder with pgsql/ and postgrest/
//   CG_BACKUP_DIR  optional folder for backups (e.g. a USB stick)
// and talks to it over IPC:
//   parent → { id, type: 'backup' | 'restore' (file) | 'list-backups' | 'stop' }
//   child  → { type: 'ready' | 'fatal' | 'log', ... } and { id, ok, result | error }
const path = require('node:path')
const { startBackend, loadConfig } = require('./index.cjs')
const postgres = require('./postgres.cjs')
const backup   = require('./backup.cjs')

const DAY = 24 * 3600 * 1000
const send = (m) => { if (process.connected) process.send(m) }
const log  = (message) => {
  const line = `${new Date().toISOString()} ${message}`
  console.log(line)
  send({ type: 'log', message })
}

const cfg = loadConfig({ dataDir: process.env.CG_DATA_DIR, vendorDir: process.env.CG_VENDOR_DIR })
if (process.env.CG_BACKUP_DIR) cfg.backupDir = process.env.CG_BACKUP_DIR

let backend = null
let busy = Promise.resolve()          // one stop / restore / backup at a time
const queue = (fn) => (busy = busy.then(fn, fn))

// A backup a day, checked hourly, so a PC that runs for weeks still gets one
// and a PC switched on each morning gets one shortly after start.
async function dailyBackup() {
  const last = backup.listBackups(cfg)[0]
  if (last && Date.now() - new Date(last.at).getTime() < DAY) return
  const r = await backup.backupNow(cfg)
  log(`[backup] saved ${path.basename(r.file)} (${Math.round(r.size / 1024)} kB)`)
}

async function stop() {
  if (backend) { await backend.stop(); backend = null }
}

async function handle(m) {
  switch (m.type) {
    case 'backup':       return backup.backupNow(cfg)
    case 'list-backups': return { dir: backup.backupDir(cfg), backups: backup.listBackups(cfg) }
    case 'restore': {
      // Close every connection to the database, swap the data, start again.
      await stop()
      await postgres.start(cfg, log)
      try {
        return await backup.restore(cfg, m.file)
      } finally {
        backend = await startBackend({ cfg, log })
      }
    }
    case 'stop':
      await stop()
      setImmediate(() => process.exit(0))
      return { stopped: true }
    default:
      throw new Error(`unknown request: ${m.type}`)
  }
}

process.on('message', (m) => {
  queue(async () => {
    try { send({ id: m.id, ok: true, result: await handle(m) }) }
    catch (e) { send({ id: m.id, ok: false, error: e.message }) }
  })
})

// The app went away without saying stop (crash, killed): shut down cleanly anyway.
process.on('disconnect', () => queue(async () => { await stop(); process.exit(0) }))

;(async () => {
  try {
    backend = await startBackend({ cfg, log })
    send({ type: 'ready', dataDir: cfg.dataDir, ports: cfg.ports })
  } catch (e) {
    send({ type: 'fatal', message: e.message, logDir: cfg.logDir })
    process.exitCode = 1
    return
  }
  const timer = setInterval(() => queue(() => dailyBackup().catch(e => log(`[backup] failed: ${e.message}`))), 3600 * 1000)
  timer.unref()
  // First check a minute after start, out of the way of the morning rush.
  setTimeout(() => queue(() => dailyBackup().catch(e => log(`[backup] failed: ${e.message}`))), 60 * 1000).unref()
})()
