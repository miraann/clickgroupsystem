import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; positive: boolean }
  color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan'
}

const colorMap = {
  indigo: { bg: 'bg-indigo-500/20', icon: 'text-indigo-400', glow: 'shadow-indigo-500/20' },
  emerald: { bg: 'bg-emerald-500/20', icon: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
  amber: { bg: 'bg-amber-500/20', icon: 'text-amber-400', glow: 'shadow-amber-500/20' },
  rose: { bg: 'bg-rose-500/20', icon: 'text-rose-400', glow: 'shadow-rose-500/20' },
  violet: { bg: 'bg-violet-500/20', icon: 'text-violet-400', glow: 'shadow-violet-500/20' },
  cyan: { bg: 'bg-cyan-500/20', icon: 'text-cyan-400', glow: 'shadow-cyan-500/20' },
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, color = 'indigo' }: StatCardProps) {
  const colors = colorMap[color]
  return (
    <div className={cn(
      'relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6',
      'hover:bg-white/8 hover:border-white/15 transition-all duration-300',
      `shadow-lg ${colors.glow}`
    )}>
      {/* Background glow effect */}
      <div className={cn('absolute inset-0 rounded-2xl opacity-20 blur-xl', colors.bg)} />

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-white/50 uppercase tracking-wider">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-white/40">{subtitle}</p>}
          {trend && (
            <div className={cn(
              'mt-3 flex items-center gap-1 text-sm font-medium',
              trend.positive ? 'text-emerald-400' : 'text-rose-400'
            )}>
              <span>{trend.positive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}% from last month</span>
            </div>
          )}
        </div>
        <div className={cn('p-3 rounded-xl', colors.bg)}>
          <Icon className={cn('w-6 h-6', colors.icon)} />
        </div>
      </div>
    </div>
  )
}
