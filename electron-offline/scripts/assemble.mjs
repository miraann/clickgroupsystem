// Put together everything the desktop app ships, in electron-offline/stage/:
//   stage/web/      the Next.js app, built for the offline edition (standalone server.js)
//   stage/backend/  offline/runtime + schema, their node_modules, PostgreSQL and PostgREST
//
//   cd electron-offline && npm run assemble      (npm run build:win also makes the installer)
//
// Needs `npm install` in the repo root, in offline/, and `npm run fetch-vendor` in offline/.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here    = path.dirname(fileURLToPath(import.meta.url))
const desktop = path.resolve(here, '..')
const repo    = path.resolve(desktop, '..')
const offline = path.join(repo, 'offline')
const stage   = path.join(desktop, 'stage')
const require = createRequire(import.meta.url)
const { nextEnv } = require(path.join(offline, 'runtime', 'index.cjs'))
const { DEFAULT_PORTS } = require(path.join(offline, 'runtime', 'config.cjs'))

const step = (m) => console.log(`\n▶ ${m}`)
const mb = (dir) => {
  let n = 0
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (n += fs.statSync(p).size) } }
  walk(dir)
  return `${Math.round(n / 1048576)} MB`
}

for (const p of [path.join(offline, 'vendor', 'pgsql', 'bin', 'postgres.exe'), path.join(offline, 'vendor', 'postgrest', 'postgrest.exe'), path.join(offline, 'node_modules', 'pg')]) {
  if (!fs.existsSync(p)) { console.error(`Missing ${p} — run "npm install" and "npm run fetch-vendor" in offline/ first.`); process.exit(1) }
}

// The installer build first deletes its output folder (dist/, or --out <dir>
// to match electron-builder's --config.directories.output); a copy running
// from there would lose half its files under it. An installed copy is fine.
if (process.platform === 'win32') {
  const outArg = process.argv.indexOf('--out')
  const out = path.resolve(desktop, outArg > 0 ? process.argv[outArg + 1] : 'dist')
  const paths = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Process ClickGroupPOSOffline -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }'], { encoding: 'utf8' }).stdout
  if (paths.split(/\r?\n/).some(p => p && path.resolve(p).toLowerCase().startsWith(out.toLowerCase() + path.sep))) {
    console.error(`ClickGroup POS Offline is running from ${out} — quit it first (tray icon → Quit), then build again.`)
    process.exit(1)
  }
}

// ── 1. Next.js, offline edition ─────────────────────────────────────────────
// The browser-facing settings are fixed at build time. Every cloud setting is
// set empty, so nothing from .env.local (keys, the cloud address) can end up
// inside the app.
step('Building the Next.js app (offline edition)')
// Some API routes create their database client when loaded, which the build
// does; a placeholder satisfies that. The real per-install key is only passed
// to the server when the app runs (server-only settings aren't built in).
const PLACEHOLDER = 'offline-build-placeholder'
const buildEnv = {
  ...process.env,
  ...nextEnv({ ports: DEFAULT_PORTS, serviceKey: PLACEHOLDER, secrets: { sessionSecret: PLACEHOLDER } }),
  NEXT_TELEMETRY_DISABLED: '1',
}
const build = spawnSync(process.execPath, [path.join(repo, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
  cwd: repo, env: buildEnv, stdio: 'inherit',
})
if (build.status !== 0) process.exit(build.status ?? 1)

const dist = path.join(repo, '.next-offline')
fs.rmSync(stage, { recursive: true, force: true })
const app = path.join(stage, 'web')

step('Staging the app')
fs.cpSync(path.join(dist, 'standalone'), app, { recursive: true })
fs.cpSync(path.join(dist, 'static'), path.join(app, '.next-offline', 'static'), { recursive: true })
// Next's file tracing copies a native addon's .node file but not the DLLs
// beside it (sharp needs libvips-*.dll), so ship native packages whole.
const nativePackages = new Set()
const findNative = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) findNative(p)
    else if (e.name.endsWith('.node')) {
      let pkg = path.dirname(p)
      while (!fs.existsSync(path.join(pkg, 'package.json'))) pkg = path.dirname(pkg)
      nativePackages.add(path.relative(path.join(app, 'node_modules'), pkg))
    }
  }
}
findNative(path.join(app, 'node_modules'))
for (const pkg of nativePackages) {
  fs.cpSync(path.join(repo, 'node_modules', pkg), path.join(app, 'node_modules', pkg), { recursive: true })
  console.log(`  native package copied whole: ${pkg}`)
}
// Android APKs, the APK update manifest, face-scan models and design drafts aren't used offline.
const SKIP_PUBLIC = new Set(['apps', 'android-latest.json', 'models', 'Settings page'])
fs.cpSync(path.join(repo, 'public'), path.join(app, 'public'), {
  recursive: true,
  filter: (src) => !SKIP_PUBLIC.has(path.relative(path.join(repo, 'public'), src).split(path.sep)[0]),
})

// ── 2. Backend ──────────────────────────────────────────────────────────────
step('Staging the backend')
const backend = path.join(stage, 'backend')
for (const dir of ['runtime', 'schema']) {
  fs.cpSync(path.join(offline, dir), path.join(backend, dir), { recursive: true })
}
// Only the runtime's own dependencies (pg, ws and what they need), not the test tools.
// npm's own CLI script, run with this Node (npm.cmd would need a shell on Windows).
const npmCli = process.env.npm_execpath?.endsWith('.js')
  ? process.env.npm_execpath
  : path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const deps = execFileSync(process.execPath, [npmCli, 'ls', '--omit=dev', '--all', '--parseable'], {
  cwd: offline, encoding: 'utf8',
}).split(/\r?\n/).filter(p => p && path.resolve(p) !== path.resolve(offline))
// `npm ls --all` lists nested packages on their own, so copy each one without
// its node_modules folder (that would drag dev-only packages along).
for (const dep of deps) {
  fs.cpSync(dep, path.join(backend, path.relative(offline, dep)), {
    recursive: true,
    filter: (src) => !path.relative(dep, src).split(path.sep).includes('node_modules'),
  })
}
// PostgreSQL: the server and the tools the runtime uses, not the GUI installer bits.
const SKIP_PG = /^(stackbuilder\.exe|wx.*\.dll|pgbench\.exe|ecpg\.exe|pg_upgrade\.exe|pg_rewind\.exe|pg_basebackup\.exe|pg_receivewal\.exe|pg_recvlogical\.exe|pg_waldump\.exe|pg_walsummary\.exe|pg_combinebackup\.exe|pg_createsubscriber\.exe|pg_test_.*\.exe|.*\.lib)$/i
fs.cpSync(path.join(offline, 'vendor', 'pgsql'), path.join(backend, 'vendor', 'pgsql'), {
  recursive: true, filter: (src) => !SKIP_PG.test(path.basename(src)),
})
fs.mkdirSync(path.join(backend, 'vendor', 'postgrest'), { recursive: true })
fs.copyFileSync(path.join(offline, 'vendor', 'postgrest', 'postgrest.exe'), path.join(backend, 'vendor', 'postgrest', 'postgrest.exe'))

// ── 3. Nothing from the cloud setup may be inside ───────────────────────────
step('Checking the staged files for cloud settings')
const secrets = []
try {
  const env = fs.readFileSync(path.join(repo, '.env.local'), 'utf8')
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SESSION_SECRET',
    'SELLER_PASSWORD', 'VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'SUPABASE_DB_URL', 'FIREBASE_SERVICE_ACCOUNT']) {
    const v = new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm').exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '')
    if (v && v.length >= 12) secrets.push({ key, value: key === 'FIREBASE_SERVICE_ACCOUNT' ? (/"private_key_id"\s*:\s*"([^"]+)"/.exec(v)?.[1] ?? v) : v })
  }
} catch { /* no .env.local: nothing to leak */ }
const TEXT = /\.(js|cjs|mjs|json|html|css|txt|map|rsc|body|meta|sql)$/i
const hits = []
const scan = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { scan(p); continue }
    if (!TEXT.test(e.name) || fs.statSync(p).size > 50 * 1048576) continue
    const text = fs.readFileSync(p, 'utf8')
    for (const s of secrets) if (text.includes(s.value)) hits.push(`${s.key} in ${path.relative(stage, p)}`)
  }
}
scan(stage)
if (hits.length) {
  console.error('Cloud settings found in the staged app — refusing to continue:\n  ' + hits.join('\n  '))
  fs.rmSync(stage, { recursive: true, force: true })
  process.exit(1)
}
console.log(`  checked against ${secrets.length} cloud settings: none found`)

// The app trusts only codes signed by the seller's key; without the public
// half (offline/scripts/license-keygen.mjs) no licence can be entered.
if (!fs.existsSync(path.join(offline, 'runtime', 'license-public.pem'))) {
  console.warn('')
  console.warn('!  offline/runtime/license-public.pem is missing — this build will refuse every licence code.')
  console.warn('   Run "npm run license-keygen" in offline/ once, commit the .pem, then build again.')
}

step('Done')
console.log(`  stage/web      ${mb(app)}`)
console.log(`  stage/backend  ${mb(backend)}`)
