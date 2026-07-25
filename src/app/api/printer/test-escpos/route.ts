import { NextRequest, NextResponse } from 'next/server'
import { escpos, enc, divBytes, cols, concat } from '@/lib/escpos/commands'
import { requireRestaurantId } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'printer/test-escpos', 20)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json() as { restaurantId: string; name: string; paper_width?: number }
  const { error: authError } = await requireRestaurantId(body.restaurantId)
  if (authError) return authError

  const paperWidth = body.paper_width ?? 80
  const W   = cols(paperWidth)
  const div = divBytes(W)
  const now = new Date().toLocaleString('en-GB')

  const bytes = concat(
    escpos.init(),
    escpos.alignCenter(),
    escpos.boldOn(), escpos.doubleSize(),
    enc('TEST PRINT\n'),
    escpos.normalSize(), escpos.boldOff(),
    div,
    escpos.alignLeft(),
    enc(`Printer : ${body.name}\n`),
    enc(`Width   : ${paperWidth} mm\n`),
    enc(`Time    : ${now}\n`),
    div,
    escpos.alignCenter(),
    escpos.boldOn(),
    enc('** PRINTER READY **\n'),
    escpos.boldOff(),
    escpos.feed(4),
    escpos.cut(),
  )

  return NextResponse.json({
    ok:    true,
    bytes: Buffer.from(bytes).toString('base64'),
  })
}
