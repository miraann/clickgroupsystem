export function sendPush(restaurantId: string, type: 'delivery' | 'waiter' | 'kds' | 'guest') {
  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurant_id: restaurantId, type }),
  }).catch(() => {})
}
