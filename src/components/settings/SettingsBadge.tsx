'use client'
import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// Selectable looks for the settings-home tile icons. Stored per restaurant in
// settings.settings_icon_style; 'orb' is the original design.
export const SETTINGS_ICON_STYLES = ['orb', 'glass', 'vibrant', 'neon', 'soft', 'clay', 'line', 'mono'] as const
export type SettingsIconStyle = typeof SETTINGS_ICON_STYLES[number]

export function toIconStyle(v: unknown): SettingsIconStyle {
  return SETTINGS_ICON_STYLES.includes(v as SettingsIconStyle) ? v as SettingsIconStyle : 'orb'
}

interface SettingsBadgeProps {
  icon: ReactNode          // illustrated colour glyph
  lineIcon?: LucideIcon    // single-colour glyph for the flat styles
  accent?: string          // #rrggbb
  variant?: SettingsIconStyle
  size?: number
  active?: boolean
}

function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// Mix toward white (amt > 0) or black (amt < 0) — for gradient stops
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

export function SettingsBadge({
  icon, lineIcon, accent = '#f59e0b', variant = 'orb', size = 44, active = false,
}: SettingsBadgeProps) {
  if (variant === 'orb') return <OrbBadge icon={icon} size={size} active={active} />

  const Line = lineIcon
  const squircle = size * 0.3

  // Container look, glyph scale and glyph colour per style. `line: null`
  // means the style shows the illustrated glyph.
  let box: CSSProperties = {}
  let scale = 0.5
  let line: { color: string; stroke: number; glow?: string } | null = null

  switch (variant) {
    case 'glass':
      box = {
        borderRadius: squircle,
        background: 'linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 22px -8px ${alpha(accent, 0.55)}`,
        backdropFilter: 'blur(10px)',
      }
      scale = 0.6
      break
    case 'vibrant':
      box = {
        borderRadius: squircle,
        background: `linear-gradient(145deg, ${shade(accent, 0.25)} 0%, ${accent} 50%, ${shade(accent, -0.25)} 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 18px ${alpha(accent, 0.45)}`,
      }
      line = { color: '#ffffff', stroke: 2.2 }
      scale = 0.52
      break
    case 'neon':
      box = {
        borderRadius: '50%',
        background: 'rgba(3,7,18,0.6)',
        border: `2px solid ${accent}`,
        boxShadow: `0 0 14px ${alpha(accent, 0.65)}, inset 0 0 12px ${alpha(accent, 0.35)}`,
      }
      line = { color: shade(accent, 0.2), stroke: 2, glow: `drop-shadow(0 0 4px ${alpha(accent, 0.9)})` }
      break
    case 'soft':
      box = {
        borderRadius: squircle,
        background: alpha(accent, 0.16),
        border: `1px solid ${alpha(accent, 0.3)}`,
      }
      line = { color: shade(accent, 0.25), stroke: 2 }
      break
    case 'clay':
      // Glossy pearl tinted with the accent, lit from the top-left
      box = {
        borderRadius: '50%',
        background: `radial-gradient(circle at 30% 25%, #ffffff 0%, ${shade(accent, 0.82)} 42%, ${shade(accent, 0.55)} 100%)`,
        boxShadow: `inset -4px -6px 10px ${alpha(accent, 0.35)}, inset 3px 4px 8px rgba(255,255,255,0.9), 0 10px 22px rgba(0,0,0,0.45)`,
      }
      scale = 0.58
      break
    case 'line':
      line = { color: shade(accent, 0.15), stroke: 1.75 }
      scale = 0.7
      break
    case 'mono':
      box = {
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.14)',
      }
      line = { color: 'rgba(255,255,255,0.9)', stroke: 1.8 }
      scale = 0.48
      break
  }

  const glyphSize = Math.round(size * scale)

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, ...box }}
    >
      <span
        className="relative flex items-center justify-center"
        style={{
          width: glyphSize, height: glyphSize, lineHeight: 0,
          filter: line?.glow ?? (variant === 'clay' ? 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' : undefined),
        }}
      >
        {line && Line
          ? <Line width="100%" height="100%" color={line.color} strokeWidth={line.stroke} />
          : icon}
      </span>
    </span>
  )
}

// The original design: dark navy disk, amber glow halo, illustrated glyph
function OrbBadge({ icon, size, active }: { icon: ReactNode; size: number; active: boolean }) {
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
