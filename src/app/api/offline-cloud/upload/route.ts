import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'
import { serviceClient } from '@/lib/supabase/service'
import { serverError } from '@/lib/api-auth'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import { installForToken } from '@/lib/offlineCloud.server'
import upload from '../../../../../offline/runtime/upload.cjs'

export const runtime = 'nodejs'
export const maxDuration = 60

type Row = Record<string, unknown> & { id: string }
type Change = { rows?: Row[]; deleted?: string[] }
type Skipped = { table: string; id: string; reason: string }

const ORDER: string[] = upload.UPLOAD_TABLES   // parents before children
const WITH_RESTAURANT = new Set(['customers', 'members', 'orders', 'order_items', 'invoices', 'pay_later', 'expenses'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function idsIn(admin: SupabaseClient, table: string, ids: string[], restaurantId?: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    let q = admin.from(table).select('id').in('id', ids.slice(i, i + 100))
    if (restaurantId) q = q.eq('restaurant_id', restaurantId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    for (const r of data ?? []) out.add(r.id as string)
  }
  return out
}

/** Ids that exist in `table` but belong to another restaurant. */
async function foreignIds(admin: SupabaseClient, table: string, ids: string[], restaurantId: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin.from(table).select('id').in('id', ids.slice(i, i + 100)).neq('restaurant_id', restaurantId)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) out.add(r.id as string)
  }
  return out
}

// Sales made on a restaurant's offline PC, sent whenever it has internet
// (offline/runtime/upload.cjs). Idempotent: rows keep the PC's ids, so a
// resend updates instead of duplicating. Each PC may only write its own
// restaurant's rows.
export async function POST(req: NextRequest) {
  if (IS_OFFLINE_EDITION) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await rateLimit(req, 'offline-cloud/upload', 60, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const admin = serviceClient()
    const install = token ? await installForToken(admin, token) : null
    if (!install) return NextResponse.json({ error: 'This PC is not registered — set it up again.' }, { status: 401 })
    const rid = install.restaurantId

    const { changes } = await req.json() as { changes?: Record<string, Change> }
    const skipped: Skipped[] = []
    const skip = (table: string, id: string, reason: string) => skipped.push({ table, id, reason })

    for (const table of ORDER) {
      const change = changes?.[table]
      if (!change) continue
      let rows = (change.rows ?? []).filter(r => r && typeof r.id === 'string' && UUID.test(r.id))

      if (WITH_RESTAURANT.has(table)) {
        rows = rows.map(r => ({ ...r, restaurant_id: rid }))
        const foreign = await foreignIds(admin, table, rows.map(r => r.id), rid)
        rows = rows.filter(r => !foreign.has(r.id) || (skip(table, r.id, 'belongs to another restaurant'), false))
      }
      if (table === 'pay_later_payments') {
        const parents = await idsIn(admin, 'pay_later', [...new Set(rows.map(r => String(r.pay_later_id)))], rid)
        rows = rows.filter(r => parents.has(String(r.pay_later_id)) || (skip(table, r.id, 'pay-later account not found'), false))
      }
      if (table === 'order_items' || table === 'invoices') {
        const orders = await idsIn(admin, 'orders', [...new Set(rows.map(r => r.order_id).filter(Boolean).map(String))], rid)
        if (table === 'order_items') {
          rows = rows.filter(r => orders.has(String(r.order_id)) || (skip(table, r.id, 'order not uploaded'), false))
          // Menu items / kitchen stations added on the PC don't exist online.
          const menu = await idsIn(admin, 'menu_items', [...new Set(rows.map(r => r.menu_item_id).filter(Boolean).map(String))], rid)
          const stations = await idsIn(admin, 'kds_stations', [...new Set(rows.map(r => r.station_id).filter(Boolean).map(String))], rid)
          rows = rows.map(r => ({
            ...r,
            menu_item_id: r.menu_item_id && menu.has(String(r.menu_item_id)) ? r.menu_item_id : null,
            station_id:   r.station_id && stations.has(String(r.station_id)) ? r.station_id : null,
          }))
        } else {
          const customers = await idsIn(admin, 'customers', [...new Set(rows.map(r => r.customer_id).filter(Boolean).map(String))], rid)
          rows = rows.map(r => ({
            ...r,
            order_id:    r.order_id && orders.has(String(r.order_id)) ? r.order_id : null,
            customer_id: r.customer_id && customers.has(String(r.customer_id)) ? r.customer_id : null,
          }))
        }
      }

      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200)
        const { error } = await admin.from(table).upsert(chunk, { onConflict: 'id' })
        if (!error) continue
        // One bad row shouldn't hold back the rest: retry one by one.
        for (const r of chunk) {
          const { error: e1 } = await admin.from(table).upsert(r, { onConflict: 'id' })
          if (e1) skip(table, r.id, e1.message)
        }
      }

      const deleted = (change.deleted ?? []).filter(id => typeof id === 'string' && UUID.test(id))
      for (let i = 0; i < deleted.length; i += 100) {
        const chunk = deleted.slice(i, i + 100)
        if (WITH_RESTAURANT.has(table)) {
          await admin.from(table).delete().in('id', chunk).eq('restaurant_id', rid)
        } else if (table === 'pay_later_payments') {
          const { data } = await admin.from('pay_later_payments').select('id, pay_later_id').in('id', chunk)
          const parents = await idsIn(admin, 'pay_later', [...new Set((data ?? []).map(r => String(r.pay_later_id)))], rid)
          const ours = (data ?? []).filter(r => parents.has(String(r.pay_later_id))).map(r => r.id as string)
          if (ours.length) await admin.from('pay_later_payments').delete().in('id', ours)
        }
      }
    }

    await admin.from('offline_installs').update({ last_upload_at: new Date().toISOString() }).eq('id', install.id)
    return NextResponse.json({ ok: true, serverTime: Date.now(), skipped })
  } catch (e) {
    return serverError(e)
  }
}
