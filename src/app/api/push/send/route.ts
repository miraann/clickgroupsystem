import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

// ── VAPID (browser web push) ──────────────────────────────────────
function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

// ── FCM v1 via service account JWT ───────────────────────────────
interface ServiceAccount {
  project_id:   string
  client_email: string
  private_key:  string
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const binary = atob(b64)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf.buffer
}

function toBase64Url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('base64url')
}

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  const header  = toBase64Url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = toBase64Url(Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    iat,
    exp:   iat + 3600,
  })))

  const signingInput = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const jwt = `${signingInput}.${toBase64Url(sig)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

async function sendFcmV1(fcmToken: string, title: string, body: string): Promise<boolean> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return false
  try {
    const sa: ServiceAccount = JSON.parse(raw)
    const accessToken = await getFcmAccessToken(sa)
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title, body },
            android: {
              priority: 'high',
              notification: { sound: 'default', channel_id: 'pos_alerts' },
            },
          },
        }),
      },
    )
    return res.ok
  } catch { return false }
}

// ── Notification types ────────────────────────────────────────────
export type NotifType = 'delivery' | 'waiter' | 'kds' | 'guest'

const NOTIF_META: Record<NotifType, { title: string; body: string }> = {
  delivery: { title: '🚚 New Delivery Order',  body: 'A new delivery order has been received.'      },
  waiter:   { title: '🔔 Waiter Call',          body: 'A guest is requesting assistance at a table.' },
  kds:      { title: '👨‍🍳 New Kitchen Order',   body: 'A new order has been sent to the KDS screen.' },
  guest:    { title: '📱 Guest Menu Order',     body: 'A new order arrived from the QR code menu.'   },
}

const ICON  = '/logo/android/launchericon-192x192.png'
const BADGE = '/logo/android/launchericon-96x96.png'

// ── Route handler ─────────────────────────────────────────────────
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

    // Check per-type preference
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

    const { title } = NOTIF_META[type]
    const body = customBody ?? NOTIF_META[type].body

    const staleEndpoints: string[] = []
    let sent = 0

    initVapid()

    await Promise.allSettled(
      subs.map(async (row) => {
        if (row.type === 'fcm') {
          const ok = await sendFcmV1(row.endpoint, title, body)
          if (ok) sent++
          else staleEndpoints.push(row.endpoint)
        } else {
          try {
            await webpush.sendNotification(
              row.subscription as webpush.PushSubscription,
              JSON.stringify({ title, body, icon: ICON, badge: BADGE, data: { type, restaurant_id } }),
            )
            sent++
          } catch (err: unknown) {
            const e = err as { statusCode?: number }
            if (e?.statusCode === 410 || e?.statusCode === 404) staleEndpoints.push(row.endpoint)
          }
        }
      }),
    )

    if (staleEndpoints.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return NextResponse.json({ ok: true, sent })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
