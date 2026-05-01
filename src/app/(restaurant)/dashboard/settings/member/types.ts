export interface Member {
  id: string
  name: string
  phone: string | null
  email: string | null
  points: number
  tier: string
  birthday: string | null
  notes: string | null
  status: 'active' | 'inactive'
  created_at: string
}

export const TIERS = ['Standard', 'Silver', 'Gold', 'Platinum']

export const TIER_COLORS: Record<string, string> = {
  Standard: 'bg-white/10 text-white/60',
  Silver:   'bg-slate-400/15 text-slate-300',
  Gold:     'bg-amber-400/15 text-amber-400',
  Platinum: 'bg-violet-400/15 text-violet-400',
}
