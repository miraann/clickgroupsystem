'use client'

// Known thermal printer USB vendor IDs — prefer these when multiple devices are authorized
const PRINTER_VENDOR_IDS = new Set([
  0x04b8, // Epson
  0x0519, // Star Micronics
  0x1504, // Bixolon
  0x1584, // Citizen
  0x154f, // SNBC
  0x0fe6, // ICS/Wonderful
  0x2730, // Birch
  0x0dd4, // Custom/Sewoo
  0x067b, // Prolific USB-serial
  0x1a86, // WCH CH340/CH341
  0x0483, // STMicroelectronics (POS58 and others)
])

export async function webUsbPrint(bytes: Uint8Array): Promise<void> {
  const nav = navigator as any
  if (!nav?.usb) {
    throw new Error('WebUSB not supported. Use Chrome or Edge browser.')
  }

  const devs: any[] = await nav.usb.getDevices()
  let dev = devs.find((d: any) => PRINTER_VENDOR_IDS.has(d.vendorId)) ?? devs[0] ?? null

  if (!dev) {
    // First time — prompt user to authorize a device
    dev = await nav.usb.requestDevice({ filters: [] })
  }

  await dev.open()
  try {
    if (dev.configuration === null) await dev.selectConfiguration(1)

    // Find the first bulk-OUT endpoint across all interfaces
    let ifaceNum = -1, epNum = -1
    outer: for (const iface of dev.configuration.interfaces) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.direction === 'out' && ep.type === 'bulk') {
            ifaceNum = iface.interfaceNumber
            epNum = ep.endpointNumber
            break outer
          }
        }
      }
    }
    if (ifaceNum === -1) throw new Error('No bulk-OUT endpoint found on USB printer.')

    await dev.claimInterface(ifaceNum)
    try {
      // Send in 64 KB chunks
      const CHUNK = 65536
      for (let off = 0; off < bytes.length; off += CHUNK) {
        await dev.transferOut(epNum, bytes.slice(off, off + CHUNK))
      }
    } finally {
      await dev.releaseInterface(ifaceNum)
    }
  } finally {
    try { await dev.close() } catch { /* ignore close errors */ }
  }
}
