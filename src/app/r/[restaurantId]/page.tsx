'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, UtensilsCrossed, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

// ── Types ─────────────────────────────────────────────────────
type TemplateId = 'classic' | 'dark' | 'warm' | 'bold' | 'elegant' | 'neon'
interface Restaurant { id: string; name: string; logo_url: string | null; settings: Record<string, string> }
interface Category   { id: string; name: string; color: string; icon: string | null; sort_order: number }
interface EventOffer { id: string; title: string; description: string | null; date_label: string | null; image_url: string | null }
interface MenuItem   { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null }

// ── Template config ───────────────────────────────────────────
interface TplCfg {
  pageBg: string; nameColor: string
  chipBg: string; chipText: string
  welcomeColor: string
  catLayout: 'circles' | 'pills'; catAccent: string
  sectionTitle: string
  itemLayout: 'grid' | 'list'; cardBg: string; cardBorder: string
  itemName: string; priceColor: string
  btnBg: string; btnText: string
  backBtn: string; divider: string
}
const TEMPLATES: Record<TemplateId, TplCfg> = {
  classic: {
    pageBg: 'bg-white', nameColor: 'text-gray-900',
    chipBg: 'bg-amber-100', chipText: 'text-amber-700',
    welcomeColor: 'text-gray-400', catLayout: 'circles', catAccent: '#f59e0b',
    sectionTitle: 'text-gray-900',
    itemLayout: 'grid', cardBg: 'bg-white', cardBorder: 'border-gray-100',
    itemName: 'text-gray-800', priceColor: 'text-amber-500',
    btnBg: 'bg-amber-500', btnText: 'text-white', backBtn: 'text-gray-500', divider: 'border-gray-100',
  },
  dark: {
    pageBg: 'bg-[#080c14]', nameColor: 'text-white',
    chipBg: 'bg-amber-500/15', chipText: 'text-amber-400',
    welcomeColor: 'text-white/40', catLayout: 'circles', catAccent: '#f59e0b',
    sectionTitle: 'text-white',
    itemLayout: 'grid', cardBg: 'bg-white/5', cardBorder: 'border-white/10',
    itemName: 'text-white/90', priceColor: 'text-amber-400',
    btnBg: 'bg-amber-500', btnText: 'text-white', backBtn: 'text-white/50', divider: 'border-white/8',
  },
  warm: {
    pageBg: 'bg-[#fdf6ec]', nameColor: 'text-[#451a03]',
    chipBg: 'bg-amber-100', chipText: 'text-amber-800',
    welcomeColor: 'text-amber-700/60', catLayout: 'circles', catAccent: '#b45309',
    sectionTitle: 'text-[#451a03]',
    itemLayout: 'grid', cardBg: 'bg-white', cardBorder: 'border-amber-100',
    itemName: 'text-[#451a03]', priceColor: 'text-amber-600',
    btnBg: 'bg-amber-700', btnText: 'text-white', backBtn: 'text-amber-700/60', divider: 'border-amber-100',
  },
  bold: {
    pageBg: 'bg-white', nameColor: 'text-gray-900',
    chipBg: 'bg-violet-100', chipText: 'text-violet-700',
    welcomeColor: 'text-gray-500', catLayout: 'pills', catAccent: '#7c3aed',
    sectionTitle: 'text-gray-900',
    itemLayout: 'list', cardBg: 'bg-white', cardBorder: 'border-gray-100',
    itemName: 'text-gray-900', priceColor: 'text-violet-600',
    btnBg: 'bg-violet-600', btnText: 'text-white', backBtn: 'text-gray-500', divider: 'border-gray-100',
  },
  elegant: {
    pageBg: 'bg-[#f7f4f0]', nameColor: 'text-[#1c1917]',
    chipBg: 'bg-stone-200', chipText: 'text-stone-700',
    welcomeColor: 'text-stone-400', catLayout: 'pills', catAccent: '#a8896c',
    sectionTitle: 'text-[#1c1917]',
    itemLayout: 'list', cardBg: 'bg-white', cardBorder: 'border-stone-200',
    itemName: 'text-stone-900', priceColor: 'text-stone-600',
    btnBg: 'bg-stone-800', btnText: 'text-white', backBtn: 'text-stone-500', divider: 'border-stone-200',
  },
  neon: {
    pageBg: 'bg-[#0a0a0f]', nameColor: 'text-white',
    chipBg: 'bg-[#39ff14]/10', chipText: 'text-[#39ff14]',
    welcomeColor: 'text-white/40', catLayout: 'circles', catAccent: '#39ff14',
    sectionTitle: 'text-white',
    itemLayout: 'grid', cardBg: 'bg-white/5', cardBorder: 'border-white/8',
    itemName: 'text-white/90', priceColor: 'text-[#39ff14]',
    btnBg: 'bg-[#39ff14]', btnText: 'text-black', backBtn: 'text-white/40', divider: 'border-white/8',
  },
}

// ── Social icons ──────────────────────────────────────────────
function FacebookIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" /></svg>
}
function InstagramIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
}
function WhatsAppIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
}
function TwitterXIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
}
function TikTokIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.84a8.23 8.23 0 004.83 1.55V6.93a4.85 4.85 0 01-1.06-.24z" /></svg>
}
function SnapchatIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12.166 3C9.492 3 7.13 4.41 6.02 6.604l-.042.092c-.168.38-.261.794-.261 1.23v.351c0 .06-.003.12-.008.18a3.52 3.52 0 01-.454.07c-.213.02-.435.03-.659.03-.176 0-.35-.006-.516-.02l-.098-.008a.62.62 0 00-.65.588.614.614 0 00.513.612c.028.005.748.147 1.747.277.082.01.15.066.175.144.268.847.82 1.578 1.56 2.079-.07.04-.14.082-.21.127-.49.31-1.245.787-1.245 1.597 0 .657.503 1.17 1.151 1.17.194 0 .396-.046.607-.138.481-.21 1.04-.455 1.636-.455.124 0 .248.01.37.032-.085.31-.13.64-.13.98 0 1.84 1.265 3.333 2.82 3.333 1.553 0 2.818-1.494 2.818-3.334 0-.338-.045-.667-.129-.977.123-.02.247-.032.371-.032.596 0 1.155.246 1.636.456.211.092.413.138.607.138.648 0 1.151-.514 1.151-1.17 0-.81-.754-1.287-1.245-1.598a3.48 3.48 0 00-.21-.127c.74-.5 1.292-1.232 1.56-2.079a.194.194 0 01.175-.144c.999-.13 1.719-.272 1.747-.277a.614.614 0 00.513-.612.62.62 0 00-.648-.588l-.1.008c-.165.014-.34.02-.515.02-.224 0-.446-.01-.659-.03a3.528 3.528 0 01-.454-.07 1.765 1.765 0 00-.008-.18v-.35c0-.437-.093-.851-.261-1.231L17.98 6.604C16.87 4.41 14.508 3 11.834 3h.332z" /></svg>
}
function YoutubeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20.06 12 20.06 12 20.06s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" /></svg>
}

function buildHref(key: string, value: string) {
  if (!value) return '#'
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  switch (key) {
    case 'instagram': return `https://instagram.com/${value}`
    case 'facebook':  return `https://facebook.com/${value}`
    case 'twitter':   return `https://x.com/${value}`
    case 'whatsapp':  return `https://wa.me/${value.replace(/\D/g, '')}`
    case 'tiktok':    return `https://tiktok.com/@${value}`
    case 'youtube':   return `https://youtube.com/@${value}`
    case 'snapchat':  return `https://snapchat.com/add/${value}`
    default:          return value
  }
}

export default function PublicMenuPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>()
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [events, setEvents]         = useState<EventOffer[]>([])
  const [items, setItems]           = useState<MenuItem[]>([])
  const [tpl, setTpl]               = useState<TplCfg>(TEMPLATES.classic)
  const [showPrices, setShowPrices] = useState(true)
  const [showDescs, setShowDescs]   = useState(true)
  const [welcomeText, setWelcomeText] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)

  const [activeId, setActiveId]     = useState<string | null>(null)
  const [showItems, setShowItems]   = useState(false)

  const load = useCallback(async () => {
    const [restRes, catsRes, eventsRes, itemsRes, tplRes] = await Promise.all([
      supabase.from('restaurants').select('id, name, logo_url, settings').eq('id', restaurantId).maybeSingle(),
      supabase.from('menu_categories').select('id, name, color, icon, sort_order').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order'),
      supabase.from('events_offers').select('id, title, description, date_label, image_url').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order'),
      supabase.from('menu_items').select('id, name, description, price, image_url, category_id').eq('restaurant_id', restaurantId).eq('available', true).order('sort_order'),
      supabase.from('menu_template_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
    ])

    if (!restRes.data) { setLoading(false); return }
    setRestaurant(restRes.data as Restaurant)
    setCategories((catsRes.data ?? []) as Category[])
    setEvents((eventsRes.data ?? []) as EventOffer[])
    setItems((itemsRes.data ?? []) as MenuItem[])

    if (tplRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = tplRes.data as any
      const id = (d.template ?? 'classic') as TemplateId
      setTpl(TEMPLATES[id] ?? TEMPLATES.classic)
      setShowPrices(d.show_prices ?? true)
      setShowDescs(d.show_descriptions ?? true)
      setWelcomeText(d.welcome_text ?? null)
    }
    setLoading(false)
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className={`min-h-screen ${TEMPLATES.classic.pageBg} flex items-center justify-center`}>
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
    </div>
  )
  if (!restaurant) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <UtensilsCrossed className="w-10 h-10 text-gray-200" />
    </div>
  )

  const rst = (restaurant.settings ?? {}) as Record<string, string>
  const isDark = tpl.pageBg.includes('080c') || tpl.pageBg.includes('0a0a')

  const socialLinks = [
    { key: 'facebook',  value: rst.facebook  ?? '', label: 'Facebook',  icon: <FacebookIcon  className="w-5 h-5" />, iconBg: '#1877f2', textColor: '#1877f2', borderColor: '#bfdbfe' },
    { key: 'instagram', value: rst.instagram ?? '', label: 'Instagram', icon: <InstagramIcon className="w-5 h-5" />, iconBg: '#e1306c', textColor: '#e1306c', borderColor: '#fbcfe8' },
    { key: 'snapchat',  value: rst.snapchat  ?? '', label: 'Snapchat',  icon: <SnapchatIcon  className="w-5 h-5" />, iconBg: '#fffc00', textColor: '#ca8a04', borderColor: '#fef08a' },
    { key: 'whatsapp',  value: rst.whatsapp  ?? '', label: 'WhatsApp',  icon: <WhatsAppIcon  className="w-5 h-5" />, iconBg: '#25d366', textColor: '#16a34a', borderColor: '#bbf7d0' },
    { key: 'tiktok',    value: rst.tiktok    ?? '', label: 'TikTok',    icon: <TikTokIcon    className="w-5 h-5" />, iconBg: '#010101', textColor: '#111827', borderColor: '#e5e7eb' },
    { key: 'twitter',   value: rst.twitter   ?? '', label: 'X',         icon: <TwitterXIcon  className="w-5 h-5" />, iconBg: '#14171a', textColor: '#111827', borderColor: '#e5e7eb' },
    { key: 'youtube',   value: rst.youtube   ?? '', label: 'YouTube',   icon: <YoutubeIcon   className="w-5 h-5" />, iconBg: '#ff0000', textColor: '#dc2626', borderColor: '#fecaca' },
    { key: 'maps',      value: rst.maps_url  ?? '', label: 'Location',  icon: <MapPin        className="w-5 h-5" />, iconBg: '#10b981', textColor: '#059669', borderColor: '#a7f3d0' },
  ].filter(s => s.value.trim() !== '')

  const activeCat  = categories.find(c => c.id === activeId)
  const activeItems = items.filter(i => i.category_id === activeId)

  return (
    <div className={`min-h-screen ${tpl.pageBg} flex flex-col items-center pt-14 text-center pb-20`}>
      <style>{`.scroll-hide::-webkit-scrollbar{display:none}`}</style>

      {/* Logo */}
      <div className="w-32 h-32 rounded-full overflow-hidden shadow-xl"
        style={{ outline: `4px solid ${tpl.catAccent}`, outlineOffset: '4px', background: '#f3f4f6' }}>
        {restaurant.logo_url
          ? <img src={restaurant.logo_url} alt={restaurant.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: tpl.catAccent }}>
              <span className="text-white text-5xl font-bold">{restaurant.name.charAt(0).toUpperCase()}</span>
            </div>
        }
      </div>

      {/* Name */}
      <h1 className={`mt-4 text-2xl font-bold tracking-tight px-6 ${tpl.nameColor}`}>{restaurant.name}</h1>

      {/* Browse badge */}
      <span className={`mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${tpl.chipBg} ${tpl.chipText}`}>
        Browse Menu
      </span>

      {/* Welcome */}
      <p className={`mt-3 text-sm px-8 ${tpl.welcomeColor}`}>
        {welcomeText || 'Welcome! Browse our menu below.'}
      </p>

      {/* ── Category navigation ── */}
      {categories.length > 0 && !showItems && (
        <div className="w-full mt-6 overflow-x-hidden">
          {tpl.catLayout === 'circles' ? (
            <div className="scroll-hide flex gap-5 overflow-x-auto px-6 py-4"
              style={{ scrollbarWidth: 'none', overflowY: 'visible' } as React.CSSProperties}>
              {categories.map(cat => {
                const isActive = activeId === cat.id
                return (
                  <button key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="flex flex-col items-center gap-2 shrink-0 focus:outline-none">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-all duration-200"
                      style={{ background: cat.color,
                        outline: `3px solid ${tpl.catAccent}`, outlineOffset: '3px',
                        boxShadow: isActive ? '0 6px 20px rgba(0,0,0,0.25)' : '0 3px 10px rgba(0,0,0,0.12)',
                        transform: isActive ? 'scale(1.12)' : 'scale(1)' }}>
                      {cat.icon
                        ? <span className="text-3xl leading-none">{cat.icon}</span>
                        : <span className="text-white text-xl font-bold">{cat.name.charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    <span className="text-xs font-semibold w-16 text-center leading-tight line-clamp-1"
                      style={{ color: isActive ? cat.color : (isDark ? '#9ca3af' : '#6b7280') }}>
                      {cat.name}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="scroll-hide flex gap-2 overflow-x-auto px-6 py-3"
              style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
              {categories.map(cat => {
                const isActive = activeId === cat.id
                return (
                  <button key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
                    style={isActive
                      ? { background: cat.color, color: '#fff', boxShadow: `0 4px 12px ${cat.color}50` }
                      : { background: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6', color: isDark ? 'rgba(255,255,255,0.5)' : '#6b7280' }}>
                    {cat.icon && <span className="text-base leading-none">{cat.icon}</span>}
                    {cat.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Category items view ── */}
      {showItems && activeId && (
        <div className="w-full mt-4 px-4 pb-10 text-left">
          <button onClick={() => setShowItems(false)}
            className={`mb-4 ml-2 flex items-center gap-1.5 text-sm font-semibold transition-colors ${tpl.backBtn}`}>
            ← Back
          </button>
          {activeCat && (
            <div className="flex items-center gap-2 mb-4 px-2">
              <span className="w-3 h-3 rounded-full" style={{ background: activeCat.color }} />
              <h2 className={`text-lg font-bold ${tpl.sectionTitle}`}>{activeCat.name}</h2>
              <span className="text-sm text-gray-400">({activeItems.length})</span>
            </div>
          )}
          {activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <UtensilsCrossed className="w-10 h-10 text-gray-200" />
              <p className="text-gray-400 text-sm">No items in this category</p>
            </div>
          ) : tpl.itemLayout === 'list' ? (
            <div className="space-y-3">
              {activeItems.map(item => (
                <div key={item.id} className={`flex gap-3 rounded-2xl border shadow-sm overflow-hidden ${tpl.cardBg} ${tpl.cardBorder}`}>
                  <div className="w-20 h-20 shrink-0 bg-gray-100 overflow-hidden">
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-gray-200" /></div>
                    }
                  </div>
                  <div className="flex-1 py-3 pr-3 flex flex-col gap-1">
                    <p className={`text-sm font-bold line-clamp-1 ${tpl.itemName}`}>{item.name}</p>
                    {showDescs && item.description && (
                      <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{item.description}</p>
                    )}
                    {showPrices && <p className={`text-sm font-extrabold mt-auto ${tpl.priceColor}`}>{formatPrice(item.price)}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {activeItems.map(item => (
                <div key={item.id} className={`rounded-2xl border shadow-sm overflow-hidden flex flex-col ${tpl.cardBg} ${tpl.cardBorder}`}>
                  <div className="relative w-full aspect-square" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb' }}>
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
                      : <div className="absolute inset-0 flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-gray-200" /></div>
                    }
                  </div>
                  <div className="p-2 flex-1 flex flex-col gap-1">
                    <p className={`text-xs font-bold line-clamp-2 leading-snug ${tpl.itemName}`}>{item.name}</p>
                    {showDescs && item.description && (
                      <p className="text-[10px] text-gray-400 line-clamp-1">{item.description}</p>
                    )}
                    {showPrices && <p className={`text-xs font-extrabold ${tpl.priceColor}`}>{formatPrice(item.price)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Events & Social (hidden while browsing items) ── */}
      {!showItems && (
        <>
          {events.length > 0 && (
            <div className="w-full mt-6 text-left">
              <h2 className={`text-lg font-bold mb-3 px-6 ${tpl.sectionTitle}`}>Event &amp; Offers</h2>
              <div className="scroll-hide flex gap-3 overflow-x-auto px-6 pb-2"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {events.map(ev => (
                  <div key={ev.id} className="relative rounded-2xl overflow-hidden shadow-sm shrink-0 w-40 h-56">
                    {ev.image_url
                      ? <img src={ev.image_url} alt={ev.title} className="absolute inset-0 w-full h-full object-cover" />
                      : <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500" />
                    }
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-white text-xs font-bold leading-snug line-clamp-2">{ev.title}</p>
                      {ev.date_label && <p className="text-white/70 text-[10px] mt-0.5">{ev.date_label}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {socialLinks.length > 0 && (
            <div className="w-full mt-6 pb-4 text-left">
              <div className="scroll-hide flex gap-3 overflow-x-auto px-6 py-2"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {socialLinks.map(s => (
                  <a key={s.key} href={buildHref(s.key, s.value)} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-full border bg-white shadow-sm active:scale-95 transition-all"
                    style={{ borderColor: s.borderColor }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: s.iconBg }}>
                      <span style={{ color: s.key === 'snapchat' ? '#111' : '#fff' }}>{s.icon}</span>
                    </div>
                    <span className="text-base font-semibold whitespace-nowrap" style={{ color: s.textColor }}>{s.label}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Powered by */}
          <p className="mt-6 text-xs text-gray-300">Powered by ClickGroup</p>
        </>
      )}
    </div>
  )
}
