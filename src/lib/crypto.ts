// Shared crypto helpers — Web Crypto only (Edge + Node compatible).
// Extracted so login routes, PIN verification, and the seller gate share one
// constant-time comparison and one password-hash implementation.

const enc = new TextEncoder()

/** Constant-time string comparison. Returns false on length mismatch. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: Uint8Array.from(salt), iterations: 100_000, hash: 'SHA-256' },
    key, 256,
  )
  return new Uint8Array(bits)
}

/** Produce a `pbkdf2:<saltHex>:<hashHex>` string for storage. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = Uint8Array.from(crypto.getRandomValues(new Uint8Array(16)))
  const hash = await pbkdf2(secret, salt)
  return `pbkdf2:${toHex(salt)}:${toHex(hash)}`
}

/**
 * Verify a secret against a stored value. Supports legacy plaintext (returns a
 * plain === comparison) so callers can migrate on first successful match.
 */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('pbkdf2:')) return timingSafeEqualStr(secret, stored)
  const parts = stored.split(':')
  if (parts.length !== 3) return false
  const expected = fromHex(parts[2])
  const hash = await pbkdf2(secret, fromHex(parts[1]))
  if (hash.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i]
  return diff === 0
}

/** True when a stored secret is still legacy plaintext and should be re-hashed. */
export function isLegacyPlaintext(stored: string | undefined | null): boolean {
  return !!stored && !stored.startsWith('pbkdf2:')
}
