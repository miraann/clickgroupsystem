import type { ReactNode } from 'react'

interface Props {
  title: string
  /** Optional icon rendered left of the title (pass a Lucide element). */
  icon?: ReactNode
  children: ReactNode
}

export function SettingsSection({ title, icon, children }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/8 bg-white/3 flex items-center gap-2">
        {icon}
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}
