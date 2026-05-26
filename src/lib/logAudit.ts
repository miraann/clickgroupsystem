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
  | 'pay_later'
  // KDS
  | 'kds_cooking'
  | 'kds_ready'
  // Delivery
  | 'delivery_confirmed'
  | 'delivery_out'
  | 'delivery_delivered'
  | 'delivery_cancelled'
  // Pending orders (guest / QR)
  | 'pending_approved'
  | 'pending_declined'
  // Public-facing events (no staff session)
  | 'guest_order'
  | 'waiter_call'
  | 'delivery_order'

interface LogOverrides { staffName?: string; staffRole?: string }

export function logAudit(
  restaurantId: string,
  action: AuditAction,
  metadata: Record<string, unknown> = {},
  entityId?: string,
  overrides?: LogOverrides,
) {
  if (typeof window === 'undefined') return

  const staffId   = localStorage.getItem('pos_staff_id')
  const staffName = overrides?.staffName
    ?? localStorage.getItem('pos_staff_name')
    ?? (localStorage.getItem('owner_session') === 'true' ? 'Owner' : null)
  const staffRole = overrides?.staffRole
    ?? localStorage.getItem('pos_staff_role')
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
