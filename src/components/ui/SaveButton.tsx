'use client'
import { Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { SaveState } from '@/hooks/useRestaurantSettings'

interface Props {
  state: SaveState
  onClick: () => void
  large?: boolean
  className?: string
}

export function SaveButton({ state, onClick, large, className }: Props) {
  const { t } = useLanguage()
  return (
    <button
      onClick={onClick}
      disabled={state === 'saving'}
      className={cn(
        'flex items-center gap-2 font-semibold transition-all active:scale-95 rounded-xl disabled:cursor-wait',
        large ? 'px-6 py-3 text-sm' : 'px-5 py-2.5 text-sm',
        state === 'saved'  && 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400',
        state === 'error'  && 'bg-rose-500/20    border border-rose-500/30    text-rose-400',
        state === 'saving' && 'bg-amber-500 text-white opacity-70',
        state === 'idle'   && 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25',
        className,
      )}
    >
      {state === 'saving' && <Loader2    className="w-4 h-4 animate-spin" />}
      {state === 'saved'  && <CheckCircle2 className="w-4 h-4" />}
      {state === 'error'  && <AlertCircle  className="w-4 h-4" />}
      {state === 'idle'   && <Save         className="w-4 h-4" />}
      {state === 'saving' ? t.saving_
        : state === 'saved'  ? t.saved_
        : state === 'error'  ? t.error_retry
        : t.save_changes}
    </button>
  )
}
