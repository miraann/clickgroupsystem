'use client'
import React from 'react'
import { ChefHat, Monitor, Toilet, BrickWall, Fence, AppWindow, DoorOpen, Cylinder, Sprout } from 'lucide-react'
import type { TranslationKey } from '@/lib/i18n/translations'

// ── Floor-plan decor: walls, doors, planters, zones… ─────────────────────────
// Drawn top-down like an architectural plan. Each item fills its w×h box on the
// dashboard floor canvas; `rot` (clockwise degrees) turns the parts that have a
// direction — a door's swing, the kitchen pass, the cash counter, the toilets.

export const FLOOR_ELEMENT_META = {
  // layer: draw order — zones at the bottom, doors/windows over walls, decor on top
  kitchen:   { icon: ChefHat,   label: 'floor_kitchen',   w: 220, h: 110, layer: 0 },
  cashier:   { icon: Monitor,   label: 'floor_cashier',   w: 150, h: 80,  layer: 0 },
  restroom:  { icon: Toilet,    label: 'floor_restroom',  w: 140, h: 110, layer: 0 },
  wall:      { icon: BrickWall, label: 'floor_wall',      w: 220, h: 12,  layer: 1 },
  partition: { icon: Fence,     label: 'floor_partition', w: 140, h: 14,  layer: 1 },
  window:    { icon: AppWindow, label: 'floor_window',    w: 120, h: 12,  layer: 2 },
  door:      { icon: DoorOpen,  label: 'floor_door',      w: 70,  h: 70,  layer: 2 },
  pillar:    { icon: Cylinder,  label: 'floor_pillar',    w: 40,  h: 40,  layer: 3 },
  planter:   { icon: Sprout,    label: 'floor_planter',   w: 60,  h: 60,  layer: 3 },
} satisfies Record<string, { icon: typeof ChefHat; label: TranslationKey; w: number; h: number; layer: number }>

export type FloorElementKind = keyof typeof FLOOR_ELEMENT_META
export const FLOOR_ELEMENT_KINDS = Object.keys(FLOOR_ELEMENT_META) as FloorElementKind[]
export const isFloorKind = (k: string): k is FloorElementKind => k in FLOOR_ELEMENT_META

// Page background, used to "cut" openings (doors) out of walls drawn beneath.
const FLOOR_BG = 'var(--app-bg, #022658)'

// Lays children out in the item's un-rotated frame (cw×ch) and turns that frame
// by rot around the centre, so it lands exactly on the w×h box.
function Rotated({ w, h, rot, children }: {
  w: number; h: number; rot: number
  children: (cw: number, ch: number) => React.ReactNode
}) {
  const quarter = rot % 180 !== 0
  const cw = quarter ? h : w
  const ch = quarter ? w : h
  return (
    <div
      className="absolute"
      style={{ width: cw, height: ch, left: (w - cw) / 2, top: (h - ch) / 2, transform: `rotate(${rot}deg)` }}
    >
      {children(cw, ch)}
    </div>
  )
}

// Zone name chip — never rotated, so the text stays upright.
function ZoneLabel({ w, h, icon: Icon, label, color }: {
  w: number; h: number; icon: typeof ChefHat; label: string; color: string
}) {
  if (Math.min(w, h) < 24) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center p-1">
      <span
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/45 backdrop-blur-sm text-[11px] font-semibold max-w-full"
        style={{ color, boxShadow: `inset 0 0 0 1px ${color}40` }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {w >= 80 && h >= 44 && <span className="truncate">{label}</span>}
      </span>
    </div>
  )
}

// One plant seen from above: two rings of leaves around a light centre.
function PlantTop() {
  return (
    <svg viewBox="-50 -50 100 100" className="flex-1 min-w-0 min-h-0 w-full h-full">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
        <ellipse key={a} cx="0" cy="-24" rx="11" ry="22" transform={`rotate(${a})`} fill={i % 2 ? '#15803d' : '#16a34a'} />
      ))}
      {[22, 82, 142, 202, 262, 322].map(a => (
        <ellipse key={a} cx="0" cy="-14" rx="8" ry="14" transform={`rotate(${a})`} fill="#22c55e" />
      ))}
      <circle r="6" fill="#86efac" />
    </svg>
  )
}

export function FloorElementArt({ kind, w, h, rot, label }: {
  kind: FloorElementKind; w: number; h: number; rot: number; label: string
}) {
  const horizontal = w >= h
  const icon = FLOOR_ELEMENT_META[kind].icon

  switch (kind) {
    case 'wall':
      // solid wall with the 45° hatch plans use for cut masonry
      return (
        <div className="absolute inset-0" style={{
          borderRadius: 3,
          background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.2) 0 1.5px, transparent 1.5px 6px), linear-gradient(#64748b, #475569)',
          boxShadow: 'inset 0 0 0 1px rgba(203,213,225,0.55), 0 3px 10px rgba(0,0,0,0.45)',
        }} />
      )

    case 'partition':
      // wooden slat screen — slats run across the long side
      return (
        <div className="absolute inset-0" style={{
          borderRadius: 4,
          background: `repeating-linear-gradient(${horizontal ? 90 : 0}deg, #a16207 0 6px, #713f12 6px 8px)`,
          boxShadow: 'inset 0 0 0 1px rgba(253,224,71,0.25), 0 3px 8px rgba(0,0,0,0.4)',
        }} />
      )

    case 'window': {
      // framed glass: a line down the middle, mullions every 36px
      const along  = horizontal ? '90deg' : '0deg'
      const across = horizontal ? '0deg' : '90deg'
      return (
        <div className="absolute inset-0" style={{
          borderRadius: 2,
          background: [
            `repeating-linear-gradient(${along}, transparent 0 34px, rgba(226,232,240,0.8) 34px 36px)`,
            `linear-gradient(${across}, transparent calc(50% - 0.75px), rgba(240,249,255,0.95) calc(50% - 0.75px) calc(50% + 0.75px), transparent calc(50% + 0.75px))`,
            'linear-gradient(rgba(125,211,252,0.3), rgba(125,211,252,0.3))',
            FLOOR_BG,
          ].join(', '),
          boxShadow: 'inset 0 0 0 2px rgba(226,232,240,0.8), 0 0 10px rgba(125,211,252,0.35)',
        }} />
      )
    }

    case 'door':
      // wall opening along the bottom edge; leaf hinged bottom-left, swinging in
      return (
        <Rotated w={w} h={h} rot={rot}>
          {(cw, ch) => {
            const gap = Math.min(12, ch / 3)
            const r   = Math.max(4, Math.min(cw, ch - gap / 2) - 2)
            const y0  = ch - gap / 2   // hinge line = centre of the wall
            return (
              <svg width={cw} height={ch} className="absolute inset-0 overflow-visible">
                <rect x="0" y={ch - gap} width={cw} height={gap} style={{ fill: FLOOR_BG }} />
                <line x1="1" y1={ch - gap} x2="1" y2={ch} stroke="#cbd5e1" strokeWidth="2" />
                <line x1={cw - 1} y1={ch - gap} x2={cw - 1} y2={ch} stroke="#cbd5e1" strokeWidth="2" />
                <path d={`M2 ${y0} L2 ${y0 - r} A${r} ${r} 0 0 1 ${2 + r} ${y0} Z`} fill="rgba(251,191,36,0.12)" />
                <path d={`M2 ${y0 - r} A${r} ${r} 0 0 1 ${2 + r} ${y0}`} fill="none" stroke="rgba(252,211,77,0.75)" strokeWidth="1.5" strokeDasharray="4 3" />
                <line x1="2" y1={y0} x2="2" y2={y0 - r} stroke="#fcd34d" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
            )
          }}
        </Rotated>
      )

    case 'pillar':
      // structural column: concrete block with the plan's X mark
      return (
        <div className="absolute inset-0" style={{
          borderRadius: 4,
          background: 'linear-gradient(135deg, #94a3b8, #475569)',
          boxShadow: 'inset 0 0 0 2px rgba(226,232,240,0.55), 0 4px 12px rgba(0,0,0,0.55)',
        }}>
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <path d={`M5 5 L${w - 5} ${h - 5} M${w - 5} 5 L5 ${h - 5}`} stroke="rgba(226,232,240,0.5)" strokeWidth="1.5" />
          </svg>
        </div>
      )

    case 'planter': {
      // terracotta box of soil; long boxes hold a row of plants
      const count = Math.min(8, Math.max(1, Math.round(Math.max(w, h) / Math.min(w, h))))
      return (
        <div className="absolute inset-0 rounded-xl" style={{
          background: 'radial-gradient(#3f2a1d, #2a1a10)',
          boxShadow: 'inset 0 0 0 3px #9a3412, 0 3px 10px rgba(0,0,0,0.45)',
        }}>
          <div className={horizontal ? 'absolute inset-1 flex flex-row' : 'absolute inset-1 flex flex-col'}>
            {Array.from({ length: count }).map((_, i) => <PlantTop key={i} />)}
          </div>
        </div>
      )
    }

    case 'kitchen':
      // tiled floor; cooking line on the back wall, the pass along the front
      return (
        <div className="absolute inset-0 overflow-hidden" style={{
          borderRadius: 14,
          background: 'repeating-conic-gradient(rgba(255,255,255,0.05) 0 25%, transparent 0 50%) 0 0 / 16px 16px, rgba(249,115,22,0.10)',
          boxShadow: 'inset 0 0 0 2px rgba(251,146,60,0.55)',
        }}>
          <Rotated w={w} h={h} rot={rot}>
            {(cw, ch) => (
              <>
                <div className="absolute left-2 right-2 top-2 flex gap-1.5" style={{ height: Math.min(26, ch * 0.3) }}>
                  {Array.from({ length: Math.min(8, Math.max(1, Math.floor((cw - 16) / 34))) }).map((_, i) => (
                    <div key={i} className="flex-1 rounded-[4px] flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)', boxShadow: 'inset 0 0 0 1px rgba(251,146,60,0.45)' }}>
                      <span className="rounded-full" style={{ width: 9, height: 9, boxShadow: '0 0 0 2px rgba(251,146,60,0.75), 0 0 6px rgba(251,146,60,0.6)' }} />
                    </div>
                  ))}
                </div>
                <div className="absolute left-0 right-0 bottom-0" style={{
                  height: Math.min(14, ch * 0.18),
                  background: 'linear-gradient(rgba(231,229,228,0.6), rgba(168,162,158,0.6))',
                }} />
              </>
            )}
          </Rotated>
          <ZoneLabel w={w} h={h} icon={icon} label={label} color="#fdba74" />
        </div>
      )

    case 'cashier':
      // counter along the front with a glowing POS screen and keypad
      return (
        <div className="absolute inset-0 overflow-hidden" style={{
          borderRadius: 14,
          background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 6px, transparent 6px 12px), rgba(139,92,246,0.12)',
          boxShadow: 'inset 0 0 0 2px rgba(167,139,250,0.55)',
        }}>
          <Rotated w={w} h={h} rot={rot}>
            {(cw, ch) => (
              <div className="absolute left-2 right-2 bottom-2 rounded-[5px] flex items-center justify-end gap-1.5 px-2" style={{
                height: Math.max(12, Math.min(22, ch * 0.3)),
                background: 'linear-gradient(#57534e, #44403c)',
                boxShadow: 'inset 0 0 0 1px rgba(214,211,209,0.3)',
              }}>
                {cw >= 70 && <span className="rounded-[2px]" style={{ width: 10, height: 7, background: 'rgba(231,229,228,0.55)' }} />}
                <span className="rounded-[2px]" style={{ width: 16, height: 10, background: '#c4b5fd', boxShadow: '0 0 8px rgba(196,181,253,0.8)' }} />
              </div>
            )}
          </Rotated>
          <ZoneLabel w={w} h={h} icon={icon} label={label} color="#c4b5fd" />
        </div>
      )

    case 'restroom': {
      // plain dashed zone with its name
      const Icon = icon
      return (
        <div className="absolute inset-0 bg-cyan-500/10 border-2 border-dashed border-cyan-400/50 rounded-2xl text-cyan-200 flex items-center justify-center gap-1.5 px-1 overflow-hidden">
          {Math.min(w, h) >= 18 && <Icon className="w-3.5 h-3.5 shrink-0" />}
          {w >= 90 && h >= 36 && <span className="text-[11px] font-semibold truncate">{label}</span>}
        </div>
      )
    }
  }
}
