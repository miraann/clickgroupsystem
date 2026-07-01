// HMAC-signed session tokens — Web Crypto API only (Edge + Node.js compatible)

const enc = new TextEncoder()
const dec = new TextDecoder()

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET env var is not set')
  return s
}

function toBase64Url(buf: Uint8Array): string {
  let str = ''
  for (let i = 0; i < buf.length; i++) str += String.fromCharCode(buf[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const pad = str.length % 4 === 0 ? 0 : 4 - (str.length % 4)
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function sign(payloadB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64)))
  return `${payloadB64}.${toBase64Url(sig)}`
}

async function unsign(token: string): Promise<string | null> {
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const payloadB64 = token.slice(0, dot)
  const sigB64     = token.slice(dot + 1)
  try {
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(getSecret()),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    )
    const ok = await crypto.subtle.verify('HMAC', key, fromBase64Url(sigB64), enc.encode(payloadB64))
    if (!ok) return null
    return dec.decode(fromBase64Url(payloadB64))
  } catch {
    return null
  }
}

// ── Restaurant session ────────────────────────────────────────────

export const RESTAURANT_COOKIE = '__pos_restaurant'

export type RestaurantRole = 'owner' | 'staff'

export interface RestaurantSession {
  rid:  string          // restaurant_id
  role: RestaurantRole
  exp:  number          // unix seconds
}

export async function createRestaurantToken(
  rid: string,
  role: RestaurantRole,
  ttlMs = 8 * 3600 * 1000,
): Promise<string> {
  const payload: RestaurantSession = { rid, role, exp: Math.floor((Date.now() + ttlMs) / 1000) }
  return sign(toBase64Url(enc.encode(JSON.stringify(payload))))
}

export async function verifyRestaurantToken(token: string): Promise<RestaurantSession | null> {
  try {
    const raw = await unsign(token)
    if (!raw) return null
    const session = JSON.parse(raw) as RestaurantSession
    if (Date.now() / 1000 > session.exp) return null
    return session
  } catch {
    return null
  }
}

// ── Pending (pre-PIN) restaurant session ────────────────────────────

export const RESTAURANT_PENDING_COOKIE = '__pos_restaurant_pending'

interface PendingSession { rid: string; exp: number }

export async function createPendingToken(rid: string, ttlMs = 5 * 60 * 1000): Promise<string> {
  const payload: PendingSession = { rid, exp: Math.floor((Date.now() + ttlMs) / 1000) }
  return sign(toBase64Url(enc.encode(JSON.stringify(payload))))
}

export async function verifyPendingToken(token: string): Promise<string | null> {
  try {
    const raw = await unsign(token)
    if (!raw) return null
    const s = JSON.parse(raw) as PendingSession
    if (Date.now() / 1000 > s.exp) return null
    return s.rid
  } catch {
    return null
  }
}

// ── Seller session ────────────────────────────────────────────────

export const SELLER_COOKIE = '__pos_seller'

interface SellerSession { role: 'seller'; exp: number }

export async function createSellerToken(ttlMs = 2 * 3600 * 1000): Promise<string> {
  const payload: SellerSession = { role: 'seller', exp: Math.floor((Date.now() + ttlMs) / 1000) }
  return sign(toBase64Url(enc.encode(JSON.stringify(payload))))
}

export async function verifySellerToken(token: string): Promise<boolean> {
  try {
    const raw = await unsign(token)
    if (!raw) return false
    const s = JSON.parse(raw) as SellerSession
    return s.role === 'seller' && Date.now() / 1000 < s.exp
  } catch {
    return false
  }
}
