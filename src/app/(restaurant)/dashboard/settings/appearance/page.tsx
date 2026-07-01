'use client'
import React, { useEffect } from 'react'
import { Palette, Check, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { SaveButton } from '@/components/ui/SaveButton'
import { SettingsSection } from '@/components/ui/SettingsSection'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

// ── Types & defaults ────────────────────────────────────────────
interface AppearanceSettings {
  primary_color:        string
  sidebar_style:        'default' | 'midnight' | 'colorful' | 'purple' | 'custom'
                        | 'gradient-ocean' | 'gradient-sunset' | 'gradient-emerald' | 'gradient-galaxy'
                        | 'gradient-aurora' | 'gradient-rose'
  sidebar_custom_color: string
  sidebar_custom_type:  'gradient' | 'solid'
  table_design:         'glass' | 'vibrant' | 'glow' | 'minimal'
  nav_button_style:     'glass' | 'vibrant' | 'neon' | 'crystal'
}

const DEFAULTS: AppearanceSettings = {
  primary_color:        '#f59e0b',
  sidebar_style:        'default',
  sidebar_custom_color: '#022658',
  sidebar_custom_type:  'solid',
  table_design:         'glass',
  nav_button_style:     'glass',
}

// ── Options ─────────────────────────────────────────────────────

const BG_PRESETS = [
  { id: 'default',  labelKey: 'app_style_navy',     bg: '#022658',     previewBg: '#022658'  },
  { id: 'midnight', labelKey: 'app_style_midnight',  bg: '#09090b',     previewBg: '#09090b'  },
  { id: 'colorful', labelKey: 'app_style_colorful',  bg: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', previewBg: '#302b63' },
  { id: 'purple',   labelKey: 'app_style_purple',    bg: '#3b0764',     previewBg: '#3b0764'  },
] as const

const GRADIENT_PRESETS = [
  { id: 'gradient-ocean',   label: 'Ocean',   bg: 'linear-gradient(135deg, #050c18 0%, #1e3a8a 45%, #050c18 100%)',            anchor: '#050c18' },
  { id: 'gradient-sunset',  label: 'Sunset',  bg: 'linear-gradient(135deg, #120303 0%, #7f1d1d 40%, #4a1505 100%)',            anchor: '#120303' },
  { id: 'gradient-emerald', label: 'Emerald', bg: 'linear-gradient(135deg, #011a14 0%, #065f46 45%, #011a14 100%)',            anchor: '#011a14' },
  { id: 'gradient-galaxy',  label: 'Galaxy',  bg: 'linear-gradient(135deg, #08061a 0%, #312e81 45%, #08061a 100%)',            anchor: '#08061a' },
  { id: 'gradient-aurora',  label: 'Aurora',  bg: 'linear-gradient(135deg, #021a1a 0%, #134e4a 35%, #2e1065 70%, #021a1a 100%)', anchor: '#021a1a' },
  { id: 'gradient-rose',    label: 'Rose',    bg: 'linear-gradient(135deg, #110309 0%, #831843 45%, #110309 100%)',            anchor: '#110309' },
] as const

const TABLE_DESIGNS = [
  {
    id: 'glass',
    label: 'Glass',
    desc:  'Frosted glassmorphism',
  },
  {
    id: 'vibrant',
    label: 'Vibrant',
    desc:  'Bold solid color fills',
  },
  {
    id: 'glow',
    label: 'Table Shape',
    desc:  'Real top-down table view',
  },
  {
    id: 'minimal',
    label: 'Neon',
    desc:  'Glowing neon accent borders',
  },
] as const

const NAV_BUTTON_DESIGNS = [
  { id: 'glass',   label: 'Glass',   desc: 'Subtle frosted glass'       },
  { id: 'vibrant', label: 'Vibrant', desc: 'Primary color accent fill'  },
  { id: 'neon',    label: 'Neon',    desc: 'Dark with glowing border'   },
  { id: 'crystal', label: 'Crystal', desc: 'Bright frosted surface'     },
] as const

// ── Demo tables for the live preview ────────────────────────────
const DEMO_TABLES: { n: string; status: string; shape: 'round' | 'square' | 'rect' }[] = [
  { n: 'T1', status: 'available', shape: 'round'  },
  { n: 'T2', status: 'occupied',  shape: 'square' },
  { n: 'T3', status: 'reserved',  shape: 'square' },
  { n: 'T4', status: 'occupied',  shape: 'rect'   },
  { n: 'T5', status: 'available', shape: 'round'  },
  { n: 'T6', status: 'bill',      shape: 'square' },
  { n: 'T7', status: 'occupied',  shape: 'square' },
  { n: 'T8', status: 'dirty',     shape: 'round'  },
  { n: 'T9', status: 'available', shape: 'square' },
]

// ── Helpers ──────────────────────────────────────────────────────
function hexAlpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function computeBg(style: string, customColor: string, customType: 'gradient' | 'solid'): string {
  if (style === 'default')  return '#022658'
  if (style === 'midnight') return '#09090b'
  if (style === 'colorful') return 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)'
  if (style === 'purple')   return '#3b0764'
  const gp = GRADIENT_PRESETS.find(g => g.id === style)
  if (gp) return gp.bg
  if (customType === 'gradient') {
    const r = parseInt(customColor.slice(1, 3), 16)
    const g = parseInt(customColor.slice(3, 5), 16)
    const b = parseInt(customColor.slice(5, 7), 16)
    return `linear-gradient(135deg, rgb(${Math.floor(r*.2)},${Math.floor(g*.2)},${Math.floor(b*.2)}) 0%, ${customColor} 55%, rgb(${Math.floor(r*.3)},${Math.floor(g*.3)},${Math.floor(b*.3)}) 100%)`
  }
  return customColor
}

function anchorColor(style: string, customColor: string, customType: 'gradient' | 'solid') {
  if (style === 'default')  return '#022658'
  if (style === 'midnight') return '#09090b'
  if (style === 'colorful') return '#24243e'
  if (style === 'purple')   return '#3b0764'
  const gp = GRADIENT_PRESETS.find(g => g.id === style)
  if (gp) return gp.anchor
  return customType === 'solid' ? customColor : '#0d0d0d'
}

// ── Mini SVG for glow/table-shape preview ────────────────────────
function MiniTableSvg({ shape, color }: { shape: 'round' | 'square' | 'rect'; color: string }) {
  const seat: React.CSSProperties = { fill: color, opacity: 0.55 }
  const back: React.CSSProperties = { fill: color, opacity: 0.85 }
  const tb:   React.CSSProperties = { fill: color, fillOpacity: 0.18, stroke: color, strokeWidth: 2.5, strokeOpacity: 0.95 }

  const chairs4 = (
    <>
      <rect x={40} y={1}  width={20} height={6}  rx={3} style={back} />
      <rect x={38} y={7}  width={24} height={13} rx={4} style={seat} />
      <rect x={38} y={80} width={24} height={13} rx={4} style={seat} />
      <rect x={40} y={93} width={20} height={6}  rx={3} style={back} />
      <rect x={1}  y={40} width={6}  height={20} rx={3} style={back} />
      <rect x={7}  y={38} width={13} height={24} rx={4} style={seat} />
      <rect x={80} y={38} width={13} height={24} rx={4} style={seat} />
      <rect x={93} y={40} width={6}  height={20} rx={3} style={back} />
    </>
  )

  if (shape === 'round') {
    return (
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
        {chairs4}
        <circle cx={50} cy={50} r={26} style={tb} />
      </svg>
    )
  }
  if (shape === 'rect') {
    return (
      <svg viewBox="0 0 160 100" style={{ width: '100%', height: '100%' }}>
        <rect x={70} y={1}   width={20} height={6}  rx={3} style={back} />
        <rect x={68} y={7}   width={24} height={13} rx={4} style={seat} />
        <rect x={68} y={80}  width={24} height={13} rx={4} style={seat} />
        <rect x={70} y={93}  width={20} height={6}  rx={3} style={back} />
        <rect x={1}   y={40} width={6}  height={20} rx={3} style={back} />
        <rect x={7}   y={38} width={13} height={24} rx={4} style={seat} />
        <rect x={140} y={38} width={13} height={24} rx={4} style={seat} />
        <rect x={153} y={40} width={6}  height={20} rx={3} style={back} />
        <rect x={22}  y={22} width={116} height={56} rx={8} style={tb} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
      {chairs4}
      <rect x={22} y={22} width={56} height={56} rx={7} style={tb} />
    </svg>
  )
}

// ── Mini table cells for design previews ─────────────────────────
function MiniDesignPreview({ design, primary }: { design: string; primary: string }) {
  // Table Shape (glow) design: show real SVG table illustrations
  if (design === 'glow') {
    const items: { shape: 'round' | 'square' | 'rect'; color: string }[] = [
      { shape: 'round',  color: '#10b981' },
      { shape: 'square', color: primary   },
      { shape: 'rect',   color: '#818cf8' },
    ]
    return (
      <div className="flex items-center gap-1.5 justify-center">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg overflow-hidden"
            style={{ width: item.shape === 'rect' ? 44 : 30, height: 30, background: 'transparent' }}>
            <MiniTableSvg shape={item.shape} color={item.color} />
          </div>
        ))}
      </div>
    )
  }

  const statuses = ['occupied', 'available', 'reserved']
  const bgOcc  = (a: number) => hexAlpha(primary, a)
  const cells  = statuses.map(s => {
    if (design === 'glass') return {
      style: s === 'occupied'
        ? { background: bgOcc(0.18), border: `1.5px solid ${bgOcc(0.5)}`, color: primary }
        : s === 'available'
        ? { background: 'rgba(16,185,129,0.12)', border: '1.5px solid rgba(16,185,129,0.4)', color: '#34d399' }
        : { background: 'rgba(99,102,241,0.12)', border: '1.5px solid rgba(99,102,241,0.4)', color: '#818cf8' },
    }
    if (design === 'vibrant') return {
      style: s === 'occupied'
        ? { background: primary, boxShadow: `0 2px 8px ${bgOcc(0.5)}` }
        : s === 'available'
        ? { background: '#059669' }
        : { background: '#4338ca' },
    }
    // neon
    return {
      style: s === 'occupied'
        ? { background: 'rgba(0,0,0,0.30)', border: `1.5px solid ${bgOcc(0.90)}`, boxShadow: `0 0 6px ${bgOcc(0.40)}` }
        : s === 'available'
        ? { background: 'rgba(0,0,0,0.30)', border: '1.5px solid rgba(16,185,129,0.90)', boxShadow: '0 0 6px rgba(16,185,129,0.40)' }
        : { background: 'rgba(0,0,0,0.30)', border: '1.5px solid rgba(129,140,248,0.90)', boxShadow: '0 0 6px rgba(129,140,248,0.40)' },
    }
  })

  return (
    <div className="flex items-center gap-1.5 justify-center">
      {cells.map((c, i) => (
        <div key={i} className="rounded-lg flex items-center justify-center"
          style={{ width: 30, height: 26, ...c.style }} />
      ))}
    </div>
  )
}

// ── Mini nav-button preview cells ───────────────────────────────
const VIBRANT_NAV_COLORS = ['#f59e0b','#6366f1','#10b981','#f97316']

function MiniNavPreview({ style, primary }: { style: string; primary: string }) {
  if (style === 'vibrant') {
    return (
      <div className="flex items-center gap-2 justify-center">
        {VIBRANT_NAV_COLORS.map((c, i) => (
          <div key={i} className="w-8 h-8 rounded-xl" style={{ background: c, boxShadow: `0 3px 8px ${hexAlpha(c, 0.42)}` }} />
        ))}
      </div>
    )
  }
  const bgA = (a: number) => hexAlpha(primary, a)
  const btn: React.CSSProperties = style === 'neon'
    ? { background: 'rgba(0,0,0,0.45)', border: `1.5px solid ${bgA(0.72)}`, boxShadow: `0 0 6px ${bgA(0.28)}` }
    : style === 'crystal'
    ? { background: 'linear-gradient(135deg,rgba(255,255,255,0.15) 0%,rgba(255,255,255,0.05) 100%)', border: '1.5px solid rgba(255,255,255,0.24)' }
    : { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.11)' }
  const dot = style === 'neon' ? primary : style === 'crystal' ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.36)'
  return (
    <div className="flex items-center gap-2 justify-center">
      {[0,1,2,3].map(i => (
        <div key={i} className="w-8 h-8 rounded-xl flex items-center justify-center" style={btn}>
          <div className="w-3 h-3 rounded-md" style={{ background: dot }} />
        </div>
      ))}
    </div>
  )
}

// ── Live mini-dashboard preview ─────────────────────────────────
function DashboardPreview({
  primaryColor,
  sidebarStyle,
  sidebarCustomColor,
  sidebarCustomType,
  tableDesign,
  navButtonStyle,
}: {
  primaryColor:       string
  sidebarStyle:       string
  sidebarCustomColor: string
  sidebarCustomType:  'gradient' | 'solid'
  tableDesign:        'glass' | 'vibrant' | 'glow' | 'minimal'
  navButtonStyle:     'glass' | 'vibrant' | 'neon' | 'crystal'
}) {
  const bg     = computeBg(sidebarStyle, sidebarCustomColor, sidebarCustomType)
  const anchor = anchorColor(sidebarStyle, sidebarCustomColor, sidebarCustomType)

  const tableStyle = (status: string): React.CSSProperties => {
    const pc = primaryColor
    if (tableDesign === 'vibrant') {
      const fills: Record<string, string> = { occupied: pc, available: '#059669', reserved: '#4338ca', bill: '#b91c1c', dirty: '#9f1239' }
      return { background: fills[status] || '#059669', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }
    }
    if (tableDesign === 'glow') {
      return { background: 'transparent' }
    }
    if (tableDesign === 'minimal') {
      const borders: Record<string, string> = {
        occupied: hexAlpha(pc, 0.90), available: 'rgba(16,185,129,0.90)',
        reserved: 'rgba(99,102,241,0.90)', bill: 'rgba(239,68,68,0.90)', dirty: 'rgba(251,113,133,0.70)',
      }
      const glows: Record<string, string> = {
        occupied: hexAlpha(pc, 0.40), available: 'rgba(16,185,129,0.40)',
        reserved: 'rgba(99,102,241,0.40)', bill: 'rgba(239,68,68,0.40)', dirty: 'rgba(251,113,133,0.25)',
      }
      const c  = borders[status] ?? borders.available
      const gl = glows[status]   ?? glows.available
      return { background: 'rgba(0,0,0,0.30)', border: `1.5px solid ${c}`, boxShadow: `0 0 10px ${gl}` }
    }
    // glass
    if (status === 'occupied') return { background: hexAlpha(pc, 0.18), border: `1px solid ${hexAlpha(pc, 0.5)}`, color: pc }
    if (status === 'reserved') return { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.45)', color: '#818cf8' }
    if (status === 'bill')     return { background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.55)', color: '#f87171' }
    if (status === 'dirty')    return { background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)', color: '#fb7185' }
    return { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }
  }

  const cellRadius = tableDesign === 'glow' ? '8px' : '10px'

  const nbsBase: React.CSSProperties = navButtonStyle === 'neon'
    ? { background: 'rgba(0,0,0,0.42)', border: `1px solid ${hexAlpha(primaryColor, 0.70)}`, boxShadow: `0 0 5px ${hexAlpha(primaryColor, 0.28)}` }
    : navButtonStyle === 'crystal'
    ? { background: 'linear-gradient(135deg,rgba(255,255,255,0.15) 0%,rgba(255,255,255,0.05) 100%)', border: '1px solid rgba(255,255,255,0.23)' }
    : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }
  const nbs = (i: number): React.CSSProperties => navButtonStyle === 'vibrant'
    ? { background: VIBRANT_NAV_COLORS[i % VIBRANT_NAV_COLORS.length], border: `1px solid ${VIBRANT_NAV_COLORS[i % VIBRANT_NAV_COLORS.length]}` }
    : nbsBase

  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10" style={{ background: bg }}>
      {/* Mini header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10" style={{ background: `${anchor}cc`, backdropFilter: 'blur(12px)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${hexAlpha(primaryColor, 0.7)})` }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-2 w-20 rounded-full bg-white/30" />
          <div className="h-1.5 w-12 rounded-full bg-white/15 mt-1" />
        </div>
        <div className="text-[10px] font-bold text-white/50 tabular-nums mr-1">12:30</div>
        {[0, 1, 2].map(i => <div key={i} className="w-6 h-6 rounded-lg" style={nbs(i)} />)}
      </div>

      {/* Table grid */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="h-px flex-1 bg-white/8" />
          <span className="text-[9px] font-semibold text-white/25 uppercase tracking-widest">Tables</span>
          <div className="h-px flex-1 bg-white/8" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {DEMO_TABLES.map(({ n, status, shape }) => {
            const glowColor: Record<string, string> = { occupied: primaryColor, available: '#10b981', reserved: '#818cf8', bill: '#f87171', dirty: '#fb7185' }
            const isGlow = tableDesign === 'glow'
            const isRect = shape === 'rect'
            return (
              <motion.div
                key={n}
                layout
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 overflow-hidden',
                  isGlow ? (isRect ? 'aspect-[5/3]' : 'aspect-square') : 'aspect-square',
                )}
                style={{ ...tableStyle(status), borderRadius: cellRadius }}
                transition={{ duration: 0.25, ease: 'circOut' }}
              >
                {isGlow ? (
                  <MiniTableSvg shape={shape} color={glowColor[status] ?? '#10b981'} />
                ) : (
                  <span className="text-[9px] font-bold leading-none text-white/80">{n}</span>
                )}
              </motion.div>
            )
          })}
        </div>

        <div className="flex items-center gap-3 mt-3 px-0.5 flex-wrap">
          {[
            { label: 'Avail',    color: '#34d399'    },
            { label: 'Occupied', color: primaryColor },
            { label: 'Reserved', color: '#818cf8'    },
            { label: 'Bill',     color: '#f87171'    },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              <span className="text-[8px] text-white/35">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-white/8">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full', i === 2 ? '' : 'bg-white/10')}
            style={i === 2 ? { background: hexAlpha(primaryColor, 0.6) } : {}} />
        ))}
      </div>
    </div>
  )
}

// ── Page variants ────────────────────────────────────────────────
const PAGE: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.24, ease: 'circOut' as const } },
}

// ── Main page ────────────────────────────────────────────────────
export default function AppearancePage() {
  const { t } = useLanguage()
  const { settings: cfg, setSettings: setCfg, loading, saveState, save } =
    useRestaurantSettings<AppearanceSettings>(DEFAULTS)

  const isCustom = cfg.sidebar_style === 'custom'

  // Apply CSS vars live so the actual dashboard background updates instantly
  useEffect(() => {
    if (loading) return
    const bg     = computeBg(cfg.sidebar_style, cfg.sidebar_custom_color, cfg.sidebar_custom_type)
    const anchor = anchorColor(cfg.sidebar_style, cfg.sidebar_custom_color, cfg.sidebar_custom_type)
    const root   = document.documentElement
    root.style.setProperty('--app-bg',        bg)
    root.style.setProperty('--app-anchor',    anchor)
    root.style.setProperty('--app-anchor-80', hexAlpha(anchor, 0.80))
    root.style.setProperty('--app-anchor-90', hexAlpha(anchor, 0.90))
    root.style.setProperty('--app-anchor-95', hexAlpha(anchor, 0.95))
    root.style.setProperty('--app-primary',   cfg.primary_color)
    const id = localStorage.getItem('restaurant_id')
    if (id) localStorage.setItem('_app_bg_cache', JSON.stringify({ forId: id, bg, anchor, primary: cfg.primary_color }))
  }, [cfg.sidebar_style, cfg.sidebar_custom_color, cfg.sidebar_custom_type, cfg.primary_color, loading])

  return (
    <motion.div variants={PAGE} initial="hidden" animate="show"
      className="flex flex-col xl:flex-row gap-8 items-start w-full">

      {/* ── Left: settings form ── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: hexAlpha(cfg.primary_color, 0.18) }}>
              <Palette className="w-5 h-5" style={{ color: cfg.primary_color }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">{t.app_title}</h1>
              <p className="text-xs text-white/40">{t.app_subtitle}</p>
            </div>
          </div>
          {loading
            ? <div className="h-10 w-32 rounded-xl bg-white/8 animate-pulse" />
            : <SaveButton state={saveState} onClick={save} />}
        </div>

        {/* ── Background Style ── */}
        <SettingsSection title={t.app_sidebar} icon={<Monitor className="w-4 h-4 text-white/80" />} color="bg-indigo-500/70">
          <div className="space-y-3">
            <p className="text-xs text-white/40">{t.app_sidebar_d}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {BG_PRESETS.map(({ id, labelKey, bg }) => {
                const active = cfg.sidebar_style === id
                return (
                  <button key={id}
                    onClick={() => setCfg(c => ({ ...c, sidebar_style: id as AppearanceSettings['sidebar_style'] }))}
                    className={cn('relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all active:scale-95',
                      active ? 'border-white/30 bg-white/8' : 'border-white/8 bg-white/3 hover:bg-white/6')}
                  >
                    <div className="w-full h-12 rounded-xl border border-white/15 flex items-center justify-center gap-1 overflow-hidden" style={{ background: bg }}>
                      {[1,2,3].map(i => <div key={i} className="w-1.5 h-5 rounded-sm bg-white/20" />)}
                    </div>
                    <span className="text-[11px] font-medium text-white/60">{t[labelKey as keyof typeof t]}</span>
                    {active && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: cfg.primary_color }}>
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Gradient presets */}
            <div>
              <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-2">Gradients</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {GRADIENT_PRESETS.map(({ id, label, bg }) => {
                  const active = cfg.sidebar_style === id
                  return (
                    <button key={id}
                      onClick={() => setCfg(c => ({ ...c, sidebar_style: id as AppearanceSettings['sidebar_style'] }))}
                      className={cn('relative flex flex-col items-center gap-2 p-2.5 rounded-2xl border transition-all active:scale-95',
                        active ? 'border-white/30 bg-white/8' : 'border-white/8 bg-white/3 hover:bg-white/6')}
                    >
                      <div className="w-full h-10 rounded-xl border border-white/10 overflow-hidden" style={{ background: bg }} />
                      <span className="text-[11px] font-medium text-white/60">{label}</span>
                      {active && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: cfg.primary_color }}>
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom option */}
            <button
              onClick={() => setCfg(c => ({ ...c, sidebar_style: 'custom' }))}
              className={cn('relative w-full flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-[0.99]',
                isCustom ? 'border-white/30 bg-white/8' : 'border-white/8 bg-white/3 hover:bg-white/6')}
            >
              <div className="w-12 h-12 rounded-xl border border-white/15 shrink-0 overflow-hidden"
                style={{ background: computeBg('custom', cfg.sidebar_custom_color, cfg.sidebar_custom_type) }} />
              <div className="flex-1 text-left">
                <div className="text-[13px] font-semibold text-white">{t.app_style_custom}</div>
                <div className="text-[11px] text-white/40 mt-0.5">{t.app_custom_hint}</div>
              </div>
              {isCustom && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: cfg.primary_color }}>
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>

            <AnimatePresence initial={false}>
              {isCustom && (
                <motion.div key="custom-controls"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="pt-1 space-y-4 pl-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50 shrink-0">{t.app_custom_mode}</span>
                      <div className="flex rounded-xl border border-white/10 overflow-hidden bg-white/4">
                        {(['gradient', 'solid'] as const).map(type => (
                          <button key={type}
                            onClick={() => setCfg(c => ({ ...c, sidebar_custom_type: type }))}
                            className={cn('px-4 py-1.5 text-xs font-medium transition-all',
                              cfg.sidebar_custom_type === type ? 'text-white' : 'text-white/40 hover:text-white/70')}
                            style={cfg.sidebar_custom_type === type ? { background: hexAlpha(cfg.primary_color, 0.35) } : {}}
                          >
                            {type === 'gradient' ? t.app_custom_gradient : t.app_custom_solid}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl border border-white/20 shrink-0" style={{ background: cfg.sidebar_custom_color }} />
                      <input type="color" value={cfg.sidebar_custom_color}
                        onChange={e => setCfg(c => ({ ...c, sidebar_custom_color: e.target.value }))}
                        className="w-9 h-9 rounded-xl cursor-pointer border-0 bg-transparent p-0" />
                      <input type="text" value={cfg.sidebar_custom_color.toUpperCase()}
                        onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setCfg(c => ({ ...c, sidebar_custom_color: v })) }}
                        className="flex-1 px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-white/30 transition-colors"
                        placeholder="#022658" maxLength={7} />
                    </div>
                    {cfg.sidebar_custom_type === 'gradient' && (
                      <div className="w-full h-6 rounded-lg border border-white/10"
                        style={{ background: computeBg('custom', cfg.sidebar_custom_color, 'gradient') }} />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </SettingsSection>

        {/* ── Table Design ── */}
        <SettingsSection
          title={t.app_table_design}
          icon={<div className="w-4 h-4 rounded-lg bg-white/50" />}
          color="bg-emerald-500/70"
        >
          <div className="space-y-3">
            <p className="text-xs text-white/40">{t.app_table_design_d}</p>
            <div className="grid grid-cols-2 gap-3">
              {TABLE_DESIGNS.map(({ id, label, desc }) => {
                const active = cfg.table_design === id
                return (
                  <button key={id}
                    onClick={() => setCfg(c => ({ ...c, table_design: id }))}
                    className={cn(
                      'relative flex flex-col gap-3 p-4 rounded-2xl border transition-all active:scale-[0.98] text-left',
                      active ? 'border-white/30 bg-white/8' : 'border-white/8 bg-white/3 hover:bg-white/6',
                    )}
                  >
                    {/* Mini card previews */}
                    <MiniDesignPreview design={id} primary={cfg.primary_color} />
                    {/* Label */}
                    <div>
                      <div className="text-[13px] font-semibold text-white">{label}</div>
                      <div className="text-[11px] text-white/40 mt-0.5">{desc}</div>
                    </div>
                    {active && (
                      <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: cfg.primary_color }}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </SettingsSection>

        {/* ── Button Style ── */}
        <SettingsSection
          title="Button Style"
          icon={<div className="w-4 h-4 rounded-lg border border-white/50 bg-white/20" />}
          color="bg-amber-500/70"
        >
          <div className="space-y-3">
            <p className="text-xs text-white/40">Visual style for the top navigation buttons</p>
            <div className="grid grid-cols-2 gap-3">
              {NAV_BUTTON_DESIGNS.map(({ id, label, desc }) => {
                const active = cfg.nav_button_style === id
                return (
                  <button key={id}
                    onClick={() => setCfg(c => ({ ...c, nav_button_style: id }))}
                    className={cn(
                      'relative flex flex-col gap-3 p-4 rounded-2xl border transition-all active:scale-[0.98] text-left',
                      active ? 'border-white/30 bg-white/8' : 'border-white/8 bg-white/3 hover:bg-white/6',
                    )}
                  >
                    <MiniNavPreview style={id} primary={cfg.primary_color} />
                    <div>
                      <div className="text-[13px] font-semibold text-white">{label}</div>
                      <div className="text-[11px] text-white/40 mt-0.5">{desc}</div>
                    </div>
                    {active && (
                      <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: cfg.primary_color }}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </SettingsSection>

      </div>

      {/* ── Right: live preview ── */}
      <div className="w-full xl:w-[360px] xl:sticky xl:top-24 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">{t.app_preview}</p>
          <span className="flex items-center gap-1.5 text-[10px] text-white/25">
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.primary_color }} />
            {t.app_preview_hint}
          </span>
        </div>
        {loading
          ? <div className="w-full aspect-[3/4] rounded-2xl bg-white/5 animate-pulse" />
          : <DashboardPreview
              primaryColor={cfg.primary_color}
              sidebarStyle={cfg.sidebar_style}
              sidebarCustomColor={cfg.sidebar_custom_color}
              sidebarCustomType={cfg.sidebar_custom_type}
              tableDesign={cfg.table_design}
              navButtonStyle={cfg.nav_button_style}
            />
        }
      </div>

    </motion.div>
  )
}
