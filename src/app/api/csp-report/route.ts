import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

// Collects Content-Security-Policy violation reports (see next.config.ts) and
// logs one compact "[csp]" line per violation, so the Report-Only policy can
// be checked in the server logs before it is switched to enforcing.
// Accepts both the legacy `report-uri` body ({"csp-report": {...}}) and the
// Reporting API's array form ([{ type: "csp-violation", body: {...} }]).
export async function POST(req: NextRequest) {
  if (!(await rateLimit(req, 'csp-report', 30))) return new NextResponse(null, { status: 204 })

  try {
    const raw = await req.json() as unknown
    const reports = Array.isArray(raw)
      ? raw.map(r => (r as { body?: Record<string, unknown> }).body ?? {})
      : [((raw as { 'csp-report'?: Record<string, unknown> })['csp-report'] ?? {})]

    for (const r of reports.slice(0, 10)) {
      const directive = r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? '?'
      const blocked   = r['blocked-uri'] ?? r.blockedURL ?? '?'
      const page      = r['document-uri'] ?? r.documentURL ?? '?'
      console.warn('[csp]', String(directive).slice(0, 60), String(blocked).slice(0, 200), 'on', String(page).slice(0, 200))
    }
  } catch {
    // malformed report — ignore
  }
  return new NextResponse(null, { status: 204 })
}
