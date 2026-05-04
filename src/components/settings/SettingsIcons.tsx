// Colorful illustrative icon glyphs for the settings tile grid.
// Each is a self-contained colored SVG sized to fill its container.
import type { ReactNode } from 'react'

export const SettingsIcons: Record<string, ReactNode> = {
  home: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M10 30 L32 12 L54 30 V52 a4 4 0 0 1-4 4 H14 a4 4 0 0 1-4-4 Z" fill="#fb923c"/>
      <path d="M10 30 L32 12 L54 30 L48 30 L32 18 L16 30 Z" fill="#f97316"/>
      <rect x="26" y="38" width="12" height="18" rx="1.5" fill="#7c2d12"/>
      <rect x="28" y="40" width="3.5" height="5" fill="#fde68a"/>
      <rect x="32.5" y="40" width="3.5" height="5" fill="#fde68a"/>
      <circle cx="36" cy="48" r="0.9" fill="#fde68a"/>
    </svg>
  ),
  sliders: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <rect x="10" y="14" width="44" height="4" rx="2" fill="#a78bfa"/>
      <rect x="10" y="30" width="44" height="4" rx="2" fill="#a78bfa"/>
      <rect x="10" y="46" width="44" height="4" rx="2" fill="#a78bfa"/>
      <circle cx="22" cy="16" r="6" fill="#c4b5fd" stroke="#5b21b6" strokeWidth="1.5"/>
      <circle cx="42" cy="32" r="6" fill="#c4b5fd" stroke="#5b21b6" strokeWidth="1.5"/>
      <circle cx="28" cy="48" r="6" fill="#c4b5fd" stroke="#5b21b6" strokeWidth="1.5"/>
    </svg>
  ),
  monitor: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <rect x="6" y="10" width="52" height="36" rx="3" fill="#0ea5e9"/>
      <rect x="10" y="14" width="44" height="26" rx="1.5" fill="#7dd3fc"/>
      <path d="M14 32 L22 24 L28 28 L36 18 L46 28" stroke="#0c4a6e" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="24" y="46" width="16" height="6" fill="#38bdf8"/>
      <rect x="18" y="52" width="28" height="3" rx="1.5" fill="#0284c7"/>
    </svg>
  ),
  utensils: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M22 8 L22 26 a4 4 0 0 0 4 4 V56" stroke="#fb923c" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d="M16 8 V22" stroke="#fb923c" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M28 8 V22" stroke="#fb923c" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M44 8 c-6 4-8 12-4 18 c2 3 6 4 6 4 V56" stroke="#f97316" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  coffee: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M12 22 H44 V42 a10 10 0 0 1-10 10 H22 a10 10 0 0 1-10-10 Z" fill="#fbbf24"/>
      <path d="M44 26 H50 a6 6 0 0 1 0 12 H44" fill="none" stroke="#fbbf24" strokeWidth="4"/>
      <path d="M18 8 c-2 4 2 6 0 10" stroke="#fde68a" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M28 8 c-2 4 2 6 0 10" stroke="#fde68a" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M38 8 c-2 4 2 6 0 10" stroke="#fde68a" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="28" cy="28" rx="14" ry="3" fill="#92400e" opacity="0.5"/>
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <rect x="4" y="20" width="32" height="22" rx="2" fill="#22d3ee"/>
      <path d="M36 26 H50 L58 34 V42 H36 Z" fill="#06b6d4"/>
      <rect x="40" y="28" width="10" height="6" rx="1" fill="#67e8f9"/>
      <circle cx="16" cy="46" r="6" fill="#1e293b"/>
      <circle cx="16" cy="46" r="2.5" fill="#94a3b8"/>
      <circle cx="46" cy="46" r="6" fill="#1e293b"/>
      <circle cx="46" cy="46" r="2.5" fill="#94a3b8"/>
    </svg>
  ),
  bag: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M16 22 H48 L52 56 H12 Z" fill="#fb7185"/>
      <path d="M16 22 H48 L46 28 H18 Z" fill="#f43f5e"/>
      <path d="M22 22 V18 a10 10 0 0 1 20 0 V22" stroke="#fda4af" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <circle cx="26" cy="34" r="2" fill="#fff"/>
      <circle cx="38" cy="34" r="2" fill="#fff"/>
    </svg>
  ),
  wine: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M20 8 H44 a0 0 0 0 1 0 0 c0 14-6 22-12 22 s-12-8-12-22 Z" fill="#e879f9"/>
      <path d="M22 8 H42 c0 8-3 14-6 16 c-2-1-3-4-3-7 c0-3 1-6-3-8 c-3-2-6-1-8-1 Z" fill="#f0abfc" opacity="0.6"/>
      <line x1="32" y1="30" x2="32" y2="50" stroke="#a21caf" strokeWidth="3"/>
      <ellipse cx="32" cy="52" rx="10" ry="3" fill="#a21caf"/>
    </svg>
  ),
  cal: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <rect x="8" y="12" width="48" height="44" rx="3" fill="#34d399"/>
      <rect x="8" y="12" width="48" height="12" fill="#10b981"/>
      <rect x="16" y="6" width="4" height="12" rx="1.5" fill="#065f46"/>
      <rect x="44" y="6" width="4" height="12" rx="1.5" fill="#065f46"/>
      <rect x="14" y="30" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="24" y="30" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="34" y="30" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="44" y="30" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="14" y="40" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="24" y="40" width="6" height="6" rx="1" fill="#065f46"/>
      <rect x="34" y="40" width="6" height="6" rx="1" fill="#fff"/>
    </svg>
  ),
  pulse: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <rect x="6" y="12" width="52" height="34" rx="3" fill="#0ea5e9"/>
      <rect x="10" y="16" width="44" height="26" rx="1.5" fill="#082f49"/>
      <path d="M12 30 L20 30 L24 22 L30 38 L34 30 L42 30 L46 26 L52 26" stroke="#7dd3fc" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="22" y="48" width="20" height="4" fill="#0284c7"/>
      <rect x="16" y="52" width="32" height="3" rx="1" fill="#0c4a6e"/>
    </svg>
  ),
  box: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M32 10 L54 22 V44 L32 56 L10 44 V22 Z" fill="#a78bfa"/>
      <path d="M32 10 L54 22 L32 34 L10 22 Z" fill="#c4b5fd"/>
      <path d="M32 34 L54 22 V44 L32 56 Z" fill="#8b5cf6" opacity="0.85"/>
      <path d="M21 16 L43 28" stroke="#5b21b6" strokeWidth="2" opacity="0.4"/>
    </svg>
  ),
  bars: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <rect x="10" y="36" width="10" height="20" rx="1.5" fill="#34d399"/>
      <rect x="22" y="26" width="10" height="30" rx="1.5" fill="#10b981"/>
      <rect x="34" y="18" width="10" height="38" rx="1.5" fill="#34d399"/>
      <rect x="46" y="10" width="10" height="46" rx="1.5" fill="#10b981"/>
      <path d="M8 22 L20 18 L34 12 L52 4" stroke="#34d399" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M48 4 L54 4 L54 10" stroke="#34d399" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  dollar: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M22 14 c0-4 4-6 10-6 s10 2 10 6 v0 H22 Z" fill="#3b0764"/>
      <ellipse cx="32" cy="14" rx="10" ry="3" fill="#1e1b4b"/>
      <path d="M14 22 C20 16 28 16 32 16 s12 0 18 6 c4 8 4 22 0 28 c-6 6-14 6-18 6 s-12 0-18-6 c-4-6-4-20 0-28 Z" fill="#fbbf24"/>
      <text x="32" y="46" textAnchor="middle" fontSize="22" fontWeight="900" fill="#78350f" fontFamily="ui-sans-serif,system-ui">$</text>
    </svg>
  ),
  card: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <rect x="6" y="14" width="52" height="36" rx="4" fill="#818cf8"/>
      <rect x="6" y="20" width="52" height="8" fill="#3730a3"/>
      <rect x="12" y="36" width="14" height="6" rx="1" fill="#fde68a"/>
      <rect x="12" y="44" width="20" height="2.5" rx="1" fill="#c7d2fe"/>
      <circle cx="46" cy="42" r="5" fill="#f97316" opacity="0.9"/>
      <circle cx="52" cy="42" r="5" fill="#fbbf24" opacity="0.9"/>
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M14 6 H50 V58 L44 54 L38 58 L32 54 L26 58 L20 54 L14 58 Z" fill="#f8fafc"/>
      <rect x="20" y="14" width="24" height="3" rx="1" fill="#475569"/>
      <rect x="20" y="22" width="24" height="2" rx="1" fill="#94a3b8"/>
      <rect x="20" y="28" width="24" height="2" rx="1" fill="#94a3b8"/>
      <rect x="20" y="34" width="24" height="2" rx="1" fill="#94a3b8"/>
      <rect x="20" y="42" width="24" height="3" rx="1" fill="#fb923c"/>
    </svg>
  ),
  ban: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <circle cx="32" cy="32" r="22" fill="none" stroke="#ef4444" strokeWidth="6"/>
      <line x1="17" y1="17" x2="47" y2="47" stroke="#ef4444" strokeWidth="6" strokeLinecap="round"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <circle cx="20" cy="22" r="8" fill="#22d3ee"/>
      <circle cx="44" cy="22" r="8" fill="#06b6d4"/>
      <path d="M6 50 c0-8 6-14 14-14 s14 6 14 14 v6 H6 Z" fill="#22d3ee"/>
      <path d="M30 50 c0-8 6-14 14-14 s14 6 14 14 v6 H30 Z" fill="#06b6d4"/>
    </svg>
  ),
  star: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <polygon points="32,6 40,24 60,26 45,40 50,60 32,50 14,60 19,40 4,26 24,24" fill="#facc15"/>
      <polygon points="32,6 40,24 60,26 45,40 50,60 32,50 32,6" fill="#eab308"/>
    </svg>
  ),
  user: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <circle cx="32" cy="22" r="11" fill="#2dd4bf"/>
      <path d="M10 56 c0-12 10-20 22-20 s22 8 22 20 v2 H10 Z" fill="#14b8a6"/>
    </svg>
  ),
  cog: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M32 6 l4 4 h6 l2 5 5 2 v6 l4 4-4 4 v6 l-5 2-2 5 h-6 l-4 4-4-4 h-6 l-2-5-5-2 v-6 l-4-4 4-4 v-6 l5-2 2-5 h6 Z" fill="#a78bfa"/>
      <circle cx="32" cy="32" r="9" fill="#1e1b4b"/>
      <circle cx="32" cy="32" r="4" fill="#c4b5fd"/>
    </svg>
  ),
  db: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <ellipse cx="32" cy="14" rx="20" ry="6" fill="#34d399"/>
      <path d="M12 14 V28 c0 3.3 9 6 20 6 s20-2.7 20-6 V14" fill="#10b981"/>
      <ellipse cx="32" cy="28" rx="20" ry="6" fill="#34d399"/>
      <path d="M12 28 V42 c0 3.3 9 6 20 6 s20-2.7 20-6 V28" fill="#10b981"/>
      <ellipse cx="32" cy="42" rx="20" ry="6" fill="#34d399"/>
      <path d="M12 42 V52 c0 3.3 9 6 20 6 s20-2.7 20-6 V42" fill="#059669"/>
      <ellipse cx="32" cy="52" rx="20" ry="6" fill="#34d399"/>
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M8 56 L12 44 a22 22 0 1 1 8 8 Z" fill="#25d366"/>
      <path d="M22 22 c-2 1-2 4-1 6 c2 4 6 8 10 10 c2 1 5 1 6-1 l1-2 c0-1-1-1-2-2 l-3-1 c-1 0-2 1-3 0 c-1 0-3-2-4-3 c-1-1-2-3-2-4 c0-1 1-1 1-2 c1-1 0-2 0-3 l-1-2 c-1-1-2-1-2 0 Z" fill="#fff"/>
    </svg>
  ),
}
