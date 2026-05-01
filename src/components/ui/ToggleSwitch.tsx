'use client'
import { cn } from '@/lib/utils'

interface Props {
  on: boolean
  onChange: (v: boolean) => void
  /** Tailwind bg class applied when the toggle is ON. Defaults to amber (project primary). */
  activeColor?: string
}

export function ToggleSwitch({ on, onChange, activeColor = 'bg-amber-500' }: Props) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors focus:outline-none shrink-0',
        on ? activeColor : 'bg-white/15',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
