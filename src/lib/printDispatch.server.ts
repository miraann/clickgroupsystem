// Server-side "send ESC/POS bytes to the printer" for the offline edition,
// where the Next.js server runs on the restaurant's own PC and can reach its
// printers directly. Ported from electron-app/main.js (printBytes /
// printWindowsPrinter) so a waiter tablet's browser can print through the PC.
import 'server-only'
import net from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'

function tcpOnce(bytes: Buffer, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket()
    sock.setTimeout(5000)
    sock.connect(port, host, () => {
      sock.write(bytes, () => { sock.end(); resolve() })
    })
    sock.on('error',   e => { sock.destroy(); reject(new Error(`TCP error: ${e.message}`)) })
    sock.on('timeout', () => { sock.destroy(); reject(new Error('Connection timed out')) })
  })
}

/** Network printer (raw TCP, usually port 9100). Retries because cheap printers
 *  briefly refuse a new connection right after the previous one closed. */
export async function printTcp(bytes: Buffer, host: string, port = 9100, attempts = 3): Promise<void> {
  for (let i = 1; ; i++) {
    try { return await tcpOnce(bytes, host, port) } catch (e) {
      if (i >= attempts) throw e
      await new Promise(r => setTimeout(r, 600))
    }
  }
}

// Windows spooler RAW job (OpenPrinter / WritePrinter), so the bytes reach a
// USB or Windows-paired Bluetooth printer untouched by any driver.
const RAW_PRINT_PS1 = `
param([string]$Printer, [string]$DataFile)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinPrint {
  [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO pDocInfo);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static bool RawPrint(string printer, byte[] data) {
    IntPtr h; int w;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    var di = new DOCINFO { pDocName="RAW", pDataType="RAW" };
    if (StartDocPrinter(h, 1, di) == 0) { ClosePrinter(h); return false; }
    StartPagePrinter(h);
    WritePrinter(h, data, data.Length, out w);
    EndPagePrinter(h);
    EndDocPrinter(h);
    ClosePrinter(h);
    return w > 0;
  }
}
"@ -ErrorAction Stop
$bytes = [System.IO.File]::ReadAllBytes($DataFile)
if ([WinPrint]::RawPrint($Printer, $bytes)) { Write-Output "OK" } else { Write-Error "WritePrinter returned false"; exit 1 }
`

/** USB / Bluetooth printer installed in Windows, addressed by its Windows name. */
export async function printWindowsPrinter(bytes: Buffer, printerName: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Windows printers can only be used on Windows')
  const id   = crypto.randomBytes(6).toString('hex')
  const bin  = path.join(os.tmpdir(), `cg-pos-${id}.bin`)
  const ps1  = path.join(os.tmpdir(), `cg-pos-${id}.ps1`)
  await fs.writeFile(bin, bytes)
  await fs.writeFile(ps1, RAW_PRINT_PS1, 'utf8')
  try {
    // Printer name and file go in as script parameters, never spliced into code.
    const out = await new Promise<string>((resolve, reject) => {
      execFile('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Printer', printerName, '-DataFile', bin],
        { timeout: 15000, windowsHide: true },
        (err, stdout, stderr) => err ? reject(new Error(String(stderr).trim() || err.message)) : resolve(String(stdout)))
    })
    if (!out.includes('OK')) throw new Error('Print failed — check the printer name')
  } finally {
    await Promise.all([fs.rm(bin, { force: true }), fs.rm(ps1, { force: true })])
  }
}

export interface WindowsPrinter {
  name:   string
  /** USB001, COM3, IP_192.168.1.50, … */
  port:   string
  ready:  boolean
}

/** Printers installed in Windows (USB, Bluetooth-paired and network ones). */
export async function listWindowsPrinters(): Promise<WindowsPrinter[]> {
  if (process.platform !== 'win32') return []
  const out = await new Promise<string>((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Printer | Select-Object Name,PortName,PrinterStatus | ConvertTo-Json -Compress'],
      { timeout: 15000, windowsHide: true },
      (err, stdout) => resolve(err ? '' : String(stdout)))
  })
  if (!out.trim()) return []
  try {
    const parsed = JSON.parse(out) as { Name?: string; PortName?: string; PrinterStatus?: number } | { Name?: string; PortName?: string; PrinterStatus?: number }[]
    return (Array.isArray(parsed) ? parsed : [parsed]).map(p => ({
      name:  p.Name ?? 'Unknown printer',
      port:  p.PortName ?? '',
      ready: p.PrinterStatus === 3, // 3 = idle
    }))
  } catch {
    return []
  }
}
