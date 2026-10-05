// Backups of the restaurant's data: the whole database as one pg_dump file
// (custom format) plus a mirror of the uploaded pictures, kept in
// <dataDir>/backups (or a folder the owner picks), newest 14 kept.
const fs   = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { psql } = require('./postgres.cjs')

const KEEP = 14
const NAME = /^clickgroup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})(-[a-z-]+)?\.dump$/

const tool = (cfg, name) => path.join(cfg.pgBin, process.platform === 'win32' ? `${name}.exe` : name)

function pgTool(cfg, name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(tool(cfg, name), [
      '-h', '127.0.0.1', '-p', String(cfg.ports.postgres), '-U', 'postgres', ...args,
    ], { env: { ...process.env, PGPASSWORD: cfg.secrets.pgPassword }, windowsHide: true })
    let err = ''
    child.stderr.on('data', d => { err += d })
    child.stdout.resume()
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${name} failed: ${err.trim() || `exit ${code}`}`)))
  })
}

function backupDir(cfg) {
  return cfg.backupDir || path.join(cfg.dataDir, 'backups')
}

/** Backups in the folder, newest first. */
function listBackups(cfg) {
  const dir = backupDir(cfg)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(n => NAME.test(n))
    .map(n => {
      const st = fs.statSync(path.join(dir, n))
      return { name: n, file: path.join(dir, n), size: st.size, at: st.mtime.toISOString() }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

/** @param {{ tag?: string }} [o] tag ends up in the file name, e.g. "before-restore". */
async function backupNow(cfg, { tag } = {}) {
  const dir = backupDir(cfg)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const file  = path.join(dir, `clickgroup-${stamp}${tag ? `-${tag}` : ''}.dump`)
  const part  = `${file}.part`
  try {
    await pgTool(cfg, 'pg_dump', ['-d', 'postgres', '-Fc', '-Z', '6', '-f', part])
    fs.renameSync(part, file)
  } finally {
    fs.rmSync(part, { force: true })
  }
  // Pictures aren't in the database; keep a copy next to the dumps.
  if (fs.existsSync(cfg.storageDir)) {
    fs.cpSync(cfg.storageDir, path.join(dir, 'storage'), { recursive: true, force: true })
  }
  // Keep the newest few; the safety copy taken before a restore counts too.
  for (const old of listBackups(cfg).slice(KEEP)) fs.rmSync(old.file, { force: true })
  return { file, size: fs.statSync(file).size }
}

/**
 * Replace the database with a backup. Everything else that holds connections
 * (PostgREST, the gateway) must be stopped first; postgres must be running.
 * A safety backup of the current data is taken before anything is dropped.
 */
async function restore(cfg, file) {
  if (!fs.existsSync(file)) throw new Error(`backup not found: ${file}`)
  // Make sure it is a readable pg_dump archive before touching anything.
  await pgTool(cfg, 'pg_restore', ['--list', file]).catch(() => {
    throw new Error('That file is not a ClickGroup POS backup.')
  })
  const safety = await backupNow(cfg, { tag: 'before-restore' })
  await psql(cfg, ['-c', "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid()"])
  // One transaction: if anything fails, the current data stays as it was.
  await pgTool(cfg, 'pg_restore', ['-d', 'postgres', '--clean', '--if-exists', '--no-owner', '--single-transaction', file])
  const pictures = path.join(path.dirname(file), 'storage')
  if (fs.existsSync(pictures) && path.resolve(pictures) !== path.resolve(cfg.storageDir)) {
    fs.cpSync(pictures, cfg.storageDir, { recursive: true, force: false })
  }
  return { safety: safety.file }
}

module.exports = { backupNow, restore, listBackups, backupDir }
