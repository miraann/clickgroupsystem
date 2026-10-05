// PostgREST — the same REST engine Supabase runs behind /rest/v1, so every
// `supabase.from(...)` / `.rpc(...)` call in the app works unchanged.
const fs   = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn, execFileSync } = require('node:child_process')

function writeConf(cfg) {
  const conf = [
    `db-uri = "postgres://authenticator:${cfg.secrets.authenticatorPassword}@127.0.0.1:${cfg.ports.postgres}/postgres"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    'db-extra-search-path = "public, extensions"',
    'db-pool = 10',
    `jwt-secret = "${cfg.secrets.jwtSecret}"`,
    'server-host = "127.0.0.1"',
    `server-port = ${cfg.ports.postgrest}`,
    'log-level = "error"',
  ].join('\n')
  const file = path.join(cfg.dataDir, 'postgrest.conf')
  fs.writeFileSync(file, conf + '\n', { mode: 0o600 })
  return file
}

function ping(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, res => {
      res.resume()
      resolve(res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

// A PostgREST left running by a crashed app would hold the port (and keep
// serving with old settings). Its PID is in a file; stop it only if that PID
// still belongs to postgrest, since Windows reuses PIDs.
function stopLeftover(cfg, log) {
  const pidFile = path.join(cfg.dataDir, 'postgrest.pid')
  let pid = 0
  try { pid = Number(fs.readFileSync(pidFile, 'utf8')) } catch { return }
  let name = ''
  try {
    name = process.platform === 'win32'
      ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).split(',')[0].replace(/"/g, '')
      : fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
  } catch { /* gone */ }
  fs.rmSync(pidFile, { force: true })
  if (pid && /^postgrest(\.exe)?$/i.test(name)) {
    log(`[postgrest] stopping a leftover instance (pid ${pid})`)
    try { process.kill(pid) } catch { /* already gone */ }
    return true
  }
  return false
}

async function start(cfg, log = console.log) {
  // Give Windows a moment to release the port of a stopped leftover.
  if (stopLeftover(cfg, log)) await new Promise(r => setTimeout(r, 1000))
  const conf = writeConf(cfg)
  const out  = fs.openSync(path.join(cfg.logDir, 'postgrest.log'), 'a')
  log(`[postgrest] starting on 127.0.0.1:${cfg.ports.postgrest}`)
  const child = spawn(cfg.postgrestExe, [conf], {
    // postgrest.exe links libpq.dll, which ships with the PostgreSQL binaries.
    env: { ...process.env, PATH: `${cfg.pgBin}${path.delimiter}${process.env.PATH}` },
    stdio: ['ignore', out, out],
    windowsHide: true,
  })
  const pidFile = path.join(cfg.dataDir, 'postgrest.pid')
  fs.writeFileSync(pidFile, String(child.pid))
  let exited = null
  child.on('exit', code => { exited = code; fs.rmSync(pidFile, { force: true }) })

  for (let i = 0; i < 60; i++) {
    if (await ping(cfg.ports.postgrest)) return child
    if (exited !== null) break
    await new Promise(r => setTimeout(r, 250))
  }
  child.kill()
  throw new Error(`postgrest did not come up (see ${path.join(cfg.logDir, 'postgrest.log')})`)
}

module.exports = { start }
