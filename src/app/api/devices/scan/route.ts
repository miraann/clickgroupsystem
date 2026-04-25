import { NextResponse } from 'next/server'
import * as net from 'net'
import * as os from 'os'

export const maxDuration = 30

// Ports that thermal / label printers commonly listen on
const PRINTER_PORTS = [9100, 631, 515]
const TIMEOUT_MS    = 250
const HOST_BATCH    = 30  // concurrent hosts per round

function getLocalSubnets(): string[] {
  const subnets = new Set<string>()
  for (const iface of Object.values(os.networkInterfaces())) {
    if (!iface) continue
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const [a, b, c] = addr.address.split('.')
        subnets.add(`${a}.${b}.${c}`)
      }
    }
  }
  return Array.from(subnets)
}

function probePort(ip: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const sock = new net.Socket()
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(TIMEOUT_MS)
    sock.on('connect', () => finish(true))
    sock.on('error',   () => finish(false))
    sock.on('timeout', () => finish(false))
    sock.connect(port, ip)
  })
}

export async function POST() {
  // On Vercel (cloud), the server is in a datacenter — not on the restaurant's LAN.
  // Skip the scan and tell the client so it can show a helpful message.
  if (process.env.VERCEL) {
    return NextResponse.json({ devices: [], cloudDeployment: true })
  }

  const subnets = getLocalSubnets()
  if (subnets.length === 0) {
    return NextResponse.json({ devices: [], error: 'No local IPv4 interface found' })
  }

  const found: { ip: string; port: number }[] = []

  for (const subnet of subnets) {
    const hosts = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`)

    for (let i = 0; i < hosts.length; i += HOST_BATCH) {
      const batch = hosts.slice(i, i + HOST_BATCH)
      const results = await Promise.all(
        batch.map(async ip => {
          const portOpen = await Promise.all(PRINTER_PORTS.map(p => probePort(ip, p)))
          const openPorts = PRINTER_PORTS.filter((_, j) => portOpen[j])
          return { ip, openPorts }
        })
      )
      for (const { ip, openPorts } of results) {
        if (openPorts.length > 0) found.push({ ip, port: openPorts[0] })
      }
    }
  }

  const devices = found.map(({ ip, port }) => ({
    id: `net-${ip.replace(/\./g, '-')}-${port}`,
    name: `Network Printer (${ip})`,
    ip,
    port,
    connection_type: 'network' as const,
    status: 'online' as const,
  }))

  return NextResponse.json({ devices, subnets })
}
