import { browserPrint } from '@/lib/webusb-print'
import { getAndroidTcp } from '@/lib/android-tcp'

// Shared "hand the ESC/POS bytes to the physical printer" step.
// Every /api/print/* route returns the same shape; this picks the right
// transport for the current runtime (Electron desktop / Android APK / browser)
// and throws a human-readable error when nothing succeeds.

export interface PrinterDispatch {
  /** base64-encoded ESC/POS bytes, exactly as returned by the print API */
  bytes:          string
  connectionType: string
  printerName?:   string | null
  ipAddress?:     string | null
  btAddress?:     string | null
  port?:          number | null
}

const BT_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
]

export async function sendPrinterBytes(p: PrinterDispatch): Promise<void> {
  const { bytes, connectionType } = p
  const port = p.port ?? 9100
  if (!bytes) throw new Error('Nothing to print — empty payload')

  const rawBytes = Uint8Array.from(atob(bytes), c => c.charCodeAt(0))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ea = typeof window !== 'undefined' ? (window as any).electronAPI : null

  // ── Electron desktop ─────────────────────────────────────────
  if (ea?.isElectron) {
    if (connectionType === 'ip' && p.ipAddress) {
      const r = await ea.printBytes(bytes, p.ipAddress, port)
      if (!r?.ok) throw new Error(r?.error ?? 'Network printer did not respond')
      return
    }
    // USB & Bluetooth printers paired in Windows both show up in Win32_Printer
    if ((connectionType === 'usb' || connectionType === 'serial' || connectionType === 'bluetooth') && p.printerName) {
      const r = await ea.printWindowsPrinter(bytes, p.printerName)
      if (!r?.ok) throw new Error(r?.error ?? 'Windows printer rejected the job')
      return
    }
    throw new Error('Printer is not configured correctly')
  }

  // ── Android APK / plain browser ──────────────────────────────
  const androidTcp = getAndroidTcp()

  if (connectionType === 'ip' && p.ipAddress) {
    if (!androidTcp) throw new Error('IP printers need the ClickGroup desktop app')
    const r = await androidTcp.printBytes({ host: p.ipAddress, port, data: bytes })
    if (!r?.ok) throw new Error('Network printer did not respond')
    return
  }

  if (connectionType === 'usb' || connectionType === 'serial') {
    await browserPrint(rawBytes) // WebUSB — throws on its own
    return
  }

  if (connectionType === 'bluetooth') {
    if (androidTcp && p.btAddress) {
      const r = await androidTcp.printBluetooth({ address: p.btAddress, data: bytes })
      if (!r?.ok) throw new Error('Bluetooth printer did not respond')
      return
    }
    await sendViaWebBluetooth(rawBytes)
    return
  }

  throw new Error(`Unsupported printer connection: ${connectionType || 'none set'}`)
}

async function sendViaWebBluetooth(rawBytes: Uint8Array): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : null
  if (!bt) throw new Error('Bluetooth is not supported here — use Chrome or Edge')
  const devs = await bt.getDevices()
  const dev  = devs[0] ?? null
  if (!dev) throw new Error('No Bluetooth printer has been paired yet')

  const server = await dev.gatt.connect()
  try {
    for (const uuid of BT_SERVICE_UUIDS) {
      try {
        const svc   = await server.getPrimaryService(uuid)
        const chars = await svc.getCharacteristics()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse)
        if (!w) continue
        for (let i = 0; i < rawBytes.length; i += 512) {
          const chunk = rawBytes.slice(i, Math.min(i + 512, rawBytes.length))
          if (w.properties.writeWithoutResponse) await w.writeValueWithoutResponse(chunk)
          else await w.writeValue(chunk)
        }
        return
      } catch { /* try next service UUID */ }
    }
    throw new Error('No writable characteristic on the Bluetooth printer')
  } finally {
    server.disconnect()
  }
}
