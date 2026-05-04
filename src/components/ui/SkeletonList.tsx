import { cn } from '@/lib/utils'

export function SkeletonList({
  rows = 4,
  className,
  rowHeight = 'h-[62px]',
}: {
  rows?: number
  className?: string
  rowHeight?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn('skeleton-shimmer rounded-2xl', rowHeight)}
          style={{ animationDelay: `${i * 0.06}s` }}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({
  className,
  height = 'h-32',
}: {
  className?: string
  height?: string
}) {
  return (
    <div className={cn('skeleton-shimmer rounded-2xl', height, className)} />
  )
}
