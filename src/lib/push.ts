import { IS_OFFLINE_EDITION } from '@/lib/edition'

export function sendPush(restaurantId: string, type: 'delivery' | 'waiter' | 'guest') {
  // Push messages are delivered over the internet; the offline edition has none.
  if (IS_OFFLINE_EDITION) return
  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurant_id: restaurantId, type }),
    // Fired right as the guest's order goes through; keepalive lets it finish
    // even if they close the tab or lock the phone straight after.
    keepalive: true,
  }).catch(() => {})
}
