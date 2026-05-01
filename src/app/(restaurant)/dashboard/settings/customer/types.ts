export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  birthday: string | null
  tags: string[]
  notes: string | null
  blacklisted: boolean
  visit_count: number
  total_spent: number
  status: 'active' | 'inactive'
  created_at: string
}

export const PRESET_TAGS = ['VIP', 'Regular', 'New', 'Corporate', 'Online', 'Delivery']
