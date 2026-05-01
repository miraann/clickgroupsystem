import { Timer, CheckCircle2, Users, XCircle, X } from 'lucide-react'

export interface Reservation {
  id: string
  guest_name: string
  guest_phone: string | null
  guest_email: string | null
  party_size: number
  date: string
  time: string
  table_id: string | null
  table_label: string | null
  note: string | null
  status: 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'
  created_at: string
}

export interface TableGroup {
  id: string
  name: string
}

export interface Table {
  id: string
  table_number: string
  name: string
  capacity: number
  group_id: string | null
}

export type StatusFilter = 'all' | 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: 'text-yellow-400',  bg: 'bg-yellow-500/15',  border: 'border-yellow-500/30',  icon: Timer       },
  confirmed: { label: 'Confirmed', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: CheckCircle2 },
  seated:    { label: 'Seated',    color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    icon: Users       },
  cancelled: { label: 'Cancelled', color: 'text-rose-400',    bg: 'bg-rose-500/15',    border: 'border-rose-500/30',    icon: XCircle     },
  no_show:   { label: 'No Show',   color: 'text-white/40',    bg: 'bg-white/8',        border: 'border-white/15',       icon: X           },
}

export function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayStr() { return new Date().toISOString().slice(0, 10) }
