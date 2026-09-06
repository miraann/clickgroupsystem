import 'server-only'
import { serviceClient } from '@/lib/supabase/service'
import type { RestaurantSession } from '@/lib/session'
import type { AuditAction } from '@/lib/logAudit'

/**
 * Server-side audit write for guarded API routes. The client `logAudit` can no
 * longer be trusted for mutations that now happen server-side, so each route
 * records its own entry from the verified session. Fire-and-forget.
 */
export async function logAuditServer(
  session: RestaurantSession,
  action: AuditAction,
  metadata: Record<string, unknown> = {},
  entityId?: string,
): Promise<void> {
  try {
    await serviceClient().from('audit_logs').insert({
      restaurant_id: session.rid,
      staff_id:      session.sid ?? null,
      staff_name:    session.role === 'owner' ? 'Owner' : null,
      staff_role:    session.role,
      action,
      entity_id:     entityId ?? null,
      metadata,
    })
  } catch (e) {
    console.error('[logAuditServer]', e)
  }
}
