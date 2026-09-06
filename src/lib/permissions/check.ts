// Shared permission-check logic — used by both the client PermissionsContext
// (canAny) and the server-side requirePermission guard, so the two can never
// drift apart.
//
// Role permissions are stored as a flat Record<string, boolean>. Some entries in
// the permission tree are parent/group keys (e.g. "menu", "settings.users") that
// are never themselves stored true — only their leaf children are (e.g.
// "menu.item"). `hasPermission` treats a key as granted when it is set true
// directly OR when any leaf under `${key}.` is true.

export type PermissionMap = Record<string, boolean>

export function hasPermission(perms: PermissionMap, key: string): boolean {
  if (perms[key] === true) return true
  const prefix = `${key}.`
  return Object.keys(perms).some(k => k.startsWith(prefix) && perms[k] === true)
}
