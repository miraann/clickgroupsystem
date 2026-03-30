import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'active' | 'suspended' | 'trial' | 'expired' | 'default'
  className?: string
}

const variantMap = {
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  suspended: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  trial: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  expired: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  default: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      variantMap[variant],
      className
    )}>
      {children}
    </span>
  )
}
