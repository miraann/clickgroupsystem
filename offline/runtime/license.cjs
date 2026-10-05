// Offline-edition licence and renewal codes.
//
// A code says "restaurant X may use the offline edition until day D". It is
// signed with an Ed25519 private key that only the cloud (seller panel) has;
// the desktop app carries just the public key, so codes can't be made up or
// edited on the restaurant's PC, and can be checked with no internet.
//
// Layout: version (1 byte) | restaurant id (16) | valid-until day (uint16,
// days since 2024-01-01) | nonce (4) — then the 64-byte signature. Written in
// Crockford base32 (no I, L, O, U; case-insensitive) in groups of five, after
// "CG1-", so it survives being read out, typed, or pasted from a chat.
const crypto = require('node:crypto')
const fs     = require('node:fs')
const path   = require('node:path')

const VERSION = 1
const EPOCH   = Date.UTC(2024, 0, 1)
const DAY     = 86400000
const PREFIX  = 'CG1-'
// Signed together with the payload, so the key can't be tricked into signing
// something that also reads as a licence elsewhere.
const CONTEXT = Buffer.from('clickgroup-offline-license:')
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function base32(buf) {
  let bits = 0, value = 0, out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function unbase32(text) {
  const clean = text.toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/[^0-9A-Z]/g, '')
  let bits = 0, value = 0
  const out = []
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) throw new Error('bad character')
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

const dayOf  = (isoDate) => Math.round((Date.parse(`${isoDate}T00:00:00Z`) - EPOCH) / DAY)
const dateOf = (day) => new Date(EPOCH + day * DAY).toISOString().slice(0, 10)
const uuidBytes = (id) => Buffer.from(String(id).replace(/-/g, ''), 'hex')
const uuidText  = (b) => b.toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')

function payloadBytes({ restaurantId, validUntil, nonce }) {
  const rid = uuidBytes(restaurantId)
  if (rid.length !== 16) throw new Error('restaurantId must be a UUID')
  const day = dayOf(validUntil)
  if (!Number.isInteger(day) || day < 0 || day > 0xffff) throw new Error('validUntil must be a YYYY-MM-DD date after 2024')
  const b = Buffer.alloc(23)
  b[0] = VERSION
  rid.copy(b, 1)
  b.writeUInt16BE(day, 17)
  nonce.copy(b, 19)
  return b
}

/** Make a code. privateKey: a KeyObject, PEM, or base64 of the PKCS#8 DER. */
function createLicense({ restaurantId, validUntil }, privateKey) {
  const payload = payloadBytes({ restaurantId, validUntil, nonce: crypto.randomBytes(4) })
  const sig = crypto.sign(null, Buffer.concat([CONTEXT, payload]), toPrivateKey(privateKey))
  return PREFIX + base32(Buffer.concat([payload, sig])).match(/.{1,5}/g).join('-')
}

/**
 * Check a code. Returns { ok: true, restaurantId, validUntil, nonce } or
 * { ok: false, reason } — `reason` is safe to show the user.
 */
function verifyLicense(code, publicKey) {
  if (!publicKey) return { ok: false, reason: 'This copy of the app has no licence key — contact your seller.' }
  let raw
  try { raw = unbase32(String(code || '').trim().replace(/^CG[1IL]-?/i, '')) } catch { raw = null }
  if (!raw || raw.length !== 87 || raw[0] !== VERSION) return { ok: false, reason: 'That code is not complete or not a ClickGroup licence code.' }
  const payload = raw.subarray(0, 23)
  const good = crypto.verify(null, Buffer.concat([CONTEXT, payload]), toPublicKey(publicKey), raw.subarray(23))
  if (!good) return { ok: false, reason: 'That code is not valid — check it was copied exactly.' }
  return {
    ok: true,
    restaurantId: uuidText(payload.subarray(1, 17)),
    validUntil:   dateOf(payload.readUInt16BE(17)),
    nonce:        payload.subarray(19, 23).toString('hex'),
  }
}

function toPrivateKey(k) {
  if (k instanceof crypto.KeyObject) return k
  const s = String(k).trim()
  return s.startsWith('-----')
    ? crypto.createPrivateKey(s)
    : crypto.createPrivateKey({ key: Buffer.from(s, 'base64'), format: 'der', type: 'pkcs8' })
}

function toPublicKey(k) {
  if (k instanceof crypto.KeyObject) return k
  const s = String(k).trim()
  return s.startsWith('-----')
    ? crypto.createPublicKey(s)
    : crypto.createPublicKey({ key: Buffer.from(s, 'base64'), format: 'der', type: 'spki' })
}

/**
 * The public key this copy of the app trusts: CG_LICENSE_PUBLIC_KEY (tests),
 * else license-public.pem shipped next to this file (offline/scripts/license-keygen.mjs).
 */
function trustedPublicKey() {
  if (process.env.CG_LICENSE_PUBLIC_KEY) return process.env.CG_LICENSE_PUBLIC_KEY
  try { return fs.readFileSync(path.join(__dirname, 'license-public.pem'), 'utf8') } catch { return null }
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    publicPem:     publicKey.export({ type: 'spki', format: 'pem' }),
    privateBase64: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  }
}

module.exports = { createLicense, verifyLicense, trustedPublicKey, generateKeyPair }
