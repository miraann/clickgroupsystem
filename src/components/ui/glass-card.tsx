import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glow?: boolean
}

export function GlassCard({ children, className, hover = false, glow = false }: GlassCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl',
        hover && 'transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:shadow-2xl cursor-pointer',
        glow && 'shadow-[0_0_30px_rgba(99,102,241,0.15)]',
        className
      )}
    >
      {children}
    </div>
  )
}

export function GlassCardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-6 py-5 border-b border-white/10', className)}>
      {children}
    </div>
  )
}

export function GlassCardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-6 py-5', className)}>
      {children}
    </div>
  )
}
