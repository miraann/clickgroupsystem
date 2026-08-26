import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildDailySalesReportBytes, DailySalesReportPayload } from '@/lib/escpos'
import { requireRestaurantId } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'print/daily-sales', 10)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  try {
    const body = await req.json() as { restaurantId: string } & Omit<DailySalesReportPayload, 'restaurantName' | 'currencySymbol' | 'paperWidth'>

    const { restaurantId } = body
    const { error: authError } = await requireRestaurantId(restaurantId)
    if (authError) return authError

    const { data: printer } = await supabase
      .from('printers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('purpose', 'receipt')
      .eq('active', true)
      .order('sort_order')
      .limit(1)
      .maybeSingle()

    if (!printer) {
      return NextResponse.json(
        { ok: false, error: 'No active Receipt / Cashier printer configured. Add one in Settings → Device → Printers.' },
        { status: 404 }
      )
    }

    const [{ data: rs }, { data: rest }] = await Promise.all([
      supabase.from('receipt_settings').select('shop_name, currency_symbol').eq('restaurant_id', restaurantId).maybeSingle(),
      supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
    ])

    const p = printer as { name: string; connection_type: string; ip_address?: string; port?: number; bt_address?: string; paper_width?: number }
    const paperWidth = p.paper_width ?? 80

    const payload: DailySalesReportPayload = {
      ...body,
      restaurantName: (rs?.shop_name as string) || (rest as { name?: string } | null)?.name || 'Restaurant',
      currencySymbol: (rs?.currency_symbol as string) ?? '',
      paperWidth,
    }

    const bytes = buildDailySalesReportBytes(payload)

    return NextResponse.json({
      ok:             true,
      bytes:          Buffer.from(bytes).toString('base64'),
      connectionType: p.connection_type,
      printerName:    p.name,
      ipAddress:      p.ip_address ?? null,
      port:           p.port       ?? 9100,
      btAddress:      p.bt_address ?? null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
