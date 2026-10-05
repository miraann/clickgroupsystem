// Paths, ports and per-install secrets for the offline backend.
const fs     = require('node:fs')
const path   = require('node:path')
const crypto = require('node:crypto')
const { sign } = require('./jwt.cjs')

const DEFAULT_PORTS = {
  gateway:   4100, // the only port other devices (waiter tablets) talk to
  next:      4101,
  postgrest: 4102,
  postgres:  4103,
}

const SCHEMA_DIR = path.resolve(__dirname, '..', 'schema')

// The online system: activation (first run) and sales upload talk to it.
const CLOUD_URL = 'https://clickgroupsystem.vercel.app'

function loadSecrets(dataDir) {
  const file = path.join(dataDir, 'secrets.json')
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    const rnd = (n) => crypto.randomBytes(n).toString('hex')
    const secrets = {
      jwtSecret:             rnd(32), // signs every API token (PostgREST + auth)
      pgPassword:            rnd(16), // `postgres` superuser
      authenticatorPassword: rnd(16), // the role PostgREST logs in as
      sessionSecret:         rnd(32), // the app's own SESSION_SECRET cookies
    }
    fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 })
    return secrets
  }
}

/**
 * @param {object} o
 * @param {string} o.dataDir    where the database, uploads, logs and secrets live
 * @param {string} o.vendorDir  holds pgsql/ (PostgreSQL binaries) and postgrest/
 * @param {Partial<typeof DEFAULT_PORTS>} [o.ports]
 */
function loadConfig({ dataDir, vendorDir, ports = {} }) {
  fs.mkdirSync(dataDir, { recursive: true })
  const logDir = path.join(dataDir, 'logs')
  fs.mkdirSync(logDir, { recursive: true })

  const secrets = loadSecrets(dataDir)
  const p = { ...DEFAULT_PORTS, ...ports }
  // No exp: these are the install's long-lived API keys, like Supabase's.
  const anonKey    = sign({ iss: 'clickgroup-offline', role: 'anon' }, secrets.jwtSecret)
  const serviceKey = sign({ iss: 'clickgroup-offline', role: 'service_role' }, secrets.jwtSecret)

  return {
    dataDir,
    logDir,
    pgData:       path.join(dataDir, 'pg'),
    storageDir:   path.join(dataDir, 'storage'),
    schemaDir:    SCHEMA_DIR,
    pgBin:        path.join(vendorDir, 'pgsql', 'bin'),
    postgrestExe: path.join(vendorDir, 'postgrest', process.platform === 'win32' ? 'postgrest.exe' : 'postgrest'),
    ports:        p,
    secrets,
    anonKey,
    serviceKey,
    cloudUrl: (process.env.CG_CLOUD_URL || CLOUD_URL).replace(/\/+$/, ''),
    /** node-postgres config for the superuser (gateway auth + realtime). */
    pg: {
      host: '127.0.0.1', port: p.postgres, user: 'postgres', database: 'postgres',
      password: secrets.pgPassword,
    },
  }
}

module.exports = { loadConfig, DEFAULT_PORTS, CLOUD_URL }
