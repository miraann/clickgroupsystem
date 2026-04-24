import { NextRequest, NextResponse } from 'next/server'
import net from 'net'
import { createWriteStream } from 'fs'
import { writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { tmpdir, platform } from 'os'
import { createClient } from '@supabase/supabase-js'
import { buildReceiptBytes, ReceiptPayload } from '@/lib/escpos'
import sharp from 'sharp'
import QRCode from 'qrcode'

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

// COM ports and Linux /dev/* — direct stream write
function writeStream(devicePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = createWriteStream(devicePath, { flags: 'w' })
    s.on('error', reject)
    s.end(data, () => s.close(err => (err ? reject(err) : resolve())))
  })
}

// Windows USB spooler ports (USB001) or named printers — winspool.drv P/Invoke
function printWindows(portOrName: string, data: Buffer): void {
  const tmp = join(tmpdir(), `pos_${Date.now()}.bin`)
  writeFileSync(tmp, data)
  try {
    const tmpPs  = tmp.replace(/\\/g, '\\\\').replace(/'/g, "''")
    const portPs = portOrName.replace(/'/g, "''")
    const resolvePs = /^USB\d+$/i.test(portOrName)
      ? `(Get-WmiObject Win32_Printer | Where-Object {$_.PortName -eq '${portPs}'} | Select-Object -First 1).Name`
      : `'${portPs}'`
    const ps = `
$pn=${resolvePs}
if(!$pn){Write-Error 'Printer not found';exit 1}
$bytes=[IO.File]::ReadAllBytes('${tmpPs}')
if(-not ([Management.Automation.PSTypeName]'WP3').Type){Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class WP3{
  [DllImport("winspool.drv",EntryPoint="OpenPrinterA")]public static extern bool Open(string n,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",EntryPoint="ClosePrinter")]public static extern bool Close(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="StartDocPrinterA")]public static extern int StartDoc(IntPtr h,int l,IntPtr di);
  [DllImport("winspool.drv",EntryPoint="EndDocPrinter")]public static extern bool EndDoc(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="StartPagePrinter")]public static extern bool StartPage(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="EndPagePrinter")]public static extern bool EndPage(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="WritePrinter")]public static extern bool Write(IntPtr h,IntPtr p,int c,out int w);
}
'@}
$h=[IntPtr]::Zero;[WP3]::Open($pn,[ref]$h,[IntPtr]::Zero)|Out-Null
$m=[Runtime.InteropServices.Marshal]
$di=$m::AllocHGlobal(3*[IntPtr]::Size)
$dn=$m::StringToHGlobalAnsi("POS")
$dt=$m::StringToHGlobalAnsi("RAW")
$m::WriteIntPtr($di,0,$dn);$m::WriteIntPtr($di,[IntPtr]::Size,[IntPtr]::Zero);$m::WriteIntPtr($di,2*[IntPtr]::Size,$dt)
[WP3]::StartDoc($h,1,$di)|Out-Null;[WP3]::StartPage($h)|Out-Null
$pb=$m::AllocHGlobal($bytes.Length);$m::Copy($bytes,0,$pb,$bytes.Length)
$w=0;[WP3]::Write($h,$pb,$bytes.Length,[ref]$w)|Out-Null
$m::FreeHGlobal($pb);$m::FreeHGlobal($di);$m::FreeHGlobal($dn);$m::FreeHGlobal($dt)
[WP3]::EndPage($h)|Out-Null;[WP3]::EndDoc($h)|Out-Null;[WP3]::Close($h)|Out-Null
`.trim()
    const r = spawnSync('powershell.exe',
      ['-NonInteractive', '-NoProfile', '-Command', ps],
      { timeout: 15000, windowsHide: true }
    )
    const stderr = r.stderr?.toString() ?? ''
    const stdout = r.stdout?.toString() ?? ''
    if (r.status !== 0 || stderr.includes('Error')) {
      throw new Error(stderr || stdout || 'PowerShell print failed')
    }
  } finally {
    try { unlinkSync(tmp) } catch {}
  }
}

// ESC/POS GS v 0 raster bitmap — 1-bit, row-padded to byte boundary
function gsv0(pixels: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const bytesPerRow = Math.ceil(widthPx / 8)
  const header = new Uint8Array([
    0x1d, 0x76, 0x30, 0x00,           // GS v 0, mode 0
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    heightPx   & 0xff, (heightPx   >> 8) & 0xff,
  ])
  // pixels is already 1-bit packed row data (1=black)
  const out = new Uint8Array(header.length + pixels.length)
  out.set(header, 0)
  out.set(pixels, header.length)
  return out
}

async function makeLogoBitmap(logoUrl: string, paperWidthMm: number): Promise<Uint8Array | null> {
  try {
    const dotsPerMm = paperWidthMm >= 80 ? 8 : 8   // ~203 dpi = 8 dots/mm
    const maxWidthPx = Math.floor(paperWidthMm * dotsPerMm * 0.90) // 90% of paper
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const { data, info } = await sharp(buf)
      .resize(maxWidthPx, null, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .threshold(128)   // 1-bit: white=0, black=255
      .raw()
      .toBuffer({ resolveWithObject: true })
    const W = info.width, H = info.height
    const bytesPerRow = Math.ceil(W / 8)
    const packed = new Uint8Array(bytesPerRow * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[y * W + x] < 128) {   // dark pixel → set bit
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
    const dotsPerMm = paperWidthMm >= 80 ? 8 : 8
    const maxPx = Math.floor(paperWidthMm * dotsPerMm * 0.40)   // 40% of paper
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

    const rsAny = rs as Record<string, unknown> | null
    const paperWidth = (printer as { paper_width?: number }).paper_width ?? 80
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

    const bytes  = buildReceiptBytes(payload)
    const buffer = Buffer.from(bytes)

    const p = printer as { connection_type: string; ip_address?: string; port?: number; usb_path?: string; bt_address?: string }

    if (p.connection_type === 'ip') {
      if (!p.ip_address) return NextResponse.json({ ok: false, error: 'Printer IP address not set' }, { status: 400 })
      await sendIp(p.ip_address, p.port ?? 9100, buffer)
    } else if (p.connection_type === 'usb') {
      if (!p.usb_path) return NextResponse.json({ ok: false, error: 'USB device path not set' }, { status: 400 })
      const isWindows = platform() === 'win32'
      const isComPort = /^COM\d+$/i.test(p.usb_path)
      const isLinux   = p.usb_path.startsWith('/dev/')
      if (isLinux) {
        await writeStream(p.usb_path, buffer)
      } else if (isWindows && isComPort) {
        await writeStream(`\\\\.\\${p.usb_path}`, buffer)
      } else {
        printWindows(p.usb_path, buffer)
      }
    } else {
      return NextResponse.json({ ok: false, error: 'Bluetooth printing requires a local print bridge. Use IP or USB instead.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
