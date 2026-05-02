import { createClient } from '@/lib/supabase/client'

export type AuditAction =
  // Generic CRUD (entity specified in metadata.entity)
  | 'add'
  | 'edit'
  | 'delete'
  | 'toggle'
  | 'update_settings'
  | 'print'
  // Order-specific
  | 'void_item'
  | 'edit_price'
  | 'apply_discount'
  | 'transfer_item'
  | 'send_to_kitchen'
  | 'payment'
  | 'print_bill'

export function logAudit(
  restaurantId: string,
  action: AuditAction,
  metadata: Record<string, unknown> = {},
  entityId?: string,
) {
  if (typeof window === 'undefined') return

  const staffId   = localStorage.getItem('pos_staff_id')
  const staffName = localStorage.getItem('pos_staff_name')
    ?? (localStorage.getItem('owner_session') === 'true' ? 'Owner' : null)
  const staffRole = localStorage.getItem('pos_staff_role')
    ?? (localStorage.getItem('owner_session') === 'true' ? 'owner' : null)

  const supabase = createClient()
  supabase.from('audit_logs').insert({
    restaurant_id: restaurantId,
    staff_id:      staffId,
    staff_name:    staffName,
    staff_role:    staffRole,
    action,
    entity_id:     entityId ?? null,
    metadata,
  }).then(() => {}) // fire-and-forget — never block user actions
}
