import type { RestaurantStatus } from '@/types'

export interface Restaurant {
  id: string
  name: string
  email: string | null
  phone: string | null
  plan: string
  status: RestaurantStatus
  created_at: string
  settings: Record<string, unknown>
}

export const PLAN_LABELS: Record<string, string> = {
  starter:      'Starter',
  professional: 'Professional',
  enterprise:   'Enterprise',
}

export const PLAN_OPTIONS = [
  { value: 'starter',      label: 'Starter — $49/mo' },
  { value: 'professional', label: 'Professional — $149/mo' },
  { value: 'enterprise',   label: 'Enterprise — $299/mo' },
]

export const EMPTY_FORM = {
  name: '', ownerName: '', email: '', phone: '', plan: 'professional', password: '',
}
