export function getStaffHome(permissions: Record<string, boolean>, slug?: string): string {
  if (permissions['dashboard.access']) return '/dashboard'
  if (permissions['kds'])       return '/dashboard/kds'
  if (permissions['dine_in'])   return '/dashboard'
  if (permissions['delivery'])  return '/dashboard/delivery-orders'
  if (permissions['takeout'])   return '/dashboard/pending-orders'
  if (permissions['guests'])    return '/dashboard/guests'
  if (permissions['cfd'] && slug) return `/cfd/${slug}`
  return '/dashboard/unauthorized'
}
