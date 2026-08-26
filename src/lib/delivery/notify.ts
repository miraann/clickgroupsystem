import { createClient } from '@/lib/supabase/client'

export type DeliveryStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled'

interface DriverPushTarget {
  staffId: string
}

/**
 * Web Push + Sound alert to the driver assigned to a delivery order.
 * Fire-and-forget, mirrors the existing sendPush() convention in src/lib/push.ts
 * but targets a single staff member's subscription(s) instead of the whole
 * restaurant, via the staff_id column added in supabase-delivery-notifications.sql.
 */
export function notifyDriver(restaurantId: string, target: DriverPushTarget, status: DeliveryStatus, body: string) {
  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: restaurantId,
      type: 'delivery',
      staff_id: target.staffId,
      body,
      title: status === 'out_for_delivery' ? '🚗 Order Ready for Pickup' : '🚚 New Delivery Assigned',
    }),
  }).catch(() => {})
}

/**
 * WhatsApp deep-link message for a given delivery status transition. Kept
 * separate from the delivery-orders page's manual template resolver
 * (resolveTemplate/buildWhatsAppUrl) — this is the auto-generated message
 * used for one-tap "send status update" actions.
 */
export function buildStatusWhatsAppMessage(params: {
  status: DeliveryStatus
  orderNum: string | null
  customerName: string
  driverName?: string | null
  restaurantName?: string
}): string {
  const { status, orderNum, customerName, driverName, restaurantName } = params
  const orderRef = orderNum ? `#${orderNum}` : 'your order'
  const from = restaurantName ? ` from ${restaurantName}` : ''

  switch (status) {
    case 'confirmed':
      return `Hi ${customerName}, your order ${orderRef}${from} has been confirmed and is being prepared. 👨‍🍳`
    case 'preparing':
      return `Hi ${customerName}, we're preparing your order ${orderRef} now. 🍳`
    case 'out_for_delivery':
      return `Hi ${customerName}, your order ${orderRef} is on the way!${driverName ? ` Driver: ${driverName}.` : ''} 🚗💨`
    case 'delivered':
      return `Hi ${customerName}, your order ${orderRef} has been delivered. Enjoy your meal! 🎉`
    case 'cancelled':
      return `Hi ${customerName}, unfortunately your order ${orderRef} was cancelled. Please contact us for details.`
    default:
      return `Hi ${customerName}, update on your order ${orderRef}.`
  }
}

export function buildWhatsAppDeepLink(customerPhone: string, message: string): string {
  let phone = customerPhone.replace(/\D/g, '')
  if (phone.startsWith('07') && phone.length === 11) phone = '964' + phone.slice(1)
  else if (phone.startsWith('7') && phone.length === 10) phone = '964' + phone
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

/**
 * Subscribe to delivery_notifications for a single delivery_order_id
 * (customer-facing tracking screen). Returns an unsubscribe function.
 */
export function subscribeCustomerDeliveryNotifications(
  deliveryOrderId: string,
  onNotification: (message: string, type: string) => void,
) {
  const supabase = createClient()
  const channel = supabase
    .channel(`delivery-notif-${deliveryOrderId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'delivery_notifications', filter: `delivery_order_id=eq.${deliveryOrderId}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        const row = payload.new
        if (row?.recipient_type === 'customer') onNotification(row.message, row.type)
      },
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}
