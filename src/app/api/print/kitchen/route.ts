import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildKitchenBytes } from '@/lib/escpos'
import { requireRestaurantId } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'print/kitchen', 30)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  try {
    const body = await req.json() as {
      restaurantId: string
      tableNum:     string
      orderNum?:    string | null
      timeStr:      string
      dateStr:      string
      items:        { name: string; qty: number; note?: string | null }[]
      note?:        string | null
    }

    const { error: authError } = await requireRestaurantId(body.restaurantId)
    if (authError) return authError

    const { data: printer } = await supabase
      .from('printers')
      .select('*')
      .eq('restaurant_id', body.restaurantId)
      .eq('purpose', 'kitchen')
      .eq('active', true)
      .order('sort_order')
      .limit(1)
      .maybeSingle()

    if (!printer) {
      return NextResponse.json(
        { ok: false, error: 'No active kitchen printer configured. Add one in Settings → Device → Printers.' },
        { status: 404 }
      )
    }

    const p = printer as {
      name:            string
      connection_type: string
      ip_address?:  string | null
      port?:        number | null
      bt_address?:  string | null
      usb_path?:    string | null
      paper_width?: number | null
    }

    const paperWidth = p.paper_width ?? 80

    const bytes = buildKitchenBytes({
      tableNum:  body.tableNum,
      orderNum:  body.orderNum ?? null,
      timeStr:   body.timeStr,
      dateStr:   body.dateStr,
      items:     body.items,
      paperWidth,
      note:      body.note ?? null,
    })

    return NextResponse.json({
      ok:             true,
      bytes:          Buffer.from(bytes).toString('base64'),
      connectionType: p.connection_type,
      printerName:    p.name,
      ipAddress:      p.ip_address  ?? null,
      port:           p.port        ?? 9100,
      btAddress:      p.bt_address  ?? null,
      usbPath:        p.usb_path    ?? null,
      paperWidth,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
