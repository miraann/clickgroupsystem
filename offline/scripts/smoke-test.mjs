// End-to-end check of the offline edition against a running `npm run dev`,
// the demo restaurant (`npm run seed:demo`) and the fake printer
// (`npm run fake-printer`). It drives the same HTTP calls the POS screens make:
//
//   restaurant login → owner PIN → staff PIN → send to kitchen (RPC) →
//   kitchen ticket → pay (/api/payment/finalize) → receipt → daily sales,
//   while a second signed-in client watches the change feed (realtime).
//
//   cd offline && npm run smoke
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here    = path.dirname(fileURLToPath(import.meta.url))
const offline = path.resolve(here, '..')
const require = createRequire(path.join(offline, '..', 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const { PUBLIC_ANON_KEY } = require(path.join(offline, 'runtime', 'jwt.cjs'))

const BASE = process.env.OFFLINE_URL || 'http://127.0.0.1:4100'
// Must match offline/scripts/seed-demo.mjs.
const DEMO = { email: 'demo@clickgroup.local', password: 'demo12345', ownerPin: '123456', slug: 'demo', staffPin: '111111' }
const PRINTS = path.join(offline, '.data', 'fake-printer')

let failed = 0
const ok   = (m) => console.log(`  ✓ ${m}`)
const bad  = (m) => { failed++; console.log(`  ✗ ${m}`) }
const check = (cond, m, detail) => cond ? ok(m) : bad(detail ? `${m} — ${detail}` : m)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** A tiny cookie jar, so each "device" keeps its own login like a browser. */
function device() {
  const jar = new Map()
  async function call(p, body) {
    const res = await fetch(BASE + p, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    })
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';')
      const i = pair.indexOf('=')
      const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim()
      if (attrs.some(a => /max-age=0\b/i.test(a)) || value === '') jar.delete(name)
      else jar.set(name, value)
      if (attrs.some(a => a.trim().toLowerCase() === 'secure')) bad(`cookie ${name} is Secure — tablets on http would drop it`)
    }
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* html page */ }
    return { status: res.status, json, text }
  }
  /** The Supabase session that session-bridge put in the (possibly chunked) cookie. */
  function supabaseSession() {
    const base = 'sb-offline-auth-token'
    let raw = jar.get(base)
    if (!raw) {
      const parts = []
      for (let i = 0; jar.has(`${base}.${i}`); i++) parts.push(jar.get(`${base}.${i}`))
      raw = parts.join('')
    }
    if (!raw) return null
    raw = decodeURIComponent(raw)
    if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8')
    return JSON.parse(raw)
  }
  return { call, supabaseSession, jar }
}

async function signedInClient(session) {
  const sb = createClient(BASE, PUBLIC_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  if (error) throw error
  sb.realtime.setAuth(session.access_token)
  return sb
}

const printCount = () => (fs.existsSync(PRINTS) ? fs.readdirSync(PRINTS).length : 0)
async function waitForPrint(before, what) {
  for (let i = 0; i < 20 && printCount() <= before; i++) await sleep(150)
  check(printCount() > before, `${what} reached the printer`)
}
async function print(dev, route, body, what) {
  const before = printCount()
  const r = await dev.call(route, body)
  if (!r.json?.ok) return bad(`${what}: ${route} → ${r.status} ${r.json?.error ?? r.text.slice(0, 120)}`)
  const d = await dev.call('/api/print/dispatch', {
    bytes: r.json.bytes, connectionType: r.json.connectionType, printerName: r.json.printerName,
    ipAddress: r.json.ipAddress, port: r.json.port,
  })
  if (!d.json?.ok) return bad(`${what}: dispatch → ${d.status} ${d.json?.error ?? d.text.slice(0, 120)}`)
  await waitForPrint(before, what)
}

console.log(`Offline smoke test against ${BASE}`)

// ── 1. Restaurant login (email + password, then owner PIN) ─────────────────
console.log('1. Restaurant login')
const owner = device()
let r = await owner.call('/restaurant-login')
check(r.status === 200, 'login page renders', `HTTP ${r.status}`)
r = await owner.call('/api/restaurant/login', { email: DEMO.email, password: DEMO.password })
check(r.json?.requirePin, 'email + password accepted', JSON.stringify(r.json))
r = await owner.call('/api/restaurant/verify-pin', { pin: DEMO.ownerPin })
check(r.json?.ok, 'owner PIN accepted', JSON.stringify(r.json))
const rid = r.json?.restaurant?.id
const ownerSession = owner.supabaseSession()
check(!!ownerSession?.access_token, 'Supabase session cookie set (auth.uid() for RLS)')
r = await owner.call('/dashboard')
check(r.status === 200, 'dashboard opens with the session cookie', `HTTP ${r.status}`)

// ── 2. Staff PIN login (a second device, e.g. a waiter tablet) ─────────────
console.log('2. Staff PIN login')
const cashier = device()
r = await cashier.call(`/pos/${DEMO.slug}/login`)
check(r.status === 200, 'POS PIN page renders', `HTTP ${r.status}`)
r = await cashier.call('/api/pos/login', { slug: DEMO.slug, pin: DEMO.staffPin })
check(r.json?.ok && r.json?.staff?.name, `staff PIN accepted (${r.json?.staff?.name ?? '?'})`, JSON.stringify(r.json))
const staffId = r.json?.staff?.id
const cashierSession = cashier.supabaseSession()
check(!!cashierSession?.access_token, 'staff device has its own Supabase session')
r = await cashier.call('/api/pos/login', { slug: DEMO.slug, pin: '999999' })
check(r.status === 401, 'wrong PIN rejected', `HTTP ${r.status}`)

const pos     = await signedInClient(cashierSession)
const watcher = await signedInClient(ownerSession)

// RLS: the anon key alone sees no tenant data.
const anon = createClient(BASE, PUBLIC_ANON_KEY, { auth: { persistSession: false } })
const { data: anonRows } = await anon.from('orders').select('id')
check((anonRows ?? []).length === 0, 'anon key cannot read orders (RLS active)')
const { data: items, error: itemsErr } = await pos.from('menu_items').select('id, name, price').eq('restaurant_id', rid).order('sort_order')
check(!itemsErr && items?.length > 0, `signed-in device reads the menu (${items?.length ?? 0} items)`, itemsErr?.message)

// ── 7 (set up first). Second client listens for live changes ───────────────
const events = []
const channel = watcher.channel(`smoke-${Date.now()}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` },
      p => events.push(`orders:${p.eventType}:${p.new?.status ?? ''}`))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${rid}` },
      p => events.push(`tables:${p.new?.status}`))
const subscribed = await new Promise(res => {
  const t = setTimeout(() => res('TIMED_OUT'), 8000)
  channel.subscribe(s => { if (s !== 'CLOSED') { clearTimeout(t); res(s) } })
})
check(subscribed === 'SUBSCRIBED', 'second device subscribed to live changes', subscribed)

// ── 3. Open a table, add items, send to the kitchen ────────────────────────
console.log('3. Send to kitchen')
const table = 3
const picked = (items ?? []).slice(0, 2)
const { data: sent, error: sendErr } = await pos.rpc('pos_send_to_kitchen', {
  p_restaurant_id: rid, p_table_number: table, p_guests: 2,
  p_items: picked.map((it, i) => ({ menu_item_id: it.id, item_name: it.name, item_price: it.price, qty: i + 1 })),
})
check(!sendErr && sent?.order_id, `pos_send_to_kitchen created order ${sent?.order_num ?? ''} (total ${sent?.total ?? '?'})`, sendErr?.message)
const expected = picked.reduce((s, it, i) => s + Number(it.price) * (i + 1), 0)
check(Number(sent?.total) === expected, `order total recalculated by trigger (${expected})`, `got ${sent?.total}`)

// ── 5a. Kitchen ticket ─────────────────────────────────────────────────────
const now = new Date()
const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
await print(cashier, '/api/print/kitchen', {
  restaurantId: rid, tableNum: String(table), orderNum: sent?.order_num, timeStr, dateStr,
  items: picked.map((it, i) => ({ name: it.name, qty: i + 1 })), sentBy: 'Cashier',
}, 'kitchen ticket (Kurdish)')

// ── 4. Pay ─────────────────────────────────────────────────────────────────
console.log('4. Payment')
const { data: methods } = await pos.from('payment_methods').select('id, name').eq('restaurant_id', rid).eq('is_default', true)
r = await cashier.call('/api/payment/finalize', {
  orderId: sent?.order_id, restaurantId: rid, paymentMethodId: methods?.[0]?.id,
  amountPaid: 0, tableNum: String(table), guests: 2, staffId,
})
check(r.json?.ok && r.json?.invoiceNum, `paid, invoice ${r.json?.invoiceNum} for ${r.json?.finalTotal}`, JSON.stringify(r.json))
const paid = r.json ?? {}
const { data: inv } = await pos.from('invoices').select('invoice_num, total, cashier').eq('order_id', sent?.order_id).maybeSingle()
check(inv?.invoice_num === paid.invoiceNum, `invoice row saved (cashier ${inv?.cashier})`)
r = await cashier.call('/api/payment/finalize', {
  orderId: sent?.order_id, restaurantId: rid, paymentMethodId: methods?.[0]?.id,
  amountPaid: 0, tableNum: String(table), guests: 2, staffId,
})
check(r.json?.invoiceNum === paid.invoiceNum, 'paying twice returns the same invoice (no duplicate)')

// ── 5b. Receipt ────────────────────────────────────────────────────────────
await print(cashier, '/api/print/receipt', {
  restaurantId: rid, tableNum: String(table), guests: 2, invoiceNum: paid.invoiceNum, orderNum: paid.orderNum,
  cashier: paid.cashier, dateStr, timeStr,
  items: picked.map((it, i) => ({ name: it.name, qty: i + 1, price: Number(it.price) })),
  subtotal: paid.subtotal, discount: 0, surcharge: 0, tip: 0, total: paid.finalTotal,
  paymentMethod: paid.paymentMethodName, amountPaid: paid.amountPaid, change: paid.changeAmount, mode: 'receipt',
}, 'receipt (Kurdish)')

// ── 6. Daily sales ─────────────────────────────────────────────────────────
console.log('6. Daily sales')
const start = new Date(); start.setHours(0, 0, 0, 0)
const { data: today, error: dsErr } = await pos.from('invoices')
  .select('id,subtotal,discount,tip_amount,total,payment_method,cashier,items')
  .eq('restaurant_id', rid).gte('created_at', start.toISOString())
const revenue = (today ?? []).reduce((s, i) => s + Number(i.total), 0)
check(!dsErr && today?.length > 0, `today's invoices load (${today?.length ?? 0}, revenue ${revenue})`, dsErr?.message)
await print(owner, '/api/print/daily-sales', {
  restaurantId: rid, dateStr, timeStr, txCount: today?.length ?? 0, totalRevenue: revenue,
  avgOrder: revenue / Math.max(1, today?.length ?? 1), totalGuests: 2, totalDiscount: 0, totalTips: 0, totalChange: 0,
  byPayment: [{ method: paid.paymentMethodName, count: today?.length ?? 0, total: revenue }], orderTypes: [],
  memberCount: 0, memberTotal: 0, walkInCount: today?.length ?? 0, walkInTotal: revenue,
  topItems: [], byCashier: [], totalExpenses: 0, netProfit: revenue, avgDailySalesMonth: revenue, avgDailyExpenseMonth: 0,
}, 'daily sales report')

// ── 7. Realtime results ────────────────────────────────────────────────────
console.log('7. Live updates on the second device')
for (let i = 0; i < 20 && !(events.includes('orders:UPDATE:paid') && events.includes('tables:dirty')); i++) await sleep(150)
check(events.some(e => e.startsWith('orders:INSERT')), 'saw the new order appear')
check(events.includes('orders:UPDATE:paid'), 'saw the order become paid')
check(events.includes('tables:dirty'), 'saw the table turn "dirty" after payment')

// POS → customer display: the POS sends on a channel it never joined (realtime-js
// then posts to /realtime/v1/api/broadcast); the display listens on the socket.
const heard = []
const cfd = watcher.channel(`cfd-sync-${rid}`).on('broadcast', { event: 'table_change' }, ({ payload }) => heard.push(payload?.table))
await new Promise(res => cfd.subscribe(s => { if (s === 'SUBSCRIBED') res() }))
const sendRes = await pos.channel(`cfd-sync-${rid}`).send({ type: 'broadcast', event: 'table_change', payload: { table: String(table) } })
for (let i = 0; i < 20 && !heard.includes(String(table)); i++) await sleep(150)
check(sendRes === 'ok' && heard.includes(String(table)), 'POS → customer display broadcast arrives', `send=${sendRes} heard=${JSON.stringify(heard)}`)

// Tidy the table so the next run starts clean.
await pos.from('tables').update({ status: 'available' }).eq('restaurant_id', rid).eq('seq', table)
await watcher.removeAllChannels()

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
