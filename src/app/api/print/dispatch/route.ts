import { NextRequest, NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/api-auth'
import { rateLimit } from '@/lib/rate-limit'
import { serviceClient } from '@/lib/supabase/service'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import { printTcp, printWindowsPrinter } from '@/lib/printDispatch.server'

export const runtime = 'nodejs'

// Offline edition only: the Next.js server runs on the restaurant PC, so it can
// hand bytes from any device (a waiter tablet on plain http has no WebUSB, Web
// Bluetooth or raw sockets) to the PC's network and Windows printers.
// Only printers saved for the caller's restaurant are accepted, so this can't
// be used to open connections to arbitrary hosts.
export async function POST(req: NextRequest) {
  if (!IS_OFFLINE_EDITION) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  if (!(await rateLimit(req, 'print/dispatch', 120))) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  const { session, error } = await requireRestaurant()
  if (error) return error

  try {
    const body = await req.json() as {
      bytes?: string; connectionType?: string; printerName?: string | null
      ipAddress?: string | null; port?: number | null
    }
    const bytes = Buffer.from(body.bytes ?? '', 'base64')
    if (!bytes.length) return NextResponse.json({ ok: false, error: 'Nothing to print — empty payload' }, { status: 400 })

    const { data: printers } = await serviceClient()
      .from('printers')
      .select('name, connection_type, ip_address, port')
      .eq('restaurant_id', session.rid)
    const port = body.port ?? 9100

    if (body.connectionType === 'ip') {
      const known = (printers ?? []).some(p => p.connection_type === 'ip' && p.ip_address === body.ipAddress && (p.port ?? 9100) === port)
      if (!body.ipAddress || !known) return NextResponse.json({ ok: false, error: 'Printer is not configured' }, { status: 400 })
      await printTcp(bytes, body.ipAddress, port)
      return NextResponse.json({ ok: true })
    }

    // USB and Windows-paired Bluetooth printers are both Windows printers.
    if (body.connectionType === 'usb' || body.connectionType === 'serial' || body.connectionType === 'bluetooth') {
      const known = (printers ?? []).some(p => p.connection_type !== 'ip' && p.name === body.printerName)
      if (!body.printerName || !known) return NextResponse.json({ ok: false, error: 'Printer is not configured' }, { status: 400 })
      await printWindowsPrinter(bytes, body.printerName)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: `Unsupported printer connection: ${body.connectionType || 'none set'}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Print failed' }, { status: 502 })
  }
}
