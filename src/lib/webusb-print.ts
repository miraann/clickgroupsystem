'use client'

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

async function webUsbPrint(bytes: Uint8Array): Promise<void> {
  const nav = navigator as any
  const devs: any[] = await nav.usb.getDevices()
  let dev = devs.find((d: any) => PRINTER_VENDOR_IDS.has(d.vendorId)) ?? devs[0] ?? null

  if (!dev) dev = await nav.usb.requestDevice({ filters: [] })

  await dev.open()
  try {
    if (dev.configuration === null) await dev.selectConfiguration(1)

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
      const CHUNK = 65536
      for (let off = 0; off < bytes.length; off += CHUNK) {
        await dev.transferOut(epNum, bytes.slice(off, off + CHUNK))
      }
    } finally {
      await dev.releaseInterface(ifaceNum)
    }
  } finally {
    try { await dev.close() } catch { /* ignore */ }
  }
}

async function webSerialPrint(bytes: Uint8Array): Promise<void> {
  const nav = navigator as any
  if (!nav?.serial) throw new Error('Web Serial not supported. Use Chrome or Edge browser.')

  // Re-use an already-authorized port, or prompt to pick one
  const ports = await nav.serial.getPorts()
  const port  = ports[0] ?? await nav.serial.requestPort()

  // For USB virtual COM ports the baud rate is usually ignored, but 9600 is safe
  await port.open({ baudRate: 9600 })
  try {
    const writer = port.writable.getWriter()
    try {
      await writer.write(bytes)
    } finally {
      writer.releaseLock()
    }
  } finally {
    await port.close()
  }
}

/**
 * Print to a USB thermal printer from the browser.
 * Tries WebUSB first; if Windows blocks it (usbprint.sys driver conflict),
 * automatically falls back to Web Serial (COM port).
 */
export async function browserPrint(bytes: Uint8Array): Promise<void> {
  const nav = navigator as any

  if (nav?.usb) {
    try {
      await webUsbPrint(bytes)
      return
    } catch (e: any) {
      const msg = e?.message ?? ''
      // "Access denied" = Windows kernel driver (usbprint.sys) holds the device.
      // Fall through to Web Serial which accesses the virtual COM port instead.
      if (!msg.includes('Access denied') && !msg.includes('Access Denied')) throw e
    }
  }

  // Web Serial fallback — works if printer enumerates as a COM port (STM32 CDC VCP, CH340, etc.)
  if (nav?.serial) {
    await webSerialPrint(bytes)
    return
  }

  throw new Error(
    'Could not access the USB printer.\n' +
    'On Windows: the printer driver (usbprint.sys) blocks direct USB access. ' +
    'Check Device Manager — if the printer also shows as a COM port, authorize it via Web Serial. ' +
    'Otherwise use "Browser Print" or install Zadig to replace the driver with WinUSB.'
  )
}
