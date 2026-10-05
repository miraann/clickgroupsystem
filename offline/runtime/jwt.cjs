// HS256 JWTs — the same tokens Supabase's GoTrue issues and PostgREST verifies.
const crypto = require('node:crypto')

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

function sign(payload, secret) {
  const head = b64url({ alg: 'HS256', typ: 'JWT' })
  const body = b64url(payload)
  const sig  = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

/** Claims when the signature is valid and the token is unexpired, else null. */
function verify(token, secret) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest()
  const got = Buffer.from(parts[2], 'base64url')
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null
  let claims
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) } catch { return null }
  if (typeof claims.exp === 'number' && claims.exp < Math.floor(Date.now() / 1000)) return null
  return claims
}

// Baked into the offline web build as NEXT_PUBLIC_SUPABASE_ANON_KEY, so one
// build serves every install. It is signed with a public string, not any
// install's secret — the gateway swaps it for that install's real anon key, so
// it grants nothing beyond what `anon` already may do.
const PUBLIC_ANON_KEY = sign({ iss: 'clickgroup-offline', role: 'anon', ref: 'offline' }, 'clickgroup-offline-public-anon')

module.exports = { sign, verify, PUBLIC_ANON_KEY }
