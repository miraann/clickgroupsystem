// Regenerate offline/schema/10_public.sql from the cloud database: structure
// only (tables, functions, policies, grants), never any rows.
//
//   cd offline && npm run dump-schema          (--out <file> writes elsewhere)
//
// Needs SUPABASE_DB_URL (environment or the repo's .env.local) and the
// PostgreSQL tools from `npm run fetch-vendor`.
//
// Note: an install applies each schema file once, by file name. Shipping a
// new 10_public.sql only affects fresh installs; changes that existing PCs
// need go in a new numbered file (e.g. 30_<change>.sql).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here    = path.dirname(fileURLToPath(import.meta.url))
const offline = path.resolve(here, '..')
const outArg  = process.argv.indexOf('--out')
const out     = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(offline, 'schema', '10_public.sql')

function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  try {
    const env = fs.readFileSync(path.join(offline, '..', '.env.local'), 'utf8')
    const m = /^SUPABASE_DB_URL\s*=\s*(.+)$/m.exec(env)
    return m?.[1].trim().replace(/^["']|["']$/g, '')
  } catch { return undefined }
}

const url = dbUrl()
if (!url) {
  console.error('SUPABASE_DB_URL is not set (environment or .env.local).')
  process.exit(1)
}

// Passed as PG* variables rather than an argument, so the password never
// shows in a process list or a log.
const u = new URL(url)
const pgEnv = {
  PGHOST:     u.hostname,
  PGPORT:     u.port || '5432',
  PGUSER:     decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || 'postgres',
  PGSSLMODE:  u.searchParams.get('sslmode') || 'require',
}

const pgDump = path.join(offline, 'vendor', 'pgsql', 'bin', process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump')
const r = spawnSync(pgDump, [
  '--schema-only', '--schema=public',
  '--no-owner', '--no-publications', '--no-subscriptions', '--no-comments',
  '--file', out,
], { env: { ...process.env, ...pgEnv }, stdio: ['ignore', 'inherit', 'inherit'] })

if (r.status !== 0) {
  console.error('pg_dump failed (see above).')
  process.exit(r.status ?? 1)
}
const size = fs.statSync(out).size
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(size / 1024)} kB, schema only).`)
