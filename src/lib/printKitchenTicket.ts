import { browserPrint } from '@/lib/webusb-print'
import { getAndroidTcp } from '@/lib/android-tcp'

export async function printKitchenTicket(params: {
  restaurantId: string
  tableNum:     string
  orderNum?:    string | null
  items:        { name: string; qty: number; note?: string | null }[]
  note?:        string | null
}) {
  const now     = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // ── 1. Get ESC/POS bytes + printer config from server ────────────────
  let bytes:          string | null = null
  let connectionType: string        = ''
  let printerName:    string        = ''
  let ipAddress:      string | null = null
  let btAddress:      string | null = null
  let port:           number        = 9100
  let usbPath:        string | null = null
  let paperWidth:     number        = 80
  let apiOk = false

  try {
    const res  = await fetch('/api/print/kitchen', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...params, timeStr, dateStr }),
    })
    const json = await res.json()
    if (json.ok) {
      apiOk         = true
      bytes         = json.bytes
      connectionType = json.connectionType ?? ''
      printerName   = json.printerName   ?? ''
      ipAddress     = json.ipAddress     ?? null
      btAddress     = json.btAddress     ?? null
      port          = json.port          ?? 9100
      usbPath       = json.usbPath       ?? null
      paperWidth    = json.paperWidth    ?? 80
    }
  } catch { /* fall through to popup */ }

  // ── 2. Try silent ESC/POS print ──────────────────────────────────────
  const ea = typeof window !== 'undefined' ? (window as any).electronAPI : null

  if (apiOk && bytes) {
    // IP/Network printer — Electron handles TCP directly, Vercel cannot reach LAN
    if (connectionType === 'ip' && ipAddress) {
      if (ea?.isElectron) {
        const result = await ea.printBytes(bytes, ipAddress, port)
        if (result?.ok) return
      } else {
        // Android APK: use native TcpPlugin (device is on local network)
        const androidTcp = getAndroidTcp()
        if (androidTcp) {
          try {
            const result = await androidTcp.printBytes({ host: ipAddress, port, data: bytes })
            if (result?.ok) return
          } catch { /* fall through to popup */ }
        }
        // Plain web (Vercel): cannot reach LAN — fall through to popup
      }
    }

    // USB / Bluetooth printer in Electron — Windows printer list (no dialog)
    // Bluetooth printers paired in Windows appear in Win32_Printer just like USB
    if ((connectionType === 'usb' || connectionType === 'serial' || connectionType === 'bluetooth') && ea?.isElectron) {
      const target = printerName
      if (target) {
        const result = await ea.printWindowsPrinter(bytes, target)
        if (result?.ok) return
        // Fall through to popup on failure
      }
    }

    // USB printer in browser — WebUSB (requires prior authorization)
    if ((connectionType === 'usb' || connectionType === 'serial') && !ea?.isElectron) {
      try {
        const rawBytes = Uint8Array.from(atob(bytes), c => c.charCodeAt(0))
        await browserPrint(rawBytes)
        return
      } catch { /* fall through to popup */ }
    }

    // Bluetooth printer in Android APK — native SPP via TcpPlugin
    if (connectionType === 'bluetooth' && !ea?.isElectron) {
      const androidTcp = getAndroidTcp()
      if (androidTcp && bytes && btAddress) {
        try {
          const result = await androidTcp.printBluetooth({ address: btAddress, data: bytes })
          if (result?.ok) return
        } catch { /* fall through to Web Bluetooth */ }
      }
    }

    // Bluetooth printer in browser — Web Bluetooth (auto-connect to last paired device)
    if (connectionType === 'bluetooth' && !ea?.isElectron) {
      if (typeof navigator !== 'undefined' && 'bluetooth' in (navigator as any)) {
        try {
          const rawBytes = Uint8Array.from(atob(bytes), c => c.charCodeAt(0))
          const bt   = (navigator as any).bluetooth
          const devs = await bt.getDevices()
          const dev  = devs[0] ?? null
          if (dev) {
            const server = await dev.gatt.connect()
            let sent = false
            try {
              for (const uuid of [
                '000018f0-0000-1000-8000-00805f9b34fb',
                '0000ffe0-0000-1000-8000-00805f9b34fb',
                'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                '49535343-fe7d-4ae5-8fa9-9fafd205e455',
              ]) {
                try {
                  const svc   = await server.getPrimaryService(uuid)
                  const chars = await svc.getCharacteristics()
                  const w = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse)
                  if (!w) continue
                  for (let i = 0; i < rawBytes.length; i += 512) {
                    const chunk = rawBytes.slice(i, Math.min(i + 512, rawBytes.length))
                    w.properties.writeWithoutResponse
                      ? await w.writeValueWithoutResponse(chunk)
                      : await w.writeValue(chunk)
                  }
                  sent = true; break
                } catch { /* try next service UUID */ }
              }
            } finally { server.disconnect() }
            if (sent) return
          }
        } catch { /* fall through to popup */ }
      }
    }
  }

  // ── 3. No silent print path worked — give up quietly (no popup) ──────
  console.error('printKitchenTicket: no printer path succeeded', { connectionType, printerName })
}
