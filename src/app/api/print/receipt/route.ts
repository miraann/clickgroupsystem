import { NextRequest, NextResponse } from 'next/server'
import net from 'net'
import fs  from 'fs'
import { createClient } from '@supabase/supabase-js'
import { buildReceiptBytes, ReceiptPayload } from '@/lib/escpos'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function sendIp(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    socket.setTimeout(5000)
    socket.connect(port, ip, () => {
      socket.write(data, err => {
        socket.destroy()
        if (err) reject(err); else resolve()
      })
    })
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Printer timed out (5s) — check IP/port')) })
    socket.on('error',   (err: NodeJS.ErrnoException) => {
      const msg =
        err.code === 'ECONNREFUSED'  ? 'Printer refused connection — is it on?'
        : err.code === 'EHOSTUNREACH' ? 'Host unreachable — check network/IP'
        : err.code === 'ENETUNREACH'  ? 'Network unreachable'
        : err.message
      reject(new Error(msg))
    })
  })
}

function sendUsb(path: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, data, err => {
      if (err) reject(new Error(`USB write failed: ${err.message}`))
      else resolve()
    })
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      restaurantId: string
      tableNum:     string
      invoiceNum:   string
      orderNum:     string
      cashier:      string
      dateStr:      string
      timeStr:      string
      items:        { name: string; qty: number; price: number }[]
      subtotal:     number
      discount:     number
      surcharge:    number
      total:        number
      paymentMethod: string
      amountPaid:   number
      change:       number
      note?:        string | null
    }

    const { restaurantId } = body

    // Fetch active receipt printer (first by sort_order)
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
      return NextResponse.json({ ok: false, error: 'No active receipt printer configured. Add one in Settings → Device → Printers.' }, { status: 404 })
    }

    // Fetch receipt settings + restaurant name
    const [{ data: rs }, { data: rest }] = await Promise.all([
      supabase.from('receipt_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
      supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
    ])

    const payload: ReceiptPayload = {
      restaurantName: (rs as { shop_name?: string } | null)?.shop_name || (rest as { name?: string } | null)?.name || 'Restaurant',
      address:        (rs as { address?: string } | null)?.address        ?? null,
      phone:          (rs as { phone?: string }   | null)?.phone          ?? null,
      thankYouMsg:    (rs as { thank_you_msg?: string } | null)?.thank_you_msg   ?? 'Thank you for your visit!',
      currencySymbol: (rs as { currency_symbol?: string } | null)?.currency_symbol ?? '',
      paperWidth:     (printer as { paper_width?: number }).paper_width ?? 80,
      tableNum:       body.tableNum,
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
    }

    const bytes  = buildReceiptBytes(payload)
    const buffer = Buffer.from(bytes)

    const p = printer as { connection_type: string; ip_address?: string; port?: number; usb_path?: string; bt_address?: string }

    if (p.connection_type === 'ip') {
      if (!p.ip_address) return NextResponse.json({ ok: false, error: 'Printer IP address not set' }, { status: 400 })
      await sendIp(p.ip_address, p.port ?? 9100, buffer)
    } else if (p.connection_type === 'usb') {
      if (!p.usb_path) return NextResponse.json({ ok: false, error: 'USB device path not set' }, { status: 400 })
      await sendUsb(p.usb_path, buffer)
    } else {
      return NextResponse.json({ ok: false, error: 'Bluetooth printing requires a local print bridge. Use IP or USB instead.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
