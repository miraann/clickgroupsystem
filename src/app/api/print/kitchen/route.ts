import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildKitchenBytes } from '@/lib/escpos'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
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
      connection_type: string
      ip_address?: string | null
      port?: number | null
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
      ipAddress:      p.ip_address ?? null,
      port:           p.port ?? 9100,
      paperWidth,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
