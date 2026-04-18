export function getStaffHome(permissions: Record<string, boolean>, restaurantId?: string): string {
  if (permissions['dashboard.access']) return '/dashboard'
  if (permissions['kds'])       return '/dashboard/kds'
  if (permissions['dine_in'])   return '/dashboard'
  if (permissions['delivery'])  return '/dashboard/delivery-orders'
  if (permissions['takeout'])   return '/dashboard/pending-orders'
  if (permissions['guests'])    return '/dashboard/guests'
  if (permissions['cfd'] && restaurantId) return `/cfd/${restaurantId}`
  return '/dashboard/unauthorized'
}
