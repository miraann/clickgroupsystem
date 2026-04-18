'use client'
import { usePermissions } from '@/lib/permissions/PermissionsContext'

interface PermissionGateProps {
  permission: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Renders children only if the logged-in staff has the given permission.
 * Owners always pass. Renders fallback (default: nothing) otherwise.
 *
 * Usage:
 *   <PermissionGate permission="delivery">
 *     <DeliveryButton />
 *   </PermissionGate>
 *
 *   <PermissionGate permission="menu.item" fallback={<span>No access</span>}>
 *     <ItemEditor />
 *   </PermissionGate>
 */
export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { can, loading } = usePermissions()
  if (loading) return null
  if (!can(permission)) return <>{fallback}</>
  return <>{children}</>
}
