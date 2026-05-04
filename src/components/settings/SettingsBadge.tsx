'use client'
import type { ReactNode } from 'react'

interface SettingsBadgeProps {
  icon: ReactNode
  size?: number
  active?: boolean
}

export function SettingsBadge({ icon, size = 44, active = false }: SettingsBadgeProps) {
  const glyphSize = Math.round(size * 0.62)

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {/* Radial glow halo */}
      <span
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: '-30%',
          background: active
            ? 'radial-gradient(closest-side, rgba(139,92,246,0.85), rgba(99,102,241,0.4) 50%, transparent 75%)'
            : 'radial-gradient(closest-side, rgba(251,191,36,0.55), transparent 70%)',
          filter: 'blur(6px)',
          zIndex: 0,
        }}
      />

      {/* Dark inner disk */}
      <span
        className="relative z-10 w-full h-full rounded-full overflow-hidden flex items-center justify-center"
        style={{
          background: active
            ? 'radial-gradient(circle at 30% 25%, rgba(167,139,250,0.35), rgba(99,102,241,0.10) 60%), linear-gradient(160deg, #6d28d9 0%, #3730a3 100%)'
            : 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%), linear-gradient(160deg, #14305e 0%, #061a40 100%)',
          border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: active
            ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(124,58,237,0.5)'
            : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 14px rgba(0,0,0,0.4)',
        }}
      >
        {/* Glyph */}
        <span
          className="relative z-20 flex items-center justify-center"
          style={{ width: glyphSize, height: glyphSize, lineHeight: 0 }}
        >
          {icon}
        </span>
      </span>
    </span>
  )
}
