// Download the two native programs the offline backend runs, so the ~450 MB
// never has to live in git:
//   offline/vendor/pgsql/      PostgreSQL 17.6 (EDB Windows x64 binaries: bin, lib, share)
//   offline/vendor/postgrest/  PostgREST 14.18 (postgrest.exe)
//
//   cd offline && npm run fetch-vendor        (--force re-extracts, --dir <path> picks another folder)
//
// Each zip is checked against a pinned SHA-256 before it is unpacked.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const here   = path.dirname(fileURLToPath(import.meta.url))
const dirArg = process.argv.indexOf('--dir')
const vendor = dirArg > 0 ? path.resolve(process.argv[dirArg + 1]) : path.resolve(here, '..', 'vendor')
const force  = process.argv.includes('--force')

const PACKAGES = [
  {
    name:   'PostgreSQL 17.6',
    url:    'https://get.enterprisedb.com/postgresql/postgresql-17.6-2-windows-x64-binaries.zip',
    zip:    'pgsql-17.6-2.zip',
    sha256: '46128e93245cab5fd18beb13e10a43ad8b31acf9bef1790a811bd59f1b721a58',
    // The zip also carries pgAdmin, StackBuilder, docs and headers (~200 MB) we don't run.
    entries: ['pgsql/bin', 'pgsql/lib', 'pgsql/share'],
    exclude: ['pgsql/lib/pgxs', 'pgsql/lib/pkgconfig', 'pgsql/share/doc', 'pgsql/share/locale'],
    into:    vendor,
    check:   path.join(vendor, 'pgsql', 'bin', 'postgres.exe'),
  },
  {
    name:   'PostgREST 14.18',
    url:    'https://github.com/PostgREST/postgrest/releases/download/v14.18/postgrest-v14.18-windows-x86-64.zip',
    zip:    'postgrest.zip',
    sha256: 'f24ca175b34d1ec0f3fc6d4c778f279f70577f6b3784b19aaa321e22bc3959b9',
    entries: ['postgrest.exe'],
    into:    path.join(vendor, 'postgrest'),
    check:   path.join(vendor, 'postgrest', 'postgrest.exe'),
  },
]

async function sha256(file) {
  const h = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(file), h)
  return h.digest('hex')
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  let got = 0, shown = -1
  const tmp = `${dest}.part`
  const counter = new TransformStream({
    transform(chunk, ctl) {
      got += chunk.length
      const pct = total ? Math.floor((got / total) * 100) : -1
      if (pct !== shown && pct % 10 === 0) { shown = pct; process.stdout.write(`  ${pct}%`) }
      ctl.enqueue(chunk)
    },
  })
  await pipeline(Readable.fromWeb(res.body.pipeThrough(counter)), fs.createWriteStream(tmp))
  process.stdout.write('\n')
  fs.renameSync(tmp, dest)
}

// Windows 10+ ships bsdtar as tar.exe, which reads zip files and can extract
// just the listed folders. (Git Bash's GNU tar can't, hence the full path.)
function unzip(zip, entries, exclude = [], into) {
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar'
  fs.mkdirSync(into, { recursive: true })
  const r = spawnSync(tar, ['-xf', zip, '-C', into, ...exclude.flatMap(e => ['--exclude', e]), ...entries], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`extracting ${path.basename(zip)} failed`)
}

fs.mkdirSync(vendor, { recursive: true })
for (const p of PACKAGES) {
  if (fs.existsSync(p.check) && !force) { console.log(`${p.name}: already in place`); continue }
  const zip = path.join(vendor, p.zip)
  if (!fs.existsSync(zip) || (await sha256(zip)) !== p.sha256) {
    console.log(`${p.name}: downloading ${p.url}`)
    await download(p.url, zip)
  }
  const sum = await sha256(zip)
  if (sum !== p.sha256) {
    fs.rmSync(zip, { force: true })
    throw new Error(`${p.name}: checksum mismatch (got ${sum}) — download removed, try again`)
  }
  console.log(`${p.name}: extracting`)
  unzip(zip, p.entries, p.exclude, p.into)
  if (!fs.existsSync(p.check)) throw new Error(`${p.name}: ${p.check} missing after extract`)
  console.log(`${p.name}: ready`)
}
