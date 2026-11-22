// Embedded PostgreSQL: create the cluster on first run, start / stop it with
// pg_ctl (on Windows pg_ctl drops admin rights, which postgres.exe requires),
// and apply offline/schema/*.sql in order, once each.
const fs   = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

function run(cmd, args, { env, input, detach } = {}) {
  return new Promise((resolve, reject) => {
    // `pg_ctl start` leaves postgres running with whatever stdout/stderr it was
    // given, so pipes would never close; give it none and wait for its exit.
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: detach ? 'ignore' : 'pipe',
    })
    let stdout = '', stderr = ''
    child.stdout?.on('data', d => { stdout += d })
    child.stderr?.on('data', d => { stderr += d })
    child.on('error', reject)
    child.on(detach ? 'exit' : 'close', code => resolve({ code, stdout, stderr }))
    if (input != null) child.stdin.end(input)
  })
}

const exe = (cfg, name) => path.join(cfg.pgBin, process.platform === 'win32' ? `${name}.exe` : name)

// A Windows program that can't load prints nothing; its exit code is the only clue.
const WINDOWS_START_ERRORS = {
  0xC0000135: 'a file it needs is missing — usually the Microsoft Visual C++ Redistributable (x64): VCRUNTIME140.dll / MSVCP140.dll',
  0xC000007B: 'one of its files is the wrong type (32-bit instead of 64-bit)',
  0xC0000022: 'Windows (or an antivirus) blocked it',
}

/** What went wrong with a finished run(), for an error message. */
function describeFailure(r) {
  const out = (r.stderr || r.stdout).trim()
  if (out) return out
  const code = r.code == null ? null : r.code >>> 0
  const why = code != null && WINDOWS_START_ERRORS[code]
  return why
    ? `it could not start: ${why} (exit code 0x${code.toString(16).toUpperCase()})`
    : `no output (exit code ${code == null ? 'none' : `0x${code.toString(16).toUpperCase()}`})`
}

async function ensureCluster(cfg, log = console.log) {
  if (fs.existsSync(path.join(cfg.pgData, 'PG_VERSION'))) return false
  log('[postgres] creating database cluster…')
  const pwfile = path.join(cfg.dataDir, '.pwfile')
  fs.writeFileSync(pwfile, cfg.secrets.pgPassword, { mode: 0o600 })
  try {
    const r = await run(exe(cfg, 'initdb'), [
      '-D', cfg.pgData, '-U', 'postgres', `--pwfile=${pwfile}`,
      '--auth=scram-sha-256', '--encoding=UTF8',
      // Code-point ordering, full Unicode case mapping, no OS-locale dependence.
      '--locale-provider=builtin', '--builtin-locale=C.UTF-8', '--locale=C',
    ])
    if (r.code !== 0) throw new Error(`initdb failed: ${describeFailure(r)}`)
  } finally {
    fs.rmSync(pwfile, { force: true })
  }
  return true
}

async function isRunning(cfg) {
  const r = await run(exe(cfg, 'pg_ctl'), ['status', '-D', cfg.pgData])
  return r.code === 0
}

async function start(cfg, log = console.log) {
  if (await isRunning(cfg)) {
    log('[postgres] already running — reusing it')
    return
  }
  log(`[postgres] starting on 127.0.0.1:${cfg.ports.postgres}`)
  const r = await run(exe(cfg, 'pg_ctl'), [
    'start', '-D', cfg.pgData, '-w', '-t', '60',
    '-l', path.join(cfg.logDir, 'postgres.log'),
    '-o', `-p ${cfg.ports.postgres} -c listen_addresses=127.0.0.1`,
  ], { detach: true })
  if (r.code !== 0) {
    // detach: no output to read, but a pg_ctl that couldn't even load still has its exit code.
    const code = r.code == null ? null : r.code >>> 0
    const why = code != null && WINDOWS_START_ERRORS[code]
    throw new Error(why
      ? `postgres did not start: pg_ctl could not start: ${why}`
      : `postgres did not start (see ${path.join(cfg.logDir, 'postgres.log')})`)
  }
}

async function stop(cfg) {
  if (!(await isRunning(cfg))) return
  await run(exe(cfg, 'pg_ctl'), ['stop', '-D', cfg.pgData, '-m', 'fast', '-w', '-t', '30'])
}

function psql(cfg, args, input) {
  return run(exe(cfg, 'psql'), [
    '-h', '127.0.0.1', '-p', String(cfg.ports.postgres), '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-q', '-X', ...args,
  ], { env: { PGPASSWORD: cfg.secrets.pgPassword, PGCLIENTENCODING: 'UTF8' }, input })
}

/**
 * Apply every schema/*.sql file the database hasn't had yet. The list of
 * applied files lives in the database itself (cg_offline.migrations), so a
 * restored backup brings its own list and newer files are applied on top.
 */
async function migrate(cfg, log = console.log) {
  const q = async (sql) => {
    const r = await psql(cfg, ['-At', '-c', sql])
    if (r.code !== 0) throw new Error(r.stderr || r.stdout)
    return r.stdout.split(/\r?\n/).filter(Boolean)
  }
  await q(`create schema if not exists cg_offline;
           create table if not exists cg_offline.migrations (name text primary key, applied_at timestamptz not null default now())`)
  let applied = await q('select name from cg_offline.migrations')

  // Installs from before this table kept the list in <dataDir>/schema.json.
  const legacy = path.join(cfg.dataDir, 'schema.json')
  if (!applied.length && fs.existsSync(legacy)) {
    const names = JSON.parse(fs.readFileSync(legacy, 'utf8')).applied ?? []
    for (const n of names) await q(`insert into cg_offline.migrations (name) values ('${n.replace(/'/g, "''")}') on conflict do nothing`)
    fs.renameSync(legacy, `${legacy}.imported`)
    applied = names
  }

  const files = fs.readdirSync(cfg.schemaDir).filter(f => /^\d+_.+\.sql$/.test(f)).sort()
  for (const f of files) {
    if (applied.includes(f)) continue
    log(`[postgres] applying ${f}`)
    // One transaction per file: it is either fully in and recorded, or not at all.
    const r = await psql(cfg, ['-1', '-f', path.join(cfg.schemaDir, f),
      '-c', `insert into cg_offline.migrations (name) values ('${f.replace(/'/g, "''")}')`])
    if (r.code !== 0) throw new Error(`schema ${f} failed:\n${r.stderr || r.stdout}`)
  }

  // Every start, so a restored backup or a rotated secret still lines up.
  const pw = cfg.secrets.authenticatorPassword.replace(/'/g, "''")
  const r = await psql(cfg, [], `alter role authenticator with login password '${pw}';`)
  if (r.code !== 0) throw new Error(`could not set authenticator password:\n${r.stderr}`)
}

module.exports = { ensureCluster, start, stop, migrate, psql, isRunning }
