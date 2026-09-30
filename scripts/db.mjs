// Run SQL against the live Supabase Postgres. Needs SUPABASE_DB_URL in
// .env.local — the *Session pooler* URI from Dashboard → Connect (the direct
// db.<ref>.supabase.co host is IPv6-only and unreachable from most networks):
//   postgresql://postgres.<ref>:<password>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
//
//   node --env-file=.env.local scripts/db.mjs "select count(*) from staff"
//   node --env-file=.env.local scripts/db.mjs -f supabase/migrations/X.sql --dry-run
//   node --env-file=.env.local scripts/db.mjs -f supabase/migrations/X.sql
//
// --dry-run runs the file inside BEGIN … ROLLBACK (the file's own begin/commit
// lines are neutralised), so nothing is kept. NOTICEs are printed either way.
import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL is not set (add it to .env.local).')
  process.exit(1)
}

const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const fileAt = args.indexOf('-f')
let sql = fileAt >= 0
  ? readFileSync(args[fileAt + 1], 'utf8')
  : args.filter(a => a !== '--dry-run')[0]
if (!sql) {
  console.error('usage: scripts/db.mjs "<sql>" | -f <file.sql> [--dry-run]')
  process.exit(1)
}
if (dry) sql = 'begin;\n' + sql.replace(/^\s*(begin|commit)\s*;\s*$/gim, '-- $1 (dry run)') + '\nrollback;'

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
client.on('notice', n => console.log(`NOTICE: ${n.message}`))
await client.connect()
try {
  const res = await client.query(sql)
  for (const r of Array.isArray(res) ? res : [res]) {
    if (!r.rows?.length) continue
    if (r.fields.length <= 6) console.table(r.rows)
    else for (const row of r.rows) console.log(JSON.stringify(row))
  }
  console.log(dry ? 'dry run — rolled back, nothing kept' : 'ok')
} catch (e) {
  console.error(`ERROR: ${e.message}${e.detail ? `\nDETAIL: ${e.detail}` : ''}${e.hint ? `\nHINT: ${e.hint}` : ''}${e.where ? `\nWHERE: ${e.where}` : ''}`)
  process.exitCode = 1
} finally {
  await client.end()
}
