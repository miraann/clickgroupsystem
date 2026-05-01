import type { ComponentType } from 'react'
import { ShoppingCart, Zap, Truck, Users, Wrench, Coffee, LayoutGrid, Receipt, CheckCircle2, Clock, AlertCircle } from 'lucide-react'

export interface Category {
  id: string
  name: string
  color: string
  icon: string
}

export interface Expense {
  id: string
  restaurant_id: string
  title: string
  category_id: string | null
  amount: number
  payment_method: string | null
  status: 'paid' | 'pending' | 'scheduled'
  receipt_url: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export const BUILTIN_CATS: Category[] = [
  { id: 'supplies',  name: 'Supplies',   color: '#f59e0b', icon: 'ShoppingCart' },
  { id: 'utilities', name: 'Utilities',  color: '#3b82f6', icon: 'Zap'          },
  { id: 'delivery',  name: 'Delivery',   color: '#10b981', icon: 'Truck'        },
  { id: 'payroll',   name: 'Payroll',    color: '#8b5cf6', icon: 'Users'        },
  { id: 'repairs',   name: 'Repairs',    color: '#ef4444', icon: 'Wrench'       },
  { id: 'food',      name: 'Food & Bev', color: '#f97316', icon: 'Coffee'       },
  { id: 'other',     name: 'Other',      color: '#6b7280', icon: 'LayoutGrid'   },
]

export const CAT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  ShoppingCart, Zap, Truck, Users, Wrench, Coffee, LayoutGrid, Receipt,
}

export const STATUS_CFG = {
  paid:      { label: 'Paid',      color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', icon: CheckCircle2 },
  pending:   { label: 'Pending',   color: 'text-amber-400   bg-amber-500/15   border-amber-500/30',   icon: Clock        },
  scheduled: { label: 'Scheduled', color: 'text-blue-400    bg-blue-500/15    border-blue-500/30',    icon: AlertCircle  },
}

export const PAY_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Online', 'Other']
