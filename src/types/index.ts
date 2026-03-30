export type SystemRole = 'seller' | 'owner' | 'manager' | 'cashier' | 'waiter'

export type RestaurantStatus = 'active' | 'suspended' | 'trial' | 'expired'

export interface Restaurant {
  id: string
  name: string
  owner_id: string
  status: RestaurantStatus
  plan: 'starter' | 'professional' | 'enterprise'
  created_at: string
  address?: string
  phone?: string
  email?: string
  logo_url?: string
  settings?: Record<string, unknown>
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: SystemRole
  restaurant_id?: string
  avatar_url?: string
  created_at: string
}

export interface RestaurantUser {
  id: string
  restaurant_id: string
  user_id: string
  role: 'owner' | 'manager' | 'cashier' | 'waiter'
  profile?: Profile
}
