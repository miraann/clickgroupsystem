const store = new Map<string, { count: number; windowStart: number }>()

// Prune entries older than 2 min every 5 min to avoid unbounded memory growth
const pruneTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store) {
    if (now - val.windowStart > 120_000) store.delete(key)
  }
}, 300_000)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((pruneTimer as any).unref) (pruneTimer as any).unref()

/**
 * Returns true if the request is within the rate limit, false if it should be rejected.
 * Keyed by client IP + route key. Uses a fixed window per `windowMs`.
 */
export function rateLimit(
  req: { headers: { get(name: string): string | null } },
  key: string,
  limit: number,
  windowMs = 60_000
): boolean {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'

  const mapKey = `${ip}:${key}`
  const now = Date.now()
  const entry = store.get(mapKey)

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(mapKey, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}
