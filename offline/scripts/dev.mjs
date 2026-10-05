// Run the offline edition from source: local backend + `next dev`.
//
//   cd offline && npm run dev        → browse http://localhost:4100
//
// Data lives in offline/.data (git-ignored; --data <dir> uses another folder,
// e.g. to try first-run setup on a fresh "PC"). Ctrl+C stops Next.js, the
// gateway, PostgREST and PostgreSQL.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require   = createRequire(import.meta.url)
const here      = path.dirname(fileURLToPath(import.meta.url))
const offline   = path.resolve(here, '..')
const repo      = path.resolve(offline, '..')
const { startBackend, nextEnv, loadConfig } = require('../runtime/index.cjs')

const dataArg = process.argv.indexOf('--data')
const cfg = loadConfig({
  dataDir:   dataArg > 0 ? path.resolve(process.argv[dataArg + 1]) : path.join(offline, '.data'),
  vendorDir: path.join(offline, 'vendor'),
})
const log = (m) => console.log(m)

// A development stand-in for the seller's signing key, so the licence checks
// and screens behave as in the real app: any restaurant here gets a one-year
// licence. It lives in offline/.data; desktop app builds never contain it
// (they trust offline/runtime/license-public.pem only). Set
// CG_LICENSE_PUBLIC_KEY yourself to test against another key.
const { createLicense, generateKeyPair } = require('../runtime/license.cjs')
const devKeyFile = path.join(cfg.dataDir, 'license-dev-key.json')
let devKey
try { devKey = JSON.parse(fs.readFileSync(devKeyFile, 'utf8')) } catch {
  devKey = generateKeyPair()
  fs.writeFileSync(devKeyFile, JSON.stringify(devKey), { mode: 0o600 })
}
process.env.CG_LICENSE_PUBLIC_KEY ??= devKey.publicPem
const inAYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
const autoLicense = (restaurantId) => createLicense({ restaurantId, validUntil: inAYear }, devKey.privateBase64)

const backend = await startBackend({ cfg, log, autoLicense }).catch(e => {
  console.error(e.message)
  process.exit(1)
})

const { lanAddresses } = require('../runtime/net.cjs')
const here4100 = `http://localhost:${cfg.ports.gateway}`
const lan = lanAddresses().map(ip => `http://${ip}:${cfg.ports.gateway}`)

const nextBin = path.join(repo, 'node_modules', 'next', 'dist', 'bin', 'next')
const next = spawn(process.execPath, [nextBin, 'dev', '-p', String(cfg.ports.next), '-H', '127.0.0.1'], {
  cwd: repo,
  env: { ...process.env, ...nextEnv(cfg), ...(process.stdout.isTTY ? { FORCE_COLOR: '1' } : {}) },
  stdio: ['inherit', 'pipe', 'pipe'],
})

// Next prints its own internal address (127.0.0.1:4101). Opening that skips the
// gateway, so logins "fail" and no data loads — show the real addresses instead.
function relay(stream, out) {
  let buf = ''
  stream.on('data', chunk => {
    buf += chunk
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      const plain = line.replace(/\x1b\[[0-9;]*m/g, '') // eslint-disable-line no-control-regex
      if (/^\s*-\s*Local:/.test(plain))   { out.write(`- Local:         ${here4100}\n`); continue }
      if (/^\s*-\s*Network:/.test(plain)) { out.write(`- Network:       ${lan[0] ?? '(no network adapter)'}\n`); continue }
      out.write(line + '\n')
      if (/Ready in/.test(plain)) banner()
    }
  })
}
relay(next.stdout, process.stdout)
relay(next.stderr, process.stderr)

function banner() {
  log([
    '',
    '──────────────────────────────────────────────────────────────',
    ' ClickGroup POS (offline edition) is running',
    `   On this PC:  ${here4100}`,
    ...lan.map((u, i) => `   ${i ? '            ' : 'Tablets:   '}  ${u}`),
    '   Demo login:  first lines of offline/scripts/seed-demo.mjs',
    `   Your own restaurant: npm run import-restaurant -- --email <login email>`,
    ` Don't open port ${cfg.ports.next}: it is the internal Next.js server.`,
    '──────────────────────────────────────────────────────────────',
    '',
  ].join('\n'))
}

let stopping = false
async function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  log('[offline] stopping…')
  if (next.exitCode === null) {
    // `next dev` runs its server in a child process; kill the whole tree so
    // nothing keeps port 4101 open.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(next.pid), '/T', '/F'], { stdio: 'ignore' })
    else next.kill('SIGTERM')
  }
  await backend.stop()
  log('[offline] stopped')
  process.exit(code)
}

next.on('exit', code => { if (!stopping) shutdown(code ?? 0) })
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, () => shutdown(0))
