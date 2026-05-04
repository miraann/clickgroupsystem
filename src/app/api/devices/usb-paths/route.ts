import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { accessSync } from 'fs'
import * as os from 'os'
import { requireAuth } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

export interface UsbPathEntry {
  path: string   // the value to store in usb_path (e.g. USB001, COM3, /dev/usb/lp0)
  label: string  // human-readable (e.g. "POS58 Printer USB — USB001")
  matchName: string // lowercase name used for fuzzy matching against detected device names
}

export async function GET(req: Request) {
  if (!rateLimit(req, 'devices/usb-paths', 20)) {
    return NextResponse.json({ entries: [], error: 'Too many requests' }, { status: 429 })
  }
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const platform = os.platform()
  // Use a Map keyed on path to guarantee uniqueness at source
  const byPath = new Map<string, UsbPathEntry>()

  const add = (e: UsbPathEntry) => {
    if (!byPath.has(e.path)) byPath.set(e.path, e)
  }

  if (platform === 'win32') {
    // ── Windows printer ports (USB001, COM3, …) from the spooler ──
    try {
      const raw = execSync(
        `powershell.exe -NoProfile -NonInteractive -Command ` +
        `"Get-WmiObject Win32_Printer | Select-Object Name,PortName | ConvertTo-Json -Compress"`,
        { timeout: 8000, windowsHide: true }
      ).toString().trim()
      if (raw) {
        const list = JSON.parse(raw)
        const arr: any[] = Array.isArray(list) ? list : [list]
        for (const p of arr) {
          const port: string = p.PortName ?? ''
          if (!port || (!port.startsWith('USB') && !port.match(/^COM\d+$/i))) continue
          const name: string = p.Name ?? port
          add({ path: port, label: `${name} — ${port}`, matchName: name.toLowerCase() })
        }
      }
    } catch {}

    // ── Virtual COM ports from PnP (CH340, Prolific, STM32 VCP, …) ──
    try {
      const raw = execSync(
        `powershell.exe -NoProfile -NonInteractive -Command ` +
        `"Get-WmiObject Win32_PnPEntity | Where-Object {$_.Name -match 'COM[0-9]+'} | Select-Object Name | ConvertTo-Json -Compress"`,
        { timeout: 8000, windowsHide: true }
      ).toString().trim()
      if (raw) {
        const list = JSON.parse(raw)
        const arr: any[] = Array.isArray(list) ? list : [list]
        for (const e of arr) {
          const m = (e.Name ?? '').match(/\(COM(\d+)\)/)
          if (!m) continue
          const port = `COM${m[1]}`
          add({ path: port, label: `${e.Name} — ${port}`, matchName: (e.Name as string).toLowerCase() })
        }
      }
    } catch {}

  } else {
    // ── Linux / Mac: check device files that actually exist ──
    const candidates = [
      '/dev/usb/lp0', '/dev/usb/lp1',
      '/dev/ttyUSB0', '/dev/ttyUSB1',
      '/dev/ttyACM0', '/dev/ttyACM1',
    ]
    for (const p of candidates) {
      try { accessSync(p); add({ path: p, label: p, matchName: p }) } catch {}
    }
  }

  return NextResponse.json({ entries: Array.from(byPath.values()), platform })
}
