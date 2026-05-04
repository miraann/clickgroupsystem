import { NextRequest, NextResponse } from 'next/server'
import net from 'net'
import { requireAuth } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'printer/test', 15)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  const { error: authError } = await requireAuth()
  if (authError) return authError

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
