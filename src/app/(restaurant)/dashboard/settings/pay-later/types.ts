import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'

export interface PayLater {
  id: string
  restaurant_id: string
  customer_name: string
  customer_phone: string | null
  order_ref: string | null
  table_num: string | null
  original_amount: number
  paid_amount: number
  due_date: string | null
  note: string | null
  status: 'pending' | 'partial' | 'paid'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  pay_later_id: string
  amount: number
  payment_method: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export const STATUS_CFG = {
  pending: { label: 'Pending', color: 'text-rose-400 bg-rose-500/15 border-rose-500/30',          icon: AlertCircle  },
  partial: { label: 'Partial', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30',       icon: Clock        },
  paid:    { label: 'Paid',    color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', icon: CheckCircle2 },
}

export const PAY_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Online', 'Other']

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function isOverdue(rec: PayLater) {
  if (rec.status === 'paid' || !rec.due_date) return false
  return new Date(rec.due_date) < new Date()
}
