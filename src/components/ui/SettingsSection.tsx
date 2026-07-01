import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface Props {
  title: string
  icon?: ReactNode
  children: ReactNode
  color?: string
}

export function SettingsSection({ title, icon, children, color = 'bg-white/8' }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
      <div className={cn('px-5 py-3.5 border-b border-white/10 flex items-center gap-2', color)}>
        {icon}
        <p className="text-xs font-semibold text-white/80 uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}
