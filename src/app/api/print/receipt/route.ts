import { NextRequest, NextResponse } from 'next/server'
import net from 'net'
import { createWriteStream } from 'fs'
import { writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { tmpdir, platform } from 'os'
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
    const payload: ReceiptPayload = {
      restaurantName: (rsAny?.shop_name as string) || (rest as { name?: string } | null)?.name || 'Restaurant',
      address:        (rsAny?.address        as string | null) ?? null,
      phone:          (rsAny?.phone          as string | null) ?? null,
      thankYouMsg:    (rsAny?.thank_you_msg  as string)       ?? 'Thank you for your visit!',
      currencySymbol: (rsAny?.currency_symbol as string)      ?? '',
      poweredBy:      (rsAny?.phone          as string | null) ?? null,
      paperWidth:     (printer as { paper_width?: number }).paper_width ?? 80,
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
      qrUrl:          body.qrUrl ?? null,
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
