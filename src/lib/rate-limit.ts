// Fixed-window rate limiter.
//
// On Vercel every serverless instance has its own memory, so an in-process
// counter lets an attacker spread attempts across instances and never trip the
// limit. When Upstash Redis is configured (UPSTASH_REDIS_REST_URL/_TOKEN, or
// the KV_REST_API_URL/_TOKEN names the Vercel marketplace integration sets)
// the counter lives there and is shared by all instances. Without those env
// vars — local dev, self-hosted — it falls back to the in-memory map.

const store = new Map<string, { count: number; windowStart: number; windowMs: number }>()

// Prune entries whose window has passed every 5 min to avoid unbounded memory growth
const pruneTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store) {
    if (now - val.windowStart > val.windowMs) store.delete(key)
  }
}, 300_000)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((pruneTimer as any).unref) (pruneTimer as any).unref()

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL   ?? process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

function memoryHit(mapKey: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(mapKey)
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(mapKey, { count: 1, windowStart: now, windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

/** INCR + PEXPIRE in one round-trip. Returns the new count, or null on any failure. */
async function redisIncr(key: string, windowMs: number): Promise<number | null> {
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['PEXPIRE', key, String(windowMs), 'NX']]),
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const out = await res.json() as { result?: unknown; error?: string }[]
    const n = out?.[0]?.result
    return typeof n === 'number' ? n : null
  } catch {
    return null
  }
}

/**
 * Resolves true if the request is within the rate limit, false if it should be rejected.
 * Keyed by client IP + route key. Uses a fixed window per `windowMs`.
 */
export async function rateLimit(
  req: { headers: { get(name: string): string | null } },
  key: string,
  limit: number,
  windowMs = 60_000
): Promise<boolean> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'

  const mapKey = `${ip}:${key}`

  if (REDIS_URL && REDIS_TOKEN) {
    const window = Math.floor(Date.now() / windowMs)
    const count = await redisIncr(`rl:${mapKey}:${window}`, windowMs)
    // Redis down / slow → degrade to the per-instance limiter rather than
    // either blocking every login or letting everything through.
    if (count !== null) return count <= limit
  }

  return memoryHit(mapKey, limit, windowMs)
}

// ── Per-account failure throttle ────────────────────────────────────────────
// rateLimit() is per IP, so a guesser rotating IPs is never slowed down. These
// count *failed* attempts against one account (e.g. wrong PINs for one
// restaurant) regardless of IP. Check tooManyFailures() before verifying and
// call recordFailure() only when verification fails, so normal logins never
// use up the budget.

async function redisGet(key: string): Promise<number | null> {
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const out = await res.json() as { result?: string | null }
    return out.result == null ? 0 : Number(out.result)
  } catch {
    return null
  }
}

function failureKey(key: string, windowMs: number): string {
  return `rlf:${key}:${Math.floor(Date.now() / windowMs)}`
}

export async function tooManyFailures(key: string, limit: number, windowMs: number): Promise<boolean> {
  const k = failureKey(key, windowMs)
  if (REDIS_URL && REDIS_TOKEN) {
    const n = await redisGet(k)
    if (n !== null) return n >= limit
  }
  const entry = store.get(k)
  return !!entry && entry.count >= limit
}

export async function recordFailure(key: string, windowMs: number): Promise<void> {
  const k = failureKey(key, windowMs)
  if (REDIS_URL && REDIS_TOKEN && (await redisIncr(k, windowMs)) !== null) return
  const entry = store.get(k)
  if (entry) entry.count++
  else store.set(k, { count: 1, windowStart: Date.now(), windowMs })
}
