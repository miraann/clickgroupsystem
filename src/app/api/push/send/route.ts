import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

export type NotifType = 'delivery' | 'waiter' | 'kds' | 'guest'

const NOTIF_META: Record<NotifType, { title: string; body: string }> = {
  delivery: { title: '🚚 New Delivery Order',   body: 'A new delivery order has been received.'      },
  waiter:   { title: '🔔 Waiter Call',           body: 'A guest is requesting assistance at a table.' },
  kds:      { title: '👨‍🍳 New Kitchen Order',    body: 'A new order has been sent to the KDS screen.' },
  guest:    { title: '📱 Guest Menu Order',      body: 'A new order arrived from the QR code menu.'   },
}

const ICON = '/logo/android/launchericon-192x192.png'

async function sendFcm(token: string, title: string, body: string): Promise<boolean> {
  const key = process.env.FCM_SERVER_KEY
  if (!key) return false
  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${key}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        to: token,
        notification: { title, body, icon: ICON, sound: 'default' },
        android: { priority: 'high', notification: { channel_id: 'pos_alerts' } },
      }),
    })
    const json = await res.json()
    return json.success === 1
  } catch { return false }
}

export async function POST(req: Request) {
  try {
    const { restaurant_id, type, body: customBody } = await req.json() as {
      restaurant_id: string
      type: NotifType
      body?: string
    }

    if (!restaurant_id || !type || !NOTIF_META[type]) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    }

    const supabase = await createClient()

    // Check notification preference
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('settings')
      .eq('id', restaurant_id)
      .maybeSingle()

    const settings = (restaurant?.settings as Record<string, unknown>) ?? {}
    if (settings[`push_notif_${type}`] === false) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, type, subscription')
      .eq('restaurant_id', restaurant_id)

    if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 })

    const meta = NOTIF_META[type]
    const title = meta.title
    const body  = customBody ?? meta.body

    const staleEndpoints: string[] = []
    let sent = 0

    initVapid()

    await Promise.allSettled(
      subs.map(async (row) => {
        if (row.type === 'fcm') {
          const ok = await sendFcm(row.endpoint, title, body)
          if (ok) sent++
          else staleEndpoints.push(row.endpoint)
        } else {
          // Web push
          try {
            const payload = JSON.stringify({ title, body, icon: ICON, badge: '/logo/android/launchericon-96x96.png', data: { type, restaurant_id } })
            await webpush.sendNotification(row.subscription as webpush.PushSubscription, payload)
            sent++
          } catch (err: unknown) {
            const e = err as { statusCode?: number }
            if (e?.statusCode === 410 || e?.statusCode === 404) staleEndpoints.push(row.endpoint)
          }
        }
      })
    )

    if (staleEndpoints.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return NextResponse.json({ ok: true, sent })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
