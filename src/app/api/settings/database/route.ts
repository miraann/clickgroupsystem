import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, OWNER_ONLY } from '@/lib/permissions/server'
import { serverError } from '@/lib/api-auth'
import { serviceClient } from '@/lib/supabase/service'
import { logAuditServer } from '@/lib/logAudit.server'
import { verifySecret } from '@/lib/crypto'
import type { RestaurantSession } from '@/lib/session'

// Backup / restore / retention wipe / GDPR delete. Owner session required
// (enforced here, not just the client `ownerOnly` flag). The catastrophic action
// — deleting all customer PII — also re-verifies the owner PIN server-side.

const EXPORT_TABLES = [
  'menu_categories', 'menu_items', 'staff', 'tables', 'table_groups',
  'customers', 'members', 'reservations', 'discounts', 'payment_methods',
  'surcharges', 'void_reasons', 'kitchen_notes', 'customer_feedback',
  'delivery_zones', 'inventory_categories', 'inventory_items',
]
const GDPR_TABLES = ['customers', 'members', 'reservations', 'customer_feedback']
const RESTORE_MAX_ROWS = 50_000

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requirePermission(OWNER_ONLY)
    if (error) return error

    const body = (await req.json()) as {
      action?: 'export' | 'wipe-orders' | 'gdpr-delete' | 'restore'
      pin?: string
      retention_days?: number
      tables?: Record<string, unknown[]>
    }
    const sb = serviceClient()

    switch (body.action) {
      case 'export': {
        const result: Record<string, unknown[]> = {}
        const { data: orders } = await sb
          .from('orders').select('*, order_items(*)').eq('restaurant_id', session.rid)
        result.orders = orders ?? []
        await Promise.all(EXPORT_TABLES.map(async (table) => {
          const { data } = await sb.from(table).select('*').eq('restaurant_id', session.rid)
          result[table] = data ?? []
        }))
        await logAuditServer(session, 'print', { entity: 'db_export' })
        return NextResponse.json({ exported_at: new Date().toISOString(), restaurant_id: session.rid, tables: result })
      }

      case 'wipe-orders': {
        const days = Number(body.retention_days)
        if (!Number.isFinite(days) || days < 1) {
          return NextResponse.json({ error: 'retention_days must be a positive number.' }, { status: 400 })
        }
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - days)
        const { count, error: delErr } = await sb
          .from('orders')
          .delete({ count: 'exact' })
          .eq('restaurant_id', session.rid)
          .in('status', ['completed', 'cancelled', 'void'])
          .lt('created_at', cutoff.toISOString())
        if (delErr) return serverError(delErr)
        await logAuditServer(session, 'delete', { entity: 'orders_retention', days, deleted: count ?? 0 })
        return NextResponse.json({ deleted: count ?? 0 })
      }

      case 'gdpr-delete': {
        if (!(await verifyOwnerPin(session, body.pin))) {
          return NextResponse.json({ error: 'Incorrect owner PIN.' }, { status: 403 })
        }
        await Promise.all(GDPR_TABLES.map(t =>
          sb.from(t).delete().eq('restaurant_id', session.rid),
        ))
        await logAuditServer(session, 'delete', { entity: 'gdpr_customer_data' })
        return NextResponse.json({ ok: true })
      }

      case 'restore': {
        if (!(await verifyOwnerPin(session, body.pin))) {
          return NextResponse.json({ error: 'Incorrect owner PIN.' }, { status: 403 })
        }
        const tables = body.tables
        if (!tables || typeof tables !== 'object') {
          return NextResponse.json({ error: 'tables payload is required.' }, { status: 400 })
        }
        const total = Object.values(tables).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0)
        if (total > RESTORE_MAX_ROWS) {
          return NextResponse.json({ error: `Backup too large (>${RESTORE_MAX_ROWS} rows).` }, { status: 413 })
        }
        // Force restaurant_id on every row so a tampered backup can't inject into
        // another tenant.
        const stamp = (rows: unknown[]) =>
          (rows as Record<string, unknown>[]).map(r => ({ ...r, restaurant_id: session.rid }))

        for (const [table, rows] of Object.entries(tables)) {
          if (!Array.isArray(rows) || rows.length === 0) continue
          if (table === 'orders') {
            const orderRows = stamp(rows.map((r) => {
              const rest = { ...(r as Record<string, unknown>) }
              delete rest.order_items
              return rest
            }))
            const items = stamp(rows.flatMap((r) => ((r as Record<string, unknown>).order_items ?? []) as unknown[]))
            await sb.from('orders').upsert(orderRows, { onConflict: 'id' })
            if (items.length) await sb.from('order_items').upsert(items, { onConflict: 'id' })
          } else {
            await sb.from(table).upsert(stamp(rows), { onConflict: 'id' })
          }
        }
        await logAuditServer(session, 'add', { entity: 'db_restore', rows: total })
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    return serverError(e)
  }
}

async function verifyOwnerPin(session: RestaurantSession, pin: string | undefined): Promise<boolean> {
  if (!pin || !/^\d{4,8}$/.test(pin)) return false
  const sb = serviceClient()
  const [{ data: secret }, { data: rest }] = await Promise.all([
    sb.from('restaurant_secrets').select('owner_pin_hash').eq('restaurant_id', session.rid).maybeSingle(),
    sb.from('restaurants').select('settings').eq('id', session.rid).maybeSingle(),
  ])
  const hash = secret?.owner_pin_hash as string | undefined
  const legacy = (rest?.settings as Record<string, unknown> | null)?.owner_pin as string | undefined
  if (hash) return verifySecret(pin, hash)
  if (legacy) return pin === legacy
  return false
}
