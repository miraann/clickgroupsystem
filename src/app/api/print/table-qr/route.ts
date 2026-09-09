import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escpos, cmd, enc, concat } from '@/lib/escpos/commands'
import { pickPrinter } from '@/lib/printerPurpose'
import QRCode from 'qrcode'
import { requireRestaurantId } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Prints a table's digital-menu QR to the Receipt / Cashier printer.
// Service role: tenant RLS (20260829_02) hides `printers` / `restaurants`
// from the anon key. Server-only, gated by rateLimit + requireRestaurantId.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ESC/POS GS v 0 raster bitmap
function gsv0(pixels: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const bytesPerRow = Math.ceil(widthPx / 8)
  const header = new Uint8Array([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    heightPx   & 0xff, (heightPx   >> 8) & 0xff,
  ])
  const out = new Uint8Array(header.length + pixels.length)
  out.set(header, 0)
  out.set(pixels, header.length)
  return out
}

// A large, centered QR — ~70% of the paper width so it scans easily off a ticket.
function makeQrBitmap(url: string, paperWidthMm: number): Uint8Array | null {
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
    const modules = qr.modules
    const size = modules.size
    const maxPx = Math.floor(paperWidthMm * 8 * 0.70)
    const scale = Math.max(3, Math.floor(maxPx / size))
    const W = size * scale, H = size * scale
    const bytesPerRow = Math.ceil(W / 8)
    const packed = new Uint8Array(bytesPerRow * H)
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (modules.get(row, col)) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = col * scale + sx
              const py = row * scale + sy
              packed[py * bytesPerRow + Math.floor(px / 8)] |= 0x80 >> (px % 8)
            }
          }
        }
      }
    }
    return gsv0(packed, W, H)
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'print/table-qr', 20)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  try {
    const body = await req.json() as {
      restaurantId: string
      tableNumber:  string
      tableName?:   string | null
      url:          string
    }
    const { restaurantId, tableNumber, url } = body
    const tableName = (body.tableName ?? '').trim()
    if (!restaurantId || !url) {
      return NextResponse.json({ ok: false, error: 'Missing restaurantId or url' }, { status: 400 })
    }

    const { error: authError } = await requireRestaurantId(restaurantId)
    if (authError) return authError

    const [{ data: printerRows }, { data: rest }] = await Promise.all([
      supabase.from('printers').select('*').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order'),
      supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
    ])

    const printer = pickPrinter(printerRows, ['receipt'])
    if (!printer) {
      return NextResponse.json(
        { ok: false, error: 'No active receipt printer configured. Add one in Settings → Device → Printers.' },
        { status: 404 }
      )
    }

    const p = printer as { name: string; connection_type: string; ip_address?: string; port?: number; bt_address?: string; paper_width?: number }
    const paperWidth = p.paper_width ?? 80
    const shopName = (rest as { name?: string } | null)?.name || 'Restaurant'

    const qrBitmap = makeQrBitmap(url, paperWidth)
    if (!qrBitmap) {
      return NextResponse.json({ ok: false, error: 'Could not render the QR code' }, { status: 500 })
    }

    const parts: Uint8Array[] = [
      escpos.init(),
      escpos.alignCenter(),
      escpos.boldOn(), escpos.doubleHeight(),
      enc(shopName + '\n'),
      escpos.normalSize(), escpos.boldOff(),
      escpos.feed(1),
      qrBitmap,
      cmd(0x0a),
      escpos.boldOn(), escpos.doubleSize(),
      enc((tableNumber ? `TABLE ${tableNumber}` : 'MENU') + '\n'),
      escpos.normalSize(),
    ]
    if (tableName) parts.push(escpos.doubleHeight(), enc(tableName + '\n'), escpos.normalSize())
    parts.push(
      escpos.boldOff(),
      enc('Scan the QR to view the menu & order\n'),
      escpos.feed(4),
      escpos.cut(),
    )
    const bytes = concat(...parts)

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
