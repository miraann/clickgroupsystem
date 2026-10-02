import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'
import { getRestaurantSession } from '@/lib/api-auth'

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

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
  return Buffer.from(bytes).toString('base64url')
}

// One OAuth token serves every FCM send from this (warm) instance for its ~1h
// lifetime, instead of minting one per device per notification.
let fcmAuth: { token: string; expiresAt: number } | null = null

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (fcmAuth && fcmAuth.expiresAt > Date.now() + 60_000) return fcmAuth.token
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
  const data = await res.json() as { access_token?: string; expires_in?: number }
  if (!res.ok || !data.access_token) throw new Error(`FCM OAuth failed: HTTP ${res.status}`)
  fcmAuth = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return fcmAuth.token
}

// 'stale' = FCM says the token itself is dead (delete the row). 'failed' is
// anything else — quota, 5xx, network, bad config — and must NOT delete it:
// dropping a live device on a transient error is what left phones silent
// until the app was reopened and re-registered.
type SendResult = 'sent' | 'stale' | 'failed'

interface FcmErrorBody {
  error?: { message?: string; details?: { errorCode?: string }[] }
}

function isDeadToken(status: number, err: FcmErrorBody | null): boolean {
  const codes = err?.error?.details?.map(d => d.errorCode) ?? []
  if (codes.includes('UNREGISTERED') || codes.includes('SENDER_ID_MISMATCH')) return true
  return status === 400 && /registration token/i.test(err?.error?.message ?? '')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function sendFcmV1(
  sa: ServiceAccount, accessToken: string, fcmToken: string,
  title: string, body: string, data: Record<string, string>,
): Promise<SendResult> {
  const payload = JSON.stringify({
    message: {
      token: fcmToken,
      // A `notification` block is what lets Android show the alert while the
      // app is backgrounded or killed: the FCM SDK posts it to the tray
      // itself, no app code (or WebView) has to run.
      notification: { title, body },
      // Read on tap by PushNavigation. FCM data values must be strings.
      data,
      android: {
        // HIGH is delivered at once and wakes the device from Doze; NORMAL can
        // wait in FCM until the next maintenance window or app open.
        priority: 'high',
        notification: {
          channel_id: 'pos_alerts',
          sound: 'default',
          default_vibrate_timings: true,
          notification_priority: 'PRIORITY_MAX',
          visibility: 'PUBLIC',
        },
      },
      // No iOS app yet; this is what one would need. A visible alert is
      // push-type `alert` at priority 10 — `background` / content-available
      // pushes are throttled by iOS and never reach a force-quit app.
      apns: {
        headers: { 'apns-push-type': 'alert', 'apns-priority': '10' },
        payload: { aps: { sound: 'default' } },
      },
    },
  })

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: payload,
      })
    } catch (e) {
      if (attempt === 0) { await sleep(500); continue }
      console.error('[push] FCM network error', e)
      return 'failed'
    }
    if (res.ok) return 'sent'

    const err = await res.json().catch(() => null) as FcmErrorBody | null
    if (isDeadToken(res.status, err)) return 'stale'
    if ((res.status === 429 || res.status >= 500) && attempt === 0) { await sleep(1000); continue }
    console.error('[push] FCM send failed', res.status, err?.error?.message)
    return 'failed'
  }
  return 'failed'
}

// ── Notification types ────────────────────────────────────────────
export type NotifType = 'delivery' | 'waiter' | 'guest'

const NOTIF_META: Record<NotifType, { title: string; body: string; url: string }> = {
  delivery: { title: '🚚 New Delivery Order',  body: 'A new delivery order has been received.',       url: '/dashboard/delivery-orders' },
  waiter:   { title: '🔔 Waiter Call',          body: 'A guest is requesting assistance at a table.',  url: '/dashboard'                 },
  guest:    { title: '📱 Guest Menu Order',     body: 'A new order arrived from the QR code menu.',    url: '/dashboard/pending-orders'  },
}

// The audit_logs row each public event writes (guest_place_delivery_order,
// pos_send_to_kitchen, fn_waiter_call_audit) — proof the event just happened.
const EVENT_ACTION: Record<NotifType, string> = {
  delivery: 'delivery_order',
  waiter:   'waiter_call',
  guest:    'guest_order',
}

const ICON  = '/logo/android/launchericon-192x192.png'
const BADGE = '/logo/android/launchericon-96x96.png'

const clampText = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 140)

// ── Route handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Rate-limit: max 30 push sends per minute per IP
  if (!(await rateLimit(req, 'push/send', 30, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { restaurant_id, type, body: customBody, title: customTitle, staff_id } = await req.json() as {
      restaurant_id: string
      type: NotifType
      body?: string
      title?: string
      staff_id?: string
    }

    if (!restaurant_id || !type || !NOTIF_META[type]) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    }

    // Trusted = a signed-in member of THIS restaurant (dashboard / POS).
    // Untrusted = the public guest-menu / waiter-call / delivery-order pages,
    // which legitimately need to fire this endpoint but must not be able to
    // choose the notification text or target a specific device.
    const session = await getRestaurantSession()
    const trusted = !!session && session.rid === restaurant_id

    // Service role: this route validates the caller itself (signed session
    // for trusted callers, a real recent orders/waiter_calls row for guest
    // callers) rather than relying on table-level anon RLS, so it no longer
    // needs an anon SELECT policy on push_subscriptions.
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )

    // Verify restaurant exists and fetch settings in one query
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, settings')
      .eq('id', restaurant_id)
      .maybeSingle()

    if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })

    if (!trusted) {
      // Per-restaurant throttle for the public path.
      if (!(await rateLimit(req, `push/send:rid:${restaurant_id}`, 12, 60_000))) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      }
      // Tie the notification to a real, recent event so it can't be used as a
      // standalone spam trigger. Failing open on a query error keeps the
      // feature working if the schema differs. Not orders.created_at: a guest
      // ordering another round at a table whose order opened earlier reuses
      // that order row, so its push was skipped as "no recent event".
      const since = new Date(Date.now() - 5 * 60_000).toISOString()
      const { count, error: evErr } = await supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant_id)
        .eq('action', EVENT_ACTION[type])
        .gte('created_at', since)
      if (!evErr && (count ?? 0) === 0) {
        return NextResponse.json({ ok: true, skipped: 'no recent event' })
      }
    }

    // Check per-type notification preference
    const settings = (restaurant.settings as Record<string, unknown>) ?? {}
    if (settings[`push_notif_${type}`] === false) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    let subsQuery = supabase
      .from('push_subscriptions')
      .select('endpoint, type, subscription')
      .eq('restaurant_id', restaurant_id)

    // Driver dispatch: target only the assigned staff member's device(s).
    // Only trusted callers (the dashboard) may narrow the target.
    if (trusted && staff_id) subsQuery = subsQuery.eq('staff_id', staff_id)

    const { data: subs } = await subsQuery

    if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 })

    const { url } = NOTIF_META[type]
    const title = clampText(trusted ? (customTitle ?? NOTIF_META[type].title) : NOTIF_META[type].title)
    const body = clampText(trusted ? (customBody ?? NOTIF_META[type].body) : NOTIF_META[type].body)

    const staleEndpoints: string[] = []
    let sent = 0

    initVapid()

    // One OAuth token for the whole batch. If it can't be had, skip FCM this
    // time but keep every device registered.
    let fcm: { sa: ServiceAccount; accessToken: string } | null = null
    if (subs.some(row => row.type === 'fcm') && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa: ServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        fcm = { sa, accessToken: await getFcmAccessToken(sa) }
      } catch (e) {
        console.error('[push] FCM auth unavailable', e)
      }
    }

    await Promise.allSettled(
      subs.map(async (row) => {
        if (row.type === 'fcm') {
          if (!fcm) return
          const result = await sendFcmV1(fcm.sa, fcm.accessToken, row.endpoint, title, body, { url, type, restaurant_id })
          if (result === 'sent') sent++
          else if (result === 'stale') staleEndpoints.push(row.endpoint)
        } else {
          try {
            await webpush.sendNotification(
              row.subscription as webpush.PushSubscription,
              JSON.stringify({ title, body, icon: ICON, badge: BADGE, data: { type, restaurant_id, url } }),
              // `high` makes the push service deliver now even to a phone in
              // battery saver / Doze (Chrome on Android maps it to a
              // high-priority FCM message); the default `normal` may be held
              // until the device wakes on its own.
              { urgency: 'high' },
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
