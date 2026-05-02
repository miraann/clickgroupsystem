'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Globe, Copy, Check, Loader2, Save, ExternalLink, UtensilsCrossed, Plus } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { createClient } from '@/lib/supabase/client'
import { useOnlineMenuSettings } from '@/hooks/useOnlineMenuSettings'

// ── Types ──────────────────────────────────────────────────────
type TemplateId    = 'classic' | 'dark' | 'warm' | 'bold' | 'elegant' | 'neon'
type SurfaceStyle  = 'solid' | 'glass' | 'card'
type CategoryStyle = 'circles' | 'pills' | 'square' | 'horizontal'
type ItemStyle     = 'grid' | 'list' | 'compact'
type EventStyle    = 'cards' | 'banner' | 'story'
type SocialStyle   = 'pills' | 'grid' | 'icons'

interface MenuSettings {
  template:        TemplateId
  primary_color:   string
  surface_style:   SurfaceStyle
  category_style:  CategoryStyle
  item_style:      ItemStyle
  event_style:     EventStyle
  social_style:    SocialStyle
  show_prices:     boolean
  show_descriptions: boolean
  welcome_text:    string | null
}

interface PreviewData {
  name: string; logo_url: string | null
  categories: { id: string; name: string; color: string; icon: string | null }[]
  items: { id: string; name: string; price: number; image_url: string | null; description: string | null }[]
  events: { id: string; title: string; image_url: string | null; date_label: string | null }[]
  socialLinks: { key: string; label: string; bg: string }[]
}

const DEFAULT: MenuSettings = {
  template: 'classic', primary_color: '#f59e0b',
  surface_style: 'solid', category_style: 'circles',
  item_style: 'grid', event_style: 'cards', social_style: 'pills',
  show_prices: true, show_descriptions: true, welcome_text: null,
}

// ── Preset quick-starts ────────────────────────────────────────
const PRESETS: { id: TemplateId; label: string; bg: string; dot: string; settings: Partial<MenuSettings> }[] = [
  { id: 'classic',  label: 'Classic',      bg: '#ffffff',  dot: '#f59e0b', settings: { primary_color: '#f59e0b', surface_style: 'solid',  category_style: 'circles',    item_style: 'grid',    event_style: 'cards',  social_style: 'pills' } },
  { id: 'dark',     label: 'Dark',         bg: '#080c14',  dot: '#f59e0b', settings: { primary_color: '#f59e0b', surface_style: 'glass',  category_style: 'circles',    item_style: 'grid',    event_style: 'cards',  social_style: 'pills' } },
  { id: 'warm',     label: 'Warm Café',    bg: '#fdf6ec',  dot: '#d97706', settings: { primary_color: '#d97706', surface_style: 'card',   category_style: 'circles',    item_style: 'grid',    event_style: 'banner', social_style: 'pills' } },
  { id: 'bold',     label: 'Bold',         bg: '#ffffff',  dot: '#7c3aed', settings: { primary_color: '#7c3aed', surface_style: 'solid',  category_style: 'pills',      item_style: 'list',    event_style: 'story',  social_style: 'grid'  } },
  { id: 'elegant',  label: 'Elegant',      bg: '#f7f4f0',  dot: '#a8896c', settings: { primary_color: '#a8896c', surface_style: 'card',   category_style: 'horizontal', item_style: 'list',    event_style: 'cards',  social_style: 'icons' } },
  { id: 'neon',     label: 'Neon',         bg: '#0a0a0f',  dot: '#39ff14', settings: { primary_color: '#39ff14', surface_style: 'glass',  category_style: 'square',     item_style: 'grid',    event_style: 'cards',  social_style: 'icons' } },
]

// ── Color presets ──────────────────────────────────────────────
const COLOR_PRESETS = [
  { label: 'Gold',     value: '#f59e0b' },
  { label: 'Rose',     value: '#f43f5e' },
  { label: 'Violet',   value: '#7c3aed' },
  { label: 'Blue',     value: '#3b82f6' },
  { label: 'Emerald',  value: '#10b981' },
  { label: 'Orange',   value: '#f97316' },
  { label: 'Cyan',     value: '#06b6d4' },
  { label: 'Neon',     value: '#39ff14' },
]

// ── Live phone preview ─────────────────────────────────────────
function PhonePreview({ s, data }: { s: MenuSettings; data: PreviewData | null }) {
  const p = s.primary_color
  const isDark = s.template === 'dark' || s.template === 'neon'
  const isWarm = s.template === 'warm'
  const isElegant = s.template === 'elegant'

  const pageBg = isDark ? (s.template === 'neon' ? '#0a0a0f' : '#080c14') : isWarm ? '#fdf6ec' : isElegant ? '#f7f4f0' : '#ffffff'
  const nameColor = isDark ? '#ffffff' : isWarm ? '#451a03' : isElegant ? '#1c1917' : '#111827'
  const mutedColor = isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af'
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : s.surface_style === 'glass' ? 'rgba(255,255,255,0.15)' : '#ffffff'
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'

  const name   = data?.name ?? 'My Restaurant'
  const logo   = data?.logo_url
  const cats   = data?.categories.slice(0, 5) ?? []
  const items  = data?.items.slice(0, 4) ?? []
  const SAMPLE_COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6']

  return (
    <div className="relative mx-auto" style={{ width: 260 }}>
      <div className="absolute inset-0 rounded-[2.8rem] border-[7px] border-[#1a1f2e] shadow-2xl shadow-black/60 pointer-events-none z-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 rounded-b-xl z-20 pointer-events-none" style={{ background: '#1a1f2e' }} />
      <div className="rounded-[2.4rem] overflow-hidden h-[520px] overflow-y-auto" style={{ background: pageBg, scrollbarWidth: 'none' }}>
        <div className="pt-8 pb-6 flex flex-col items-center text-center">

          {/* Logo */}
          <div className="w-16 h-16 rounded-full overflow-hidden shadow-lg" style={{ outline: `3px solid ${p}`, outlineOffset: '3px', background: '#f3f4f6' }}>
            {logo
              ? <img src={logo} alt={name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center" style={{ background: p }}>
                  <span className="text-white text-xl font-bold">{name.charAt(0)}</span>
                </div>}
          </div>

          <h1 className="mt-2 text-sm font-bold px-4" style={{ color: nameColor }}>{name}</h1>
          <span className="mt-1 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: p + '22', color: p }}>Table T01</span>
          <p className="mt-1.5 text-[10px] px-5 leading-relaxed" style={{ color: mutedColor }}>
            {s.welcome_text || 'Welcome! Browse our menu.'}
          </p>

          {/* Categories */}
          {cats.length > 0 && (
            <div className="w-full mt-3 px-3">
              {s.category_style === 'circles' && (
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  {cats.map((cat, i) => (
                    <div key={cat.id} className="flex flex-col items-center gap-1 shrink-0">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shadow"
                        style={{ background: cat.color || SAMPLE_COLORS[i % 5], outline: `2px solid ${p}`, outlineOffset: '2px' }}>
                        {cat.icon ? <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span> : <span className="text-white text-xs font-bold">{cat.name.charAt(0)}</span>}
                      </div>
                      <span className="text-[8px] font-medium w-10 text-center truncate" style={{ color: mutedColor }}>{cat.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {s.category_style === 'pills' && (
                <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  {cats.map((cat, i) => (
                    <div key={cat.id} className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-semibold"
                      style={i === 0 ? { background: cat.color || p, color: '#fff' } : { background: isDark ? 'rgba(255,255,255,0.07)' : '#f3f4f6', color: mutedColor }}>
                      {cat.icon && <span style={{ fontSize: '0.75rem' }}>{cat.icon}</span>}{cat.name}
                    </div>
                  ))}
                </div>
              )}
              {s.category_style === 'square' && (
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  {cats.map((cat, i) => (
                    <div key={cat.id} className="flex flex-col items-center gap-1 shrink-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow"
                        style={{ background: s.surface_style === 'glass' ? (cat.color || SAMPLE_COLORS[i % 5]) + '30' : (cat.color || SAMPLE_COLORS[i % 5]) + '20',
                          border: `1.5px solid ${cat.color || SAMPLE_COLORS[i % 5]}`,
                          backdropFilter: s.surface_style === 'glass' ? 'blur(8px)' : undefined }}>
                        {cat.icon ? <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span> : <span className="text-xs font-bold" style={{ color: cat.color || p }}>{cat.name.charAt(0)}</span>}
                      </div>
                      <span className="text-[8px] font-medium w-10 text-center truncate" style={{ color: mutedColor }}>{cat.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {s.category_style === 'horizontal' && (
                <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  {cats.map((cat, i) => (
                    <div key={cat.id} className="shrink-0 px-2 py-1 text-[9px] font-semibold rounded-sm border"
                      style={i === 0
                        ? { borderColor: p, color: p, background: p + '10' }
                        : { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb', color: mutedColor }}>
                      {cat.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Items — shown only when no category selected; in preview always show */}
          <div className="w-full mt-3 px-3">
            {s.item_style === 'grid' && (
              <div className="grid grid-cols-2 gap-2">
                {(items.length > 0 ? items : [
                  { id:'1', name:'Margherita', price:12, image_url:null, description:'Classic tomato' },
                  { id:'2', name:'Pepperoni',  price:14, image_url:null, description:'Spicy pepperoni' },
                  { id:'3', name:'Cola',       price:3,  image_url:null, description:'Chilled' },
                  { id:'4', name:'Tiramisu',   price:6,  image_url:null, description:'Italian dessert' },
                ]).map(item => (
                  <div key={item.id} className="rounded-xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                    <div className="w-full h-14 flex items-center justify-center" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb' }}>
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        : <UtensilsCrossed className="w-4 h-4" style={{ color: mutedColor }} />}
                    </div>
                    <div className="p-1.5">
                      <p className="text-[9px] font-bold line-clamp-1" style={{ color: nameColor }}>{item.name}</p>
                      {s.show_prices && <p className="text-[9px] font-extrabold" style={{ color: p }}>${item.price}</p>}
                      <button className="mt-1 w-full flex items-center justify-center gap-0.5 py-0.5 rounded-lg text-[8px] font-bold" style={{ background: p, color: isDark && s.template === 'neon' ? '#000' : '#fff' }}>
                        <Plus className="w-2 h-2" /> Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {s.item_style === 'list' && (
              <div className="space-y-2">
                {(items.length > 0 ? items : [
                  { id:'1', name:'Grilled Salmon', price:18, image_url:null, description:'With lemon sauce' },
                  { id:'2', name:'Ribeye Steak',   price:28, image_url:null, description:'250g with fries' },
                  { id:'3', name:'Caesar Salad',   price:11, image_url:null, description:'Romaine & croutons' },
                ]).map(item => (
                  <div key={item.id} className="flex gap-2 rounded-xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                    <div className="w-14 h-14 shrink-0 flex items-center justify-center" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb' }}>
                      {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /> : <UtensilsCrossed className="w-4 h-4" style={{ color: mutedColor }} />}
                    </div>
                    <div className="flex-1 py-2 pr-2 flex flex-col justify-between">
                      <div>
                        <p className="text-[9px] font-bold line-clamp-1" style={{ color: nameColor }}>{item.name}</p>
                        {s.show_descriptions && <p className="text-[8px] line-clamp-1 mt-0.5" style={{ color: mutedColor }}>{item.description}</p>}
                      </div>
                      <div className="flex items-center justify-between">
                        {s.show_prices && <p className="text-[9px] font-extrabold" style={{ color: p }}>${item.price}</p>}
                        <button className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[8px] font-bold" style={{ background: p, color: '#fff' }}>
                          <Plus className="w-2 h-2" /> Add
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {s.item_style === 'compact' && (
              <div className="space-y-0.5">
                {(items.length > 0 ? items : [
                  { id:'1', name:'Margherita Pizza',  price:12, image_url:null, description:null },
                  { id:'2', name:'Pepperoni',          price:14, image_url:null, description:null },
                  { id:'3', name:'Cola',               price:3,  image_url:null, description:null },
                  { id:'4', name:'Tiramisu',           price:6,  image_url:null, description:null },
                ]).map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                    style={{ background: i % 2 === 0 ? (isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb') : 'transparent', borderBottom: `1px solid ${cardBorder}` }}>
                    <p className="text-[9px] font-semibold" style={{ color: nameColor }}>{item.name}</p>
                    <div className="flex items-center gap-1.5">
                      {s.show_prices && <p className="text-[9px] font-bold" style={{ color: p }}>${item.price}</p>}
                      <button className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: p }}>
                        <Plus className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Events & Offers */}
          {(data?.events ?? []).length > 0 && (
            <div className="w-full mt-3 text-left">
              <p className="text-[9px] font-bold px-3 mb-1.5" style={{ color: nameColor }}>Event &amp; Offers</p>
              {s.event_style === 'story' ? (
                <div className="flex gap-2 px-3 pb-2" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
                  {(data?.events ?? []).map(ev => (
                    <div key={ev.id} className="shrink-0 flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-full overflow-hidden" style={{ outline: `2px solid ${p}`, outlineOffset: '2px', background: '#f3f4f6' }}>
                        {ev.image_url
                          ? <img src={ev.image_url} alt={ev.title} className="w-full h-full object-cover" />
                          : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${p}cc, #f97316cc)` }} />}
                      </div>
                      <p className="text-[7px] font-semibold text-center w-10 leading-tight truncate" style={{ color: mutedColor }}>{ev.title}</p>
                    </div>
                  ))}
                </div>
              ) : s.event_style === 'banner' ? (
                <div className="flex flex-col gap-1.5 px-3 pb-2">
                  {(data?.events ?? []).map(ev => (
                    <div key={ev.id} className="relative rounded-xl overflow-hidden h-12" style={{ border: `1.5px solid ${p}44` }}>
                      {ev.image_url
                        ? <img src={ev.image_url} alt={ev.title} className="absolute inset-0 w-full h-full object-cover" />
                        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${p}bb, #f97316bb)` }} />}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
                      <div className="absolute inset-0 flex items-center px-2.5">
                        <p className="text-[8px] font-bold text-white line-clamp-1">{ev.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2 px-3 pb-2" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
                  {(data?.events ?? []).map(ev => (
                    <div key={ev.id} className="shrink-0 rounded-xl p-[2px]" style={{ background: p }}>
                      <div className="relative rounded-[9px] overflow-hidden w-20 h-28">
                        {ev.image_url
                          ? <img src={ev.image_url} alt={ev.title} className="absolute inset-0 w-full h-full object-cover" />
                          : <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-1">
                          <p className="text-white text-[7px] font-bold leading-tight line-clamp-2">{ev.title}</p>
                          {ev.date_label && <p className="text-white/60 text-[6px] mt-0.5">{ev.date_label}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Social links */}
          {(data?.socialLinks ?? []).length > 0 && (
            <div className="w-full mt-3 pb-4">
              {s.social_style === 'grid' ? (
                <div className="grid grid-cols-2 gap-1.5 px-3">
                  {(data?.socialLinks ?? []).map(sl => (
                    <div key={sl.key} className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border" style={{ borderColor: sl.bg + '44', background: isDark ? 'rgba(255,255,255,0.04)' : '#fff' }}>
                      <div className="w-5 h-5 rounded-full shrink-0" style={{ background: sl.bg }} />
                      <span className="text-[8px] font-semibold truncate" style={{ color: sl.bg }}>{sl.label}</span>
                    </div>
                  ))}
                </div>
              ) : s.social_style === 'icons' ? (
                <div className="flex gap-2 px-3 flex-wrap justify-center">
                  {(data?.socialLinks ?? []).map(sl => (
                    <div key={sl.key} className="flex flex-col items-center gap-0.5">
                      <div className="w-8 h-8 rounded-full" style={{ background: sl.bg }} />
                      <span className="text-[6px]" style={{ color: mutedColor }}>{sl.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex gap-1.5 px-3" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
                  {(data?.socialLinks ?? []).map(sl => (
                    <div key={sl.key} className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border" style={{ borderColor: sl.bg + '55', background: isDark ? 'rgba(255,255,255,0.05)' : '#fff' }}>
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ background: sl.bg }} />
                      <span className="text-[8px] font-semibold whitespace-nowrap" style={{ color: sl.bg }}>{sl.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Style option card ──────────────────────────────────────────
function StyleCard({ label, desc, active, onClick, preview }: {
  label: string; desc: string; active: boolean
  onClick: () => void; preview: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={cn('relative rounded-xl border p-2.5 text-left transition-all active:scale-95',
        active ? 'border-amber-500/70 bg-amber-500/8 shadow-lg shadow-amber-500/10'
               : 'border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5')}>
      {preview}
      <p className={cn('text-[11px] font-bold mt-2', active ? 'text-amber-400' : 'text-white/70')}>{label}</p>
      <p className="text-[9px] text-white/30 leading-snug">{desc}</p>
      {active && (
        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </button>
  )
}

// ── Category style previews ────────────────────────────────────
const CAT_PREVIEWS: { id: CategoryStyle; label: string; desc: string; preview: React.ReactNode }[] = [
  {
    id: 'circles', label: 'Circles', desc: 'Round icons with emoji',
    preview: (
      <div className="flex gap-2 px-1 py-2">
        {['#3b82f6','#ef4444','#10b981','#f59e0b'].map((c,i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full" style={{ background: c, outline: '2px solid #f59e0b', outlineOffset: '2px' }} />
            <div className="h-1 w-6 rounded-full bg-white/20" />
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'pills', label: 'Pills', desc: 'Text + icon pill tabs',
    preview: (
      <div className="flex flex-wrap gap-1.5 px-1 py-2">
        {[['#3b82f6','Pizza'],['#ef4444','Steak'],['#10b981','Drinks']].map(([c,l],i) => (
          <div key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold text-white" style={{ background: c }}>{l}</div>
        ))}
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] bg-white/8 text-white/40">Pasta</div>
      </div>
    ),
  },
  {
    id: 'square', label: 'Square Glass', desc: 'Rounded square with glow',
    preview: (
      <div className="flex gap-2 px-1 py-2">
        {['#3b82f6','#ef4444','#10b981','#f59e0b'].map((c,i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl" style={{ background: c + '25', border: `1.5px solid ${c}`, boxShadow: `0 0 6px ${c}40` }} />
            <div className="h-1 w-6 rounded-full bg-white/20" />
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'horizontal', label: 'Horizontal List', desc: 'Simple text tabs',
    preview: (
      <div className="flex gap-1.5 px-1 py-3 items-center">
        {['Pizza','Steak','Drinks','Pasta'].map((l,i) => (
          <div key={i} className="px-2 py-0.5 rounded text-[8px] font-semibold border"
            style={i === 0 ? { borderColor: '#f59e0b', color: '#f59e0b' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.35)' }}>{l}</div>
        ))}
      </div>
    ),
  },
]

// ── Item style previews ────────────────────────────────────────
const ITEM_PREVIEWS: { id: ItemStyle; label: string; desc: string; preview: React.ReactNode }[] = [
  {
    id: 'grid', label: 'Visual Grid', desc: '2-column cards with images',
    preview: (
      <div className="grid grid-cols-2 gap-1.5 p-1">
        {[0,1,2,3].map(i => (
          <div key={i} className="rounded-lg overflow-hidden bg-white/5 border border-white/8">
            <div className="w-full h-8 bg-white/8" />
            <div className="p-1 space-y-0.5">
              <div className="h-1 rounded-full bg-white/20 w-3/4" />
              <div className="h-1 rounded-full w-1/2" style={{ background: '#f59e0b60' }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'list', label: 'Classic List', desc: 'Image left, details right',
    preview: (
      <div className="space-y-1.5 p-1">
        {[0,1,2].map(i => (
          <div key={i} className="flex gap-2 rounded-lg overflow-hidden bg-white/5 border border-white/8">
            <div className="w-8 h-8 shrink-0 bg-white/10" />
            <div className="flex-1 py-1.5 space-y-0.5">
              <div className="h-1 rounded-full bg-white/20 w-3/4" />
              <div className="h-1 rounded-full w-1/2" style={{ background: '#f59e0b60' }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'compact', label: 'Compact', desc: 'Name + price, no images',
    preview: (
      <div className="space-y-0.5 p-1">
        {[0,1,2,3].map(i => (
          <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded"
            style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="h-1 rounded-full bg-white/20 w-1/2" />
            <div className="flex items-center gap-1">
              <div className="h-1 rounded-full w-6" style={{ background: '#f59e0b60' }} />
              <div className="w-4 h-4 rounded-full" style={{ background: '#f59e0b40' }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
]

// ── Event style previews ───────────────────────────────────────
const EVENT_PREVIEWS: { id: EventStyle; label: string; desc: string; preview: React.ReactNode }[] = [
  {
    id: 'cards', label: 'Scroll Cards', desc: 'Horizontal cards with image',
    preview: (
      <div className="flex gap-2 p-1 overflow-hidden">
        {[0,1,2].map(i => (
          <div key={i} className="shrink-0 w-16 h-20 rounded-xl overflow-hidden relative bg-white/8">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-1 left-1 right-1">
              <div className="h-1 rounded-full bg-white/60 w-3/4" />
              <div className="h-0.5 rounded-full bg-white/30 w-1/2 mt-0.5" />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'banner', label: 'Full Banner', desc: 'Wide auto-sliding banner',
    preview: (
      <div className="p-1">
        <div className="w-full h-16 rounded-xl bg-white/8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-rose-500/20" />
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-1">
            <div className="h-1.5 rounded-full bg-white/40 w-24" />
            <div className="h-1 rounded-full bg-white/25 w-16" />
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full" style={{ background: i === 0 ? '#f59e0b' : 'rgba(255,255,255,0.3)' }} />)}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'story', label: 'Story Style', desc: 'Instagram-style circles',
    preview: (
      <div className="flex gap-2 p-1 py-2">
        {[0,1,2,3].map(i => (
          <div key={i} className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/8"
              style={{ outline: `2px solid ${i === 0 ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`, outlineOffset: '2px' }}>
              <div className="w-full h-full bg-gradient-to-br from-amber-500/40 to-rose-500/40" />
            </div>
            <div className="h-1 rounded-full bg-white/20 w-8" />
          </div>
        ))}
      </div>
    ),
  },
]

// ── Social style previews ──────────────────────────────────────
const SOCIAL_PREVIEWS: { id: SocialStyle; label: string; desc: string; preview: React.ReactNode }[] = [
  {
    id: 'pills', label: 'Pill Buttons', desc: 'Icon + label in pill shape',
    preview: (
      <div className="flex flex-wrap gap-1.5 p-1">
        {[['#1877f2','F'],['#e1306c','I'],['#25d366','W'],['#010101','T']].map(([c,l],i) => (
          <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/8 border border-white/10">
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: c }}>{l}</div>
            <div className="h-1 rounded-full bg-white/30 w-8" />
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'grid', label: 'Icon Grid', desc: '2-column grid with labels',
    preview: (
      <div className="grid grid-cols-4 gap-1.5 p-1">
        {[['#1877f2','F'],['#e1306c','I'],['#25d366','W'],['#010101','T'],['#ff0000','Y'],['#fffc00','S'],['#14171a','X'],['#10b981','📍']].map(([c,l],i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: c }}>{l}</div>
            <div className="h-0.5 w-5 rounded-full bg-white/20" />
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'icons', label: 'Icons Only', desc: 'Minimal icon circles',
    preview: (
      <div className="flex gap-2 p-1 justify-center">
        {[['#1877f2','F'],['#e1306c','I'],['#25d366','W'],['#010101','T'],['#ff0000','Y']].map(([c,l],i) => (
          <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg" style={{ background: c }}>{l}</div>
        ))}
      </div>
    ),
  },
]

// ── Surface style previews ─────────────────────────────────────
const SURFACE_PREVIEWS: { id: SurfaceStyle; label: string; desc: string }[] = [
  { id: 'solid',  label: 'Solid',          desc: 'Clean solid background' },
  { id: 'glass',  label: 'Glassmorphism',  desc: 'Frosted glass effect' },
  { id: 'card',   label: 'Card',           desc: 'Elevated card surfaces' },
]

// ── Main page ──────────────────────────────────────────────────
export default function OnlineMenuTemplatePage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setRestaurantId(localStorage.getItem('restaurant_id'))
    setRestaurantSlug(localStorage.getItem('restaurant_slug'))
    setMounted(true)
  }, [])

  const { data: swrData, isLoading: swrLoading, mutate } = useOnlineMenuSettings(restaurantId)
  const loading = !mounted || swrLoading

  const [settings, setSettings] = useState<MenuSettings>(DEFAULT)
  const [preview,  setPreview]  = useState<PreviewData | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Sync local state from SWR cache
  useEffect(() => {
    if (!swrData) return
    if (swrData.settings) {
      const d = swrData.settings
      setSettings({
        template:          (d.template          ?? DEFAULT.template)          as TemplateId,
        primary_color:     d.primary_color      ?? DEFAULT.primary_color,
        surface_style:     (d.surface_style     ?? DEFAULT.surface_style)     as SurfaceStyle,
        category_style:    (d.category_style    ?? DEFAULT.category_style)    as CategoryStyle,
        item_style:        (d.item_style        ?? DEFAULT.item_style)        as ItemStyle,
        event_style:       (d.event_style       ?? DEFAULT.event_style)       as EventStyle,
        social_style:      (d.social_style      ?? DEFAULT.social_style)      as SocialStyle,
        show_prices:       d.show_prices        ?? true,
        show_descriptions: d.show_descriptions  ?? true,
        welcome_text:      d.welcome_text       ?? null,
      })
    }
    setPreview(swrData.preview)
  }, [swrData])

  const save = async () => {
    if (!restaurantId) return
    setSaving(true); setError(null)
    const { error: err } = await supabase
      .from('menu_template_settings')
      .upsert({ ...settings, restaurant_id: restaurantId, updated_at: new Date().toISOString() }, { onConflict: 'restaurant_id' })
    if (err) { setError(err.message); setSaving(false); return }
    // Update SWR cache with saved settings
    mutate(prev => prev ? { ...prev, settings: { ...settings } } : prev, false)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const set = <K extends keyof MenuSettings>(k: K, v: MenuSettings[K]) =>
    setSettings(s => ({ ...s, [k]: v }))

  const applyPreset = (p: typeof PRESETS[0]) =>
    setSettings(s => ({ ...s, template: p.id, ...p.settings }))

  const publicUrl = restaurantSlug && typeof window !== 'undefined'
    ? `${window.location.origin}/r/${restaurantSlug}` : ''

  const copyLink = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="flex gap-6 items-start">

      {/* ── Left: settings ───────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5 pb-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-400" /> {t.om_title}
            </h2>
            <p className="text-xs text-white/40 mt-0.5">{t.om_subtitle}</p>
          </div>
          <button onClick={save} disabled={saving}
            className={cn('shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95',
              saved ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25')}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? t.saved_ : saving ? t.save_changes : t.save_changes}
          </button>
        </div>

        {error && <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">{error}</div>}

        {/* Menu links */}
        <div className="rounded-2xl bg-white/4 border border-white/10 p-4 space-y-3">
          {/* Browse-only link */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3 h-3" /> {t.om_link}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden">
                <span className="text-xs text-white/50 truncate font-mono">{publicUrl || 'Loading…'}</span>
              </div>
              <button onClick={copyLink}
                className={cn('shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 border',
                  copied ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400' : 'bg-white/8 border-white/12 text-white/60 hover:text-white')}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t.om_copied : t.om_copy}
              </button>
              {publicUrl && (
                <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white/70 transition-all">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="border-t border-white/8" />

          {/* Delivery ordering link */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-1.5 flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" /> Delivery Order Menu
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden">
                <span className="text-xs text-white/50 truncate font-mono">
                  {restaurantSlug && typeof window !== 'undefined' ? `${window.location.origin}/order/${restaurantSlug}` : 'Loading…'}
                </span>
              </div>
              <button
                onClick={() => {
                  const url = restaurantSlug && typeof window !== 'undefined' ? `${window.location.origin}/order/${restaurantSlug}` : ''
                  if (url) { navigator.clipboard.writeText(url) }
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 border bg-white/8 border-white/12 text-white/60 hover:text-white">
                <Copy className="w-3.5 h-3.5" /> {t.om_copy}
              </button>
              {restaurantSlug && typeof window !== 'undefined' && (
                <a href={`${window.location.origin}/order/${restaurantSlug}`} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white/70 transition-all">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 1. Quick presets */}
        <div className="rounded-2xl bg-white/4 border border-white/10 p-4">
          <p className="text-sm font-semibold text-white mb-1">Quick Start Presets</p>
          <p className="text-xs text-white/30 mb-3">Pick a preset then fine-tune below</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => applyPreset(p)}
                className={cn('relative rounded-xl border p-2 flex flex-col items-center gap-1.5 transition-all active:scale-95',
                  settings.template === p.id && JSON.stringify(settings.primary_color) === JSON.stringify(p.settings.primary_color)
                    ? 'border-amber-500/70 bg-amber-500/8' : 'border-white/10 bg-white/3 hover:border-white/20')}>
                <div className="w-8 h-8 rounded-full border-2" style={{ background: p.bg, borderColor: p.dot + '80' }}>
                  <div className="w-full h-full rounded-full flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full" style={{ background: p.dot }} />
                  </div>
                </div>
                <p className="text-[9px] font-semibold text-white/60">{p.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Theme color */}
        <div className="rounded-2xl bg-white/4 border border-white/10 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-white">Theme Color</p>
            <p className="text-xs text-white/30">Primary accent for buttons, rings, prices</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map(c => (
              <button key={c.value} onClick={() => set('primary_color', c.value)} title={c.label}
                className={cn('w-8 h-8 rounded-xl border-2 transition-all active:scale-90',
                  settings.primary_color === c.value ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105')}
                style={{ background: c.value }} />
            ))}
            <label className="relative w-8 h-8 rounded-xl border-2 border-white/20 overflow-hidden cursor-pointer hover:border-white/40 transition-all flex items-center justify-center" title="Custom">
              <span className="text-white/40 text-xs">+</span>
              <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg border border-white/20" style={{ background: settings.primary_color }} />
            <span className="text-xs text-white/40 font-mono">{settings.primary_color}</span>
          </div>

          {/* Surface style */}
          <div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Surface Style</p>
            <div className="grid grid-cols-3 gap-2">
              {SURFACE_PREVIEWS.map(s => (
                <button key={s.id} onClick={() => set('surface_style', s.id)}
                  className={cn('rounded-xl border p-3 text-left transition-all active:scale-95',
                    settings.surface_style === s.id ? 'border-amber-500/70 bg-amber-500/8' : 'border-white/10 bg-white/3 hover:border-white/20')}>
                  <p className={cn('text-xs font-bold', settings.surface_style === s.id ? 'text-amber-400' : 'text-white/70')}>{s.label}</p>
                  <p className="text-[9px] text-white/30 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Category style */}
        <div className="rounded-2xl bg-white/4 border border-white/10 p-4">
          <p className="text-sm font-semibold text-white mb-1">Category Style</p>
          <p className="text-xs text-white/30 mb-3">How menu categories are displayed</p>
          <div className="grid grid-cols-2 gap-3">
            {CAT_PREVIEWS.map(c => (
              <StyleCard key={c.id} label={c.label} desc={c.desc}
                active={settings.category_style === c.id}
                onClick={() => set('category_style', c.id)}
                preview={<div className="rounded-lg bg-white/5 border border-white/8 overflow-hidden">{c.preview}</div>} />
            ))}
          </div>
        </div>

        {/* 4. Item card style */}
        <div className="rounded-2xl bg-white/4 border border-white/10 p-4">
          <p className="text-sm font-semibold text-white mb-1">Item Card Style</p>
          <p className="text-xs text-white/30 mb-3">How menu items appear inside a category</p>
          <div className="grid grid-cols-3 gap-3">
            {ITEM_PREVIEWS.map(c => (
              <StyleCard key={c.id} label={c.label} desc={c.desc}
                active={settings.item_style === c.id}
                onClick={() => set('item_style', c.id)}
                preview={<div className="rounded-lg bg-white/5 border border-white/8 overflow-hidden">{c.preview}</div>} />
            ))}
          </div>
        </div>

        {/* 5. Events style */}
        <div className="rounded-2xl bg-white/4 border border-white/10 p-4">
          <p className="text-sm font-semibold text-white mb-1">Events &amp; Offers Style</p>
          <p className="text-xs text-white/30 mb-3">How promotions and events are showcased</p>
          <div className="grid grid-cols-3 gap-3">
            {EVENT_PREVIEWS.map(c => (
              <StyleCard key={c.id} label={c.label} desc={c.desc}
                active={settings.event_style === c.id}
                onClick={() => set('event_style', c.id)}
                preview={<div className="rounded-lg bg-white/5 border border-white/8 overflow-hidden">{c.preview}</div>} />
            ))}
          </div>
        </div>

        {/* 6. Social style */}
        <div className="rounded-2xl bg-white/4 border border-white/10 p-4">
          <p className="text-sm font-semibold text-white mb-1">Social Media Style</p>
          <p className="text-xs text-white/30 mb-3">How social links appear at the bottom</p>
          <div className="grid grid-cols-3 gap-3">
            {SOCIAL_PREVIEWS.map(c => (
              <StyleCard key={c.id} label={c.label} desc={c.desc}
                active={settings.social_style === c.id}
                onClick={() => set('social_style', c.id)}
                preview={<div className="rounded-lg bg-white/5 border border-white/8 overflow-hidden">{c.preview}</div>} />
            ))}
          </div>
        </div>

        {/* 7. Display options */}
        <div className="rounded-2xl bg-white/4 border border-white/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Display Options</p>
          {[
            { k: 'show_prices'       as const, label: 'Show Prices',       desc: 'Display item prices to guests' },
            { k: 'show_descriptions' as const, label: 'Show Descriptions', desc: 'Show item descriptions below name' },
          ].map(opt => (
            <div key={opt.k} className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/80 font-medium">{opt.label}</p>
                <p className="text-xs text-white/30">{opt.desc}</p>
              </div>
              <button onClick={() => set(opt.k, !settings[opt.k])}
                className={cn('relative w-11 h-6 rounded-full border transition-all duration-200 shrink-0',
                  settings[opt.k] ? 'bg-amber-500 border-amber-500' : 'bg-white/8 border-white/15')}>
                <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200',
                  settings[opt.k] ? 'left-[22px]' : 'left-0.5')} />
              </button>
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Welcome Message</label>
            <input type="text" value={settings.welcome_text ?? ''}
              onChange={e => set('welcome_text', e.target.value || null)}
              placeholder="Welcome! Browse our menu and order from your table."
              maxLength={120}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 transition-all" />
          </div>
        </div>

      </div>

      {/* ── Right: live phone preview ─────────────────────── */}
      <div className="hidden lg:flex flex-col items-center gap-3 sticky top-0 pt-0" style={{ width: 300, minWidth: 300 }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-white/40 font-medium">Live Preview</span>
        </div>
        <PhonePreview s={settings} data={preview} />
        <p className="text-[10px] text-white/20 text-center mt-1 px-4">
          Updates instantly as you change styles
        </p>
      </div>

    </div>
  )
}
