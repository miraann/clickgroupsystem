// Create the key pair that signs offline licence / renewal codes. Run once:
//
//   cd offline && npm run license-keygen
//
// - The PUBLIC key goes to offline/runtime/license-public.pem. Commit it: every
//   desktop app build carries it and accepts only codes signed by its partner.
// - The PRIVATE key goes to offline/.data/license-private.txt (git-ignored).
//   Put that one line into Vercel → Project → Settings → Environment Variables
//   as OFFLINE_LICENSE_PRIVATE_KEY (Production), redeploy, keep a copy in your
//   password manager, then delete the file. Anyone with it can make licences.
//
// It won't replace an existing public key: codes already issued would stop
// working on every installed PC. (--out <dir> writes both files elsewhere, for tests.)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here    = path.dirname(fileURLToPath(import.meta.url))
const offline = path.resolve(here, '..')
const { generateKeyPair } = require('../runtime/license.cjs')

const i   = process.argv.indexOf('--out')
const out = i > 0 ? path.resolve(process.argv[i + 1]) : null
const pubFile  = out ? path.join(out, 'license-public.pem')  : path.join(offline, 'runtime', 'license-public.pem')
const privFile = out ? path.join(out, 'license-private.txt') : path.join(offline, '.data', 'license-private.txt')

if (fs.existsSync(pubFile)) {
  console.error(`${path.relative(process.cwd(), pubFile)} already exists — keeping it. Delete it first only if no licence was ever issued with it.`)
  process.exit(1)
}
const { publicPem, privateBase64 } = generateKeyPair()
fs.mkdirSync(path.dirname(pubFile), { recursive: true })
fs.mkdirSync(path.dirname(privFile), { recursive: true })
fs.writeFileSync(pubFile, publicPem)
fs.writeFileSync(privFile, privateBase64 + '\n', { mode: 0o600 })
console.log(`Public key:  ${path.relative(process.cwd(), pubFile)}  (commit this)`)
console.log(`Private key: ${path.relative(process.cwd(), privFile)}  (set as OFFLINE_LICENSE_PRIVATE_KEY in Vercel, then keep it safe and delete the file)`)
