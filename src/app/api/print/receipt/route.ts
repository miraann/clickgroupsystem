import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildReceiptBytes, ReceiptPayload } from '@/lib/escpos'
import sharp from 'sharp'
import QRCode from 'qrcode'
import { requireRestaurantAccess } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

async function makeLogoBitmap(logoUrl: string, paperWidthMm: number): Promise<Uint8Array | null> {
  try {
    const dotsPerMm = 8
    const maxWidthPx = Math.floor(paperWidthMm * dotsPerMm * 0.90) // 90% of paper
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const { data, info } = await sharp(buf)
      .resize(maxWidthPx, null, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .threshold(128)
      .raw()
      .toBuffer({ resolveWithObject: true })
    const W = info.width, H = info.height
    const bytesPerRow = Math.ceil(W / 8)
    const packed = new Uint8Array(bytesPerRow * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[y * W + x] < 128) {
          packed[y * bytesPerRow + Math.floor(x / 8)] |= 0x80 >> (x % 8)
        }
      }
    }
    return gsv0(packed, W, H)
  } catch {
    return null
  }
}

async function makeQrBitmap(url: string, paperWidthMm: number): Promise<Uint8Array | null> {
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
    const modules = qr.modules
    const size = modules.size
    const maxPx = Math.floor(paperWidthMm * 8 * 0.40)
    const scale = Math.max(2, Math.floor(maxPx / size))
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
  if (!rateLimit(req, 'print/receipt', 20)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  try {
    const body = await req.json() as {
      restaurantId:  string
      tableNum:      string
      guests?:       number
      invoiceNum:    string
      orderNum:      string
      cashier:       string
      dateStr:       string
      timeStr:       string
      items:         { name: string; qty: number; price: number }[]
      subtotal:      number
      discount:      number
      surcharge:     number
      total:         number
      paymentMethod: string
      amountPaid:    number
      change:        number
      note?:         string | null
      mode?:         'receipt' | 'payment'
      qrUrl?:        string | null
    }

    const { restaurantId } = body

    const { error: authError } = await requireRestaurantAccess(restaurantId)
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
        { ok: false, error: 'No active receipt printer configured. Add one in Settings → Device → Printers.' },
        { status: 404 }
      )
    }

    const [{ data: rs }, { data: rest }] = await Promise.all([
      supabase.from('receipt_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
      supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
    ])

    const rsAny = rs as Record<string, unknown> | null
    const p = printer as { connection_type: string; ip_address?: string; port?: number; paper_width?: number }
    const paperWidth = p.paper_width ?? 80
    const logoUrl = (rsAny?.logo_url as string | null) ?? null
    const qrUrl   = body.mode !== 'payment' ? ((rsAny?.qr_url as string | null) ?? null) : null

    const [logoBitmap, qrBitmap] = await Promise.all([
      logoUrl ? makeLogoBitmap(logoUrl, paperWidth) : Promise.resolve(null),
      qrUrl   ? makeQrBitmap(qrUrl, paperWidth)     : Promise.resolve(null),
    ])

    const payload: ReceiptPayload = {
      restaurantName: (rsAny?.shop_name as string) || (rest as { name?: string } | null)?.name || 'Restaurant',
      address:        (rsAny?.address        as string | null) ?? null,
      phone:          (rsAny?.phone          as string | null) ?? null,
      thankYouMsg:    (rsAny?.thank_you_msg  as string)       ?? 'Thank you for your visit!',
      currencySymbol: (rsAny?.currency_symbol as string)      ?? '',
      poweredBy:      (rsAny?.phone          as string | null) ?? null,
      paperWidth,
      tableNum:       body.tableNum,
      guests:         body.guests,
      invoiceNum:     body.invoiceNum,
      orderNum:       body.orderNum,
      cashier:        body.cashier,
      dateStr:        body.dateStr,
      timeStr:        body.timeStr,
      items:          body.items,
      subtotal:       body.subtotal,
      discount:       body.discount,
      surcharge:      body.surcharge,
      total:          body.total,
      paymentMethod:  body.paymentMethod,
      amountPaid:     body.amountPaid,
      change:         body.change,
      note:           body.note,
      mode:           body.mode ?? 'payment',
      logoBitmap,
      qrBitmap,
    }

    const bytes = buildReceiptBytes(payload)

    // Return bytes to client — printing happens browser-side via WebUSB
    return NextResponse.json({
      ok:             true,
      bytes:          Buffer.from(bytes).toString('base64'),
      connectionType: p.connection_type,
      ipAddress:      p.ip_address ?? null,
      port:           p.port ?? 9100,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
