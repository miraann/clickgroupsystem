import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { restaurant_id } = body

    if (!restaurant_id) return NextResponse.json({ error: 'Missing restaurant_id' }, { status: 400 })

    const supabase = await createClient()

    if (body.fcm_token) {
      // Native Android FCM token
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { restaurant_id, endpoint: body.fcm_token, type: 'fcm', subscription: null },
          { onConflict: 'endpoint' }
        )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (body.subscription) {
      // Browser Web Push subscription
      const endpoint = (body.subscription as { endpoint: string }).endpoint
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { restaurant_id, endpoint, type: 'web', subscription: body.subscription },
          { onConflict: 'endpoint' }
        )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      return NextResponse.json({ error: 'Missing subscription or fcm_token' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json()
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    const supabase = await createClient()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
