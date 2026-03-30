import { LucideIcon } from 'lucide-react'

interface SettingsPlaceholderProps {
  icon: LucideIcon
  title: string
  description: string
  color?: 'amber' | 'indigo' | 'emerald' | 'violet' | 'rose' | 'cyan'
  comingSoon?: string[]
}

const colorMap = {
  amber: { icon: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/25', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  indigo: { icon: 'text-indigo-400', bg: 'bg-indigo-500/15', border: 'border-indigo-500/25', badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' },
  emerald: { icon: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/25', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  violet: { icon: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/25', badge: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  rose: { icon: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/25', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
  cyan: { icon: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/25', badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
}

export function SettingsPlaceholder({ icon: Icon, title, description, color = 'amber', comingSoon = [] }: SettingsPlaceholderProps) {
  const c = colorMap[color]
  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl ${c.bg} border ${c.border} flex items-center justify-center shrink-0`}>
          <Icon size={22} className={c.icon} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-white/40 mt-1 text-sm">{description}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/8" />

      {/* Coming soon sections */}
      {comingSoon.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-5 space-y-3">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">What&apos;s coming here</p>
          <div className="flex flex-wrap gap-2">
            {comingSoon.map((f) => (
              <span key={f} className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-xs font-medium ${c.badge}`}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder content block */}
      <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex items-center justify-between px-5 py-4 ${i !== 3 ? 'border-b border-white/5' : ''}`}>
            <div className="space-y-1.5">
              <div className={`h-3 rounded-full bg-white/10 animate-pulse`} style={{ width: `${80 + i * 30}px` }} />
              <div className="h-2.5 rounded-full bg-white/5 animate-pulse" style={{ width: `${120 + i * 20}px` }} />
            </div>
            <div className="w-10 h-5 rounded-full bg-white/8 animate-pulse" />
          </div>
        ))}
      </div>

      <p className="text-xs text-white/20 text-center">This section will be configured in a later step</p>
    </div>
  )
}
