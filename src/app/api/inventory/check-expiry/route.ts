import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/supabase/service'
import { timingSafeEqualStr } from '@/lib/crypto'

export const runtime = 'nodejs'

/**
 * Daily inventory expiry sweep. Invokes the `check_inventory_expiry` Postgres
 * function, which inserts `expiring_soon` / `expired` rows into
 * `inventory_notifications` for every restaurant (dedup handled in SQL).
 *
 * Wire this up to any external scheduler that can hit an HTTPS URL on a cron:
 *  - Vercel Cron (vercel.json `crons`)
 *  - Supabase scheduled Edge Function / pg_cron calling this URL
 *  - A GitHub Actions scheduled workflow
 *
 * Protect it with CRON_SECRET so it can't be triggered by anyone who finds the URL.
 */
export async function POST(req: NextRequest) {
  // Accept either an explicit x-cron-secret header or the
  // `Authorization: Bearer <CRON_SECRET>` that Vercel Cron sends automatically.
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const secret = req.headers.get('x-cron-secret') ?? bearer
  if (!process.env.CRON_SECRET || !secret || !timingSafeEqualStr(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // The sweep covers every restaurant, so it runs as the service role (the
  // function is not executable by anon / authenticated). CRON_SECRET above is
  // the only gate.
  const { error } = await serviceClient().rpc('check_inventory_expiry', { p_warn_days: 3 })
  if (error) {
    console.error('[check-expiry]', error)
    return NextResponse.json({ ok: false, error: 'Sweep failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() })
}
