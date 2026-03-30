import { NextRequest, NextResponse } from 'next/server'
import net from 'net'

export async function POST(req: NextRequest) {
  const { ip, port } = await req.json()

  if (!ip || !port) {
    return NextResponse.json({ ok: false, error: 'IP address and port are required' })
  }

  return new Promise<NextResponse>((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(4000)

    socket.on('connect', () => {
      socket.destroy()
      resolve(NextResponse.json({ ok: true }))
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve(NextResponse.json({ ok: false, error: 'Connection timed out (4s)' }))
    })

    socket.on('error', (err: NodeJS.ErrnoException) => {
      const msg =
        err.code === 'ECONNREFUSED' ? 'Printer refused connection — check IP/port'
        : err.code === 'EHOSTUNREACH' ? 'Host unreachable — check network'
        : err.code === 'ENETUNREACH'  ? 'Network unreachable'
        : err.message
      resolve(NextResponse.json({ ok: false, error: msg }))
    })

    socket.connect(Number(port), String(ip))
  })
}
