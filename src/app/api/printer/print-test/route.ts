import { NextResponse } from 'next/server'
import { createWriteStream } from 'fs'
import { writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { tmpdir, platform } from 'os'
import * as net from 'net'

// ── ESC/POS helpers ────────────────────────────────────────────
const ESC = 0x1B, GS = 0x1D, LF = 0x0A
const enc = new TextEncoder()

function line(s: string): number[] { return [...enc.encode(s + '\n')] }
function feed(n = 1): number[]     { return Array(n).fill(LF) }

function padRow(left: string, right: string, cols: number): string {
  const gap = cols - left.length - right.length
  return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right
}

function buildInvoiceBytes(printerName: string, paperWidth: number): Buffer {
  const cols = paperWidth >= 80 ? 42 : paperWidth >= 58 ? 32 : 24
  const div  = '='.repeat(cols)
  const thin = '-'.repeat(cols)
  const now  = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const items = [
    { name: 'Grilled Chicken',  qty: 2, price: 12.50 },
    { name: 'Caesar Salad',     qty: 1, price:  8.00 },
    { name: 'Fresh Lemonade',   qty: 3, price:  3.50 },
    { name: 'Chocolate Cake',   qty: 1, price:  6.00 },
  ]
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const discount = 5.00
  const tax      = (subtotal - discount) * 0.10
  const total    = subtotal - discount + tax
  const tendered = Math.ceil(total / 5) * 5

  const CMD = {
    init:  [ESC, 0x40],  cut:    [GS, 0x56, 0x42, 0x10],
    center:[ESC, 0x61, 0x01], left:[ESC, 0x61, 0x00],
    bold:  [ESC, 0x45, 0x01], boldOff:[ESC, 0x45, 0x00],
    dbl:   [ESC, 0x21, 0x30], dblH:  [ESC, 0x21, 0x10], norm:[ESC, 0x21, 0x00],
  }

  const b: number[] = [
    ...CMD.init,
    ...CMD.center, ...CMD.dbl,
    ...line('ClickGroup POS'),
    ...CMD.norm,
    ...line('123 Main Street, City'),
    ...line('Tel: +1 555 000 1234'),
    ...line(div),
    ...CMD.left,
    ...line(`Date    : ${dateStr}  ${timeStr}`),
    ...line(`Order   : #TEST-001`),
    ...line(`Table   : 05    Cashier: Admin`),
    ...line(`Printer : ${printerName}`),
    ...line(thin),
    ...CMD.bold, ...line(padRow('ITEM', 'TOTAL', cols)), ...CMD.boldOff,
    ...line(thin),
  ]
  for (const item of items) {
    b.push(...line(padRow(`${item.qty}x ${item.name}`, `$${(item.qty * item.price).toFixed(2)}`, cols)))
    b.push(...line(`   @ $${item.price.toFixed(2)} each`))
  }
  b.push(
    ...line(thin),
    ...line(padRow('Subtotal',         `$${subtotal.toFixed(2)}`, cols)),
    ...line(padRow('Discount (promo)', `-$${discount.toFixed(2)}`, cols)),
    ...line(padRow('Tax (10%)',        `$${tax.toFixed(2)}`, cols)),
    ...line(div),
    ...CMD.bold, ...CMD.dblH, ...line(padRow('TOTAL', `$${total.toFixed(2)}`, cols)), ...CMD.norm, ...CMD.boldOff,
    ...line(thin),
    ...line(padRow('Payment',  'Cash', cols)),
    ...line(padRow('Tendered', `$${tendered.toFixed(2)}`, cols)),
    ...line(padRow('Change',   `$${(tendered - total).toFixed(2)}`, cols)),
    ...line(div),
    ...CMD.center,
    ...line('Thank you for your visit!'),
    ...line('Powered by ClickGroup POS'),
    ...line('--- TEST RECEIPT ---'),
    ...feed(4),
    ...CMD.cut,
  )
  return Buffer.from(b)
}

// ── Write strategies ───────────────────────────────────────────

// For COM ports and Linux device files — direct stream write
function writeStream(devicePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = createWriteStream(devicePath, { flags: 'w' })
    s.on('error', reject)
    s.end(data, () => s.close(err => (err ? reject(err) : resolve())))
  })
}

// For Windows USB printers — use winspool.drv P/Invoke via PowerShell
// Handles both port names (USB001) and full printer names
function printWindows(portOrName: string, data: Buffer): void {
  const tmp = join(tmpdir(), `pos_${Date.now()}.bin`)
  writeFileSync(tmp, data)

  try {
    const tmpPs = tmp.replace(/\\/g, '\\\\').replace(/'/g, "''")
    const portPs = portOrName.replace(/'/g, "''")

    // If it looks like a port name, resolve to printer name first
    const resolvePs = /^USB\d+$/i.test(portOrName)
      ? `(Get-WmiObject Win32_Printer | Where-Object {$_.PortName -eq '${portPs}'} | Select-Object -First 1).Name`
      : `'${portPs}'`

    // Compact PowerShell one-liner using winspool.drv P/Invoke
    const ps = `
$pn=${resolvePs}
if(!$pn){Write-Error 'Printer not found';exit 1}
$bytes=[IO.File]::ReadAllBytes('${tmpPs}')
if(-not ([Management.Automation.PSTypeName]'WP2').Type){Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class WP2{
  [DllImport("winspool.drv",EntryPoint="OpenPrinterA")]public static extern bool Open(string n,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",EntryPoint="ClosePrinter")]public static extern bool Close(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="StartDocPrinterA")]public static extern int StartDoc(IntPtr h,int l,IntPtr di);
  [DllImport("winspool.drv",EntryPoint="EndDocPrinter")]public static extern bool EndDoc(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="StartPagePrinter")]public static extern bool StartPage(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="EndPagePrinter")]public static extern bool EndPage(IntPtr h);
  [DllImport("winspool.drv",EntryPoint="WritePrinter")]public static extern bool Write(IntPtr h,IntPtr p,int c,out int w);
}
'@}
$h=[IntPtr]::Zero;[WP2]::Open($pn,[ref]$h,[IntPtr]::Zero)|Out-Null
$m=[Runtime.InteropServices.Marshal]
$di=$m::AllocHGlobal(3*[IntPtr]::Size)
$dn=$m::StringToHGlobalAnsi("POS")
$dt=$m::StringToHGlobalAnsi("RAW")
$m::WriteIntPtr($di,0,$dn);$m::WriteIntPtr($di,[IntPtr]::Size,[IntPtr]::Zero);$m::WriteIntPtr($di,2*[IntPtr]::Size,$dt)
[WP2]::StartDoc($h,1,$di)|Out-Null;[WP2]::StartPage($h)|Out-Null
$pb=$m::AllocHGlobal($bytes.Length);$m::Copy($bytes,0,$pb,$bytes.Length)
$w=0;[WP2]::Write($h,$pb,$bytes.Length,[ref]$w)|Out-Null
$m::FreeHGlobal($pb);$m::FreeHGlobal($di);$m::FreeHGlobal($dn);$m::FreeHGlobal($dt)
[WP2]::EndPage($h)|Out-Null;[WP2]::EndDoc($h)|Out-Null;[WP2]::Close($h)|Out-Null
Write-Host "PRINTED:$w bytes to $pn"
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

// For network printers — raw TCP socket write (port 9100 / JetDirect)
function printNetwork(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket()
    let done = false
    const finish = (err?: Error) => {
      if (done) return
      done = true
      sock.destroy()
      if (err) reject(err)
      else resolve()
    }
    sock.setTimeout(10000)
    sock.on('error',   (e) => finish(e))
    sock.on('timeout', ()  => finish(new Error('Connection timed out after 10 s')))
    sock.connect(port, ip, () => {
      sock.write(data, err => {
        if (err) return finish(err)
        sock.end(() => finish())
      })
    })
  })
}

// ── Route ─────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { path, ip, port: netPort, name, paper_width } = await req.json()

  const bytes = buildInvoiceBytes(name ?? 'Printer', paper_width ?? 80)

  // ── Network / IP printer ──────────────────────────────────
  if (ip) {
    try {
      await printNetwork(ip, netPort ?? 9100, bytes)
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message ?? 'Network print failed' })
    }
  }

  // ── USB / serial printer ──────────────────────────────────
  if (!path) {
    return NextResponse.json({
      ok: false,
      error: 'Device path not set — edit the printer and set the port (USB001, COM3) or Linux path (/dev/usb/lp0)',
    })
  }

  try {
    const isWindows = platform() === 'win32'
    const isComPort = /^COM\d+$/i.test(path)
    const isLinux   = path.startsWith('/dev/')

    if (isLinux) {
      await writeStream(path, bytes)
    } else if (isWindows && isComPort) {
      await writeStream(`\\\\.\\${path}`, bytes)
    } else {
      printWindows(path, bytes)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? 'Print failed' })
  }
}
