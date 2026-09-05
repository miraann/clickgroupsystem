'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'

type Permissions = Record<string, boolean>

interface PermissionsContextValue {
  permissions: Permissions
  roleName: string | null
  staffName: string | null
  isOwner: boolean
  isPinStaff: boolean
  can: (key: string) => boolean
  canAny: (prefix: string) => boolean
  loading: boolean
  reload: () => void
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: {},
  roleName: null,
  staffName: null,
  isOwner: false,
  isPinStaff: false,
  can: () => false,
  canAny: () => false,
  loading: true,
  reload: () => {},
})

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  // Shared restaurant row — lets the Supabase-auth branch below skip its own
  // `restaurants` query when the cache is already warm.
  const { restaurant } = useRestaurant()
  const restaurantRef = useRef(restaurant)
  restaurantRef.current = restaurant

  const [permissions, setPermissions] = useState<Permissions>({})
  const [roleName, setRoleName]       = useState<string | null>(null)
  const [staffName, setStaffName]     = useState<string | null>(null)
  const [isOwner, setIsOwner]         = useState(false)
  const [isPinStaff, setIsPinStaff]   = useState(false)
  const [loading, setLoading]         = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const restaurantId = localStorage.getItem('restaurant_id')
      if (!restaurantId) { setLoading(false); return }

      // ── Owner session (custom restaurant login — no Supabase Auth) ──
      // The restaurant-login page authenticates against restaurants.settings.password,
      // not Supabase Auth, so there is no Supabase session. Trust the localStorage
      // flag for UI access — actual data writes are protected at the API layer by
      // requireRestaurantAccess. A DB existence check here fails when RLS blocks
      // anonymous reads, incorrectly clearing the session.
      if (localStorage.getItem('owner_session') === 'true') {
        setIsOwner(true)
        setIsPinStaff(false)
        setRoleName('Owner')
        setStaffName(localStorage.getItem('restaurant_name') ?? null)
        setPermissions({})
        setLoading(false)
        return
      }

      // ── PIN staff login (no Supabase Auth session) ──────────
      // Re-fetch from DB to verify the staff member is real and get live permissions
      // instead of trusting localStorage values that could be tampered.
      const staffId = localStorage.getItem('pos_staff_id')
      if (staffId) {
        const { data: staffRecord } = await supabase
          .from('staff')
          .select('id, name, role_id, restaurant_roles(name, permissions)')
          .eq('id', staffId)
          .eq('restaurant_id', restaurantId)
          .maybeSingle()

        if (!staffRecord) {
          // Staff ID not found in this restaurant — clear the stale/tampered session
          localStorage.removeItem('pos_staff_id')
          localStorage.removeItem('pos_role_permissions')
          setLoading(false)
          return
        }

        const roleRaw = staffRecord.restaurant_roles
        const role = roleRaw
          ? ((Array.isArray(roleRaw) ? roleRaw[0] : roleRaw) as { name: string; permissions: Permissions })
          : null

        setPermissions(role?.permissions ?? {})
        setIsOwner(false)
        setIsPinStaff(true)
        setStaffName(localStorage.getItem('pos_staff_name') ?? null)
        setRoleName(role?.name ?? localStorage.getItem('pos_role_name') ?? localStorage.getItem('pos_staff_role') ?? null)
        setLoading(false)
        return
      }

      // ── Supabase Auth user (owner or manager with a real auth session) ──
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      let ownerId = restaurantRef.current?.owner_id ?? null
      if (ownerId == null) {
        const { data } = await supabase
          .from('restaurants')
          .select('owner_id')
          .eq('id', restaurantId)
          .maybeSingle()
        ownerId = (data?.owner_id as string | null) ?? null
      }

      if (ownerId === user.id) {
        setIsOwner(true)
        setIsPinStaff(false)
        setRoleName('Owner')
        setStaffName(null)
        setPermissions({})
        setLoading(false)
        return
      }

      const { data: staffRecord } = await supabase
        .from('restaurant_users')
        .select('role_id, restaurant_roles(name, permissions)')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (staffRecord?.role_id && staffRecord.restaurant_roles) {
        const raw = staffRecord.restaurant_roles
        const role = (Array.isArray(raw) ? raw[0] : raw) as { name: string; permissions: Permissions }
        setRoleName(role.name)
        setPermissions(role.permissions ?? {})
      } else {
        setRoleName(null)
        setPermissions({})
      }
      setIsPinStaff(false)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Owner always passes. PIN staff must have the permission explicitly set to true.
  const can = useCallback(
    (key: string) => {
      if (isOwner) return true
      return permissions[key] === true
    },
    [isOwner, permissions],
  )

  // Some permission tree entries are parent/group keys (e.g. "menu") that are
  // never themselves stored true — only their leaf children are (e.g.
  // "menu.item"). Use canAny to gate access on "has at least one permission
  // under this prefix", which works for both a real leaf key and a group key.
  const canAny = useCallback(
    (prefix: string) => {
      if (isOwner) return true
      if (permissions[prefix] === true) return true
      return Object.keys(permissions).some(k => k.startsWith(`${prefix}.`) && permissions[k] === true)
    },
    [isOwner, permissions],
  )

  return (
    <PermissionsContext.Provider value={{ permissions, roleName, staffName, isOwner, isPinStaff, can, canAny, loading, reload: load }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}

export function useCan(key: string) {
  const { can } = useContext(PermissionsContext)
  return can(key)
}
