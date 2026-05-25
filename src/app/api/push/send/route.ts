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

const NOTIF_META: Record<NotifType, { title: string; body: string; icon: string }> = {
  delivery: { title: '🚚 New Delivery Order',   body: 'A new delivery order has been received.',     icon: '/logo/android/launchericon-192x192.png' },
  waiter:   { title: '🔔 Waiter Call',           body: 'A guest is requesting assistance at a table.', icon: '/logo/android/launchericon-192x192.png' },
  kds:      { title: '👨‍🍳 New Kitchen Order',    body: 'A new order has been sent to the KDS screen.', icon: '/logo/android/launchericon-192x192.png' },
  guest:    { title: '📱 Guest Menu Order',      body: 'A new order arrived from the QR code menu.',   icon: '/logo/android/launchericon-192x192.png' },
}

export async function POST(req: Request) {
  try {
    initVapid()
    const { restaurant_id, type, body: customBody } = await req.json() as {
      restaurant_id: string
      type: NotifType
      body?: string
    }

    if (!restaurant_id || !type || !NOTIF_META[type]) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    }

    const supabase = await createClient()

    // Check restaurant's notification preference for this type
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('settings')
      .eq('id', restaurant_id)
      .maybeSingle()

    const settings = (restaurant?.settings as Record<string, unknown>) ?? {}
    const prefKey = `push_notif_${type}` as const
    if (settings[prefKey] === false) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // Fetch all subscriptions for this restaurant
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('restaurant_id', restaurant_id)

    if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 })

    const meta = NOTIF_META[type]
    const payload = JSON.stringify({
      title: meta.title,
      body:  customBody ?? meta.body,
      icon:  meta.icon,
      badge: '/logo/android/launchericon-96x96.png',
      data:  { type, restaurant_id },
    })

    const staleEndpoints: string[] = []
    let sent = 0

    await Promise.allSettled(
      subs.map(async ({ subscription }) => {
        try {
          await webpush.sendNotification(subscription as webpush.PushSubscription, payload)
          sent++
        } catch (err: unknown) {
          const e = err as { statusCode?: number; endpoint?: string }
          if (e?.statusCode === 410 || e?.statusCode === 404) {
            staleEndpoints.push((subscription as { endpoint: string }).endpoint)
          }
        }
      })
    )

    // Clean up expired subscriptions
    if (staleEndpoints.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return NextResponse.json({ ok: true, sent })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
