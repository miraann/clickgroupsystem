import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/api-auth'
import { rateLimit } from '@/lib/rate-limit'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import { listWindowsPrinters } from '@/lib/printDispatch.server'

export const runtime = 'nodejs'

// Offline edition only: the printers installed on the restaurant PC (which runs
// this server), for Settings → Device → scan. Any device — a tablet too — can
// list them, since printing to them goes through the PC.
export async function GET(req: Request) {
  if (!IS_OFFLINE_EDITION) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await rateLimit(req, 'devices/system-printers', 10))) {
    return NextResponse.json({ devices: [], error: 'Too many requests' }, { status: 429 })
  }
  const { error } = await requireRestaurant()
  if (error) return error

  const devices = (await listWindowsPrinters()).map(p => {
    const port = p.port.toUpperCase()
    const network = port.startsWith('IP_') || /^\d+\.\d+\.\d+\.\d+/.test(port)
    return {
      id:              `sys-${p.name.replace(/[^a-z0-9]/gi, '-')}`,
      name:            p.name,
      connection_type: network ? 'network' : 'usb',
      // Network ones are saved as IP printers, so give the bare address.
      address:         network ? p.port.replace(/^IP_/i, '').replace(/_\d+$/, '') : p.port,
      status:          p.ready ? 'online' : 'offline',
    }
  })
  return NextResponse.json({ devices })
}
