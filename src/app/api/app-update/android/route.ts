import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Same-origin proxy for the Android in-app updater manifest.
 *
 * The APK's WebView is served from the Vercel origin, so it can't fetch the
 * GitHub release asset directly — `releases/latest/download/android-latest.json`
 * redirects to `release-assets.githubusercontent.com`, which sends no
 * `Access-Control-Allow-Origin` header, so the browser blocks it. Fetching it
 * here (server-side, no CORS) and echoing the JSON back fixes that.
 *
 * See docs/APP_UPDATES.md and src/lib/appUpdate.ts.
 */
const MANIFEST_URL =
  'https://github.com/miraann/clickgroupsystem/releases/latest/download/android-latest.json'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

export async function GET(req: Request) {
  if (!rateLimit(req, 'app-update/android', 30)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE })
  }

  try {
    const res = await fetch(MANIFEST_URL, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Release manifest returned ${res.status}` },
        { status: 502, headers: NO_STORE },
      )
    }
    const manifest = await res.json()
    return NextResponse.json(manifest, { headers: NO_STORE })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not reach the release manifest'
    return NextResponse.json({ error: msg }, { status: 504, headers: NO_STORE })
  }
}
