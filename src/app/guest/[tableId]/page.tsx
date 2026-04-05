'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2, UtensilsCrossed, MapPin,
  ShoppingCart, Plus, Minus, X, CheckCircle2, ChevronRight,
  Clock, Flame, ChefHat,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { assignOrderNumber } from '@/lib/orderNumber'

interface Restaurant { id: string; name: string; logo_url: string | null; settings: Record<string, string> }
interface TableInfo  { id: string; restaurant_id: string; seq: number; table_number: string; name: string | null; group_id: string | null }
interface Category   { id: string; name: string; color: string; icon: string | null; sort_order: number }
interface EventOffer { id: string; title: string; description: string | null; date_label: string | null; image_url: string | null }
interface MenuItem  { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null }
interface KitchenNote { id: string; text: string }
interface GuestSelectedOption { modifier_id: string; modifier_name: string; option_id: string; option_name: string; price: number }
interface CartEntry { qty: number; selectedOptions: GuestSelectedOption[]; noteIds: string[]; customNote: string }
interface ModGroup { id: string; name: string; required: boolean; min_select: number; max_select: number; options: { id: string; name: string; price: number }[] }
interface TrackedItem { id: string; item_name: string; qty: number; status: 'pending' | 'sent' | 'cooking' | 'ready' | 'void' }

function trackedStatus(status: TrackedItem['status']) {
  switch (status) {
    case 'pending':  return { icon: <Clock className="w-4 h-4 text-amber-500" />,   label: 'Waiting for approval', color: 'text-amber-600', bg: 'bg-amber-50'   }
    case 'sent':     return { icon: <ChefHat className="w-4 h-4 text-blue-500" />,  label: 'In kitchen queue',     color: 'text-blue-600',  bg: 'bg-blue-50'    }
    case 'cooking':  return { icon: <Flame className="w-4 h-4 text-orange-500" />,  label: 'Being prepared',       color: 'text-orange-600',bg: 'bg-orange-50'  }
    case 'ready':    return { icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, label: 'Ready!',        color: 'text-emerald-600',bg: 'bg-emerald-50' }
    default:         return { icon: <X className="w-4 h-4 text-gray-400" />,        label: 'Cancelled',            color: 'text-gray-400',  bg: 'bg-gray-50'    }
  }
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

// ── Template configs ──────────────────────────────────────────
type TemplateId = 'classic' | 'dark' | 'warm' | 'bold' | 'elegant' | 'neon'

interface TplCfg {
  pageBg: string
  pageText: string
  logoRing: string          // CSS color
  nameColor: string
  tableChipBg: string
  tableChipText: string
  welcomeColor: string
  catLayout: 'circles' | 'pills'
  catActiveOutline: string  // CSS color for circle outline
  sectionTitleColor: string
  itemLayout: 'grid' | 'list'
  itemCardBg: string
  itemCardBorder: string
  itemNameColor: string
  priceColor: string
  addBtnBg: string
  addBtnText: string
  qtyBg: string
  qtyBorder: string
  qtyText: string
  backBtn: string
  dividerColor: string
}

const TEMPLATE_CONFIGS: Record<TemplateId, TplCfg> = {
  classic: {
    pageBg: 'bg-white', pageText: 'text-gray-900',
    logoRing: '#f59e0b',
    nameColor: 'text-gray-900',
    tableChipBg: 'bg-amber-100', tableChipText: 'text-amber-700',
    welcomeColor: 'text-gray-400',
    catLayout: 'circles', catActiveOutline: '#f59e0b',
    sectionTitleColor: 'text-gray-900',
    itemLayout: 'grid',
    itemCardBg: 'bg-white', itemCardBorder: 'border-gray-100',
    itemNameColor: 'text-gray-800', priceColor: 'text-amber-500',
    addBtnBg: 'bg-amber-500 active:bg-amber-600', addBtnText: 'text-white',
    qtyBg: 'bg-amber-50', qtyBorder: 'border-amber-200', qtyText: 'text-amber-700',
    backBtn: 'text-gray-500 hover:text-gray-800',
    dividerColor: 'border-gray-100',
  },
  dark: {
    pageBg: 'bg-[#080c14]', pageText: 'text-white',
    logoRing: '#f59e0b',
    nameColor: 'text-white',
    tableChipBg: 'bg-amber-500/15', tableChipText: 'text-amber-400',
    welcomeColor: 'text-white/40',
    catLayout: 'circles', catActiveOutline: '#f59e0b',
    sectionTitleColor: 'text-white',
    itemLayout: 'grid',
    itemCardBg: 'bg-white/5', itemCardBorder: 'border-white/10',
    itemNameColor: 'text-white/90', priceColor: 'text-amber-400',
    addBtnBg: 'bg-amber-500 active:bg-amber-600', addBtnText: 'text-white',
    qtyBg: 'bg-amber-500/10', qtyBorder: 'border-amber-500/20', qtyText: 'text-amber-400',
    backBtn: 'text-white/50 hover:text-white',
    dividerColor: 'border-white/8',
  },
  warm: {
    pageBg: 'bg-[#fdf6ec]', pageText: 'text-[#451a03]',
    logoRing: '#d97706',
    nameColor: 'text-[#451a03]',
    tableChipBg: 'bg-amber-100', tableChipText: 'text-amber-800',
    welcomeColor: 'text-amber-700/60',
    catLayout: 'circles', catActiveOutline: '#b45309',
    sectionTitleColor: 'text-[#451a03]',
    itemLayout: 'grid',
    itemCardBg: 'bg-white', itemCardBorder: 'border-amber-100',
    itemNameColor: 'text-[#451a03]', priceColor: 'text-amber-600',
    addBtnBg: 'bg-amber-700 active:bg-amber-800', addBtnText: 'text-white',
    qtyBg: 'bg-amber-50', qtyBorder: 'border-amber-200', qtyText: 'text-amber-800',
    backBtn: 'text-amber-700/60 hover:text-amber-900',
    dividerColor: 'border-amber-100',
  },
  bold: {
    pageBg: 'bg-white', pageText: 'text-gray-900',
    logoRing: '#7c3aed',
    nameColor: 'text-gray-900',
    tableChipBg: 'bg-violet-100', tableChipText: 'text-violet-700',
    welcomeColor: 'text-gray-500',
    catLayout: 'pills', catActiveOutline: '#7c3aed',
    sectionTitleColor: 'text-gray-900',
    itemLayout: 'list',
    itemCardBg: 'bg-white', itemCardBorder: 'border-gray-100',
    itemNameColor: 'text-gray-900', priceColor: 'text-violet-600',
    addBtnBg: 'bg-violet-600 active:bg-violet-700', addBtnText: 'text-white',
    qtyBg: 'bg-violet-50', qtyBorder: 'border-violet-200', qtyText: 'text-violet-700',
    backBtn: 'text-gray-500 hover:text-gray-800',
    dividerColor: 'border-gray-100',
  },
  elegant: {
    pageBg: 'bg-[#f7f4f0]', pageText: 'text-[#1c1917]',
    logoRing: '#a8896c',
    nameColor: 'text-[#1c1917]',
    tableChipBg: 'bg-stone-200', tableChipText: 'text-stone-700',
    welcomeColor: 'text-stone-400',
    catLayout: 'pills', catActiveOutline: '#a8896c',
    sectionTitleColor: 'text-[#1c1917]',
    itemLayout: 'list',
    itemCardBg: 'bg-white', itemCardBorder: 'border-stone-200',
    itemNameColor: 'text-stone-900', priceColor: 'text-stone-600',
    addBtnBg: 'bg-stone-800 active:bg-stone-900', addBtnText: 'text-white',
    qtyBg: 'bg-stone-100', qtyBorder: 'border-stone-300', qtyText: 'text-stone-700',
    backBtn: 'text-stone-500 hover:text-stone-800',
    dividerColor: 'border-stone-200',
  },
  neon: {
    pageBg: 'bg-[#0a0a0f]', pageText: 'text-white',
    logoRing: '#39ff14',
    nameColor: 'text-white',
    tableChipBg: 'bg-[#39ff14]/10', tableChipText: 'text-[#39ff14]',
    welcomeColor: 'text-white/40',
    catLayout: 'circles', catActiveOutline: '#39ff14',
    sectionTitleColor: 'text-white',
    itemLayout: 'grid',
    itemCardBg: 'bg-white/5', itemCardBorder: 'border-white/8',
    itemNameColor: 'text-white/90', priceColor: 'text-[#39ff14]',
    addBtnBg: 'bg-[#39ff14] active:opacity-80', addBtnText: 'text-black',
    qtyBg: 'bg-[#39ff14]/10', qtyBorder: 'border-[#39ff14]/30', qtyText: 'text-[#39ff14]',
    backBtn: 'text-white/40 hover:text-white',
    dividerColor: 'border-white/8',
  },
}

function buildSocialHref(key: string, value: string): string {
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

export default function GuestPage() {
  const { tableId } = useParams<{ tableId: string }>()
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [table, setTable]           = useState<TableInfo | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [events, setEvents]         = useState<EventOffer[]>([])
  const [menuItems, setMenuItems]   = useState<MenuItem[]>([])
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [showItems, setShowItems]   = useState(false)
  const [loading, setLoading]       = useState(true)

  const [kitchenNotes, setKitchenNotes] = useState<KitchenNote[]>([])
  const [catStationMap, setCatStationMap] = useState<Map<string, string>>(new Map())

  // Cart: itemId → CartEntry
  const [cart, setCart] = useState<Map<string, CartEntry>>(new Map())
  const [showCart, setShowCart]     = useState(false)
  const [itemModalId, setItemModalId] = useState<string | null>(null)
  const [placing, setPlacing]       = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [orderPlaced, setOrderPlaced] = useState(false)

  // Template + styles
  const [tpl, setTpl]               = useState<TplCfg>(TEMPLATE_CONFIGS.classic)
  const [primaryColor, setPrimaryColor] = useState('#f59e0b')
  const [categoryStyle, setCategoryStyle] = useState<'circles'|'pills'|'square'|'horizontal'>('circles')
  const [itemStyle, setItemStyle]   = useState<'grid'|'list'|'compact'>('grid')
  const [eventStyle, setEventStyle] = useState<'cards'|'banner'|'story'>('cards')
  const [socialStyle, setSocialStyle] = useState<'pills'|'grid'|'icons'>('pills')
  const [showPrices, setShowPrices] = useState(true)
  const [showDescs, setShowDescs]   = useState(true)
  const [welcomeText, setWelcomeText] = useState<string|null>(null)

  // Realtime order tracking
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
  const [trackedItems, setTrackedItems]     = useState<TrackedItem[]>([])

  const cartCount = useMemo(() => [...cart.values()].reduce((s, e) => s + e.qty, 0), [cart])
  const cartTotal = useMemo(() => {
    let total = 0
    cart.forEach((entry, id) => {
      const item = menuItems.find(m => m.id === id)
      if (item) total += (item.price + entry.selectedOptions.reduce((s, o) => s + o.price, 0)) * entry.qty
    })
    return total
  }, [cart, menuItems])

  const cartItems = useMemo(() => {
    const result: { item: MenuItem; entry: CartEntry }[] = []
    cart.forEach((entry, id) => {
      const item = menuItems.find(m => m.id === id)
      if (item) result.push({ item, entry })
    })
    return result
  }, [cart, menuItems])

  const load = useCallback(async () => {
    const { data: t } = await supabase
      .from('tables')
      .select('id, restaurant_id, seq, table_number, name, group_id')
      .eq('id', tableId)
      .maybeSingle()
    if (!t) { setLoading(false); return }
    setTable(t as TableInfo)

    const rid = (t as TableInfo).restaurant_id
    const [restRes, catsRes, eventsRes, itemsRes, notesRes, stationCatRes, tplRes] = await Promise.all([
      supabase.from('restaurants').select('id, name, logo_url, settings').eq('id', rid).maybeSingle(),
      supabase.from('menu_categories').select('id, name, color, icon, sort_order').eq('restaurant_id', rid).eq('active', true).order('sort_order'),
      supabase.from('events_offers').select('id, title, description, date_label, image_url').eq('restaurant_id', rid).eq('active', true).order('sort_order'),
      supabase.from('menu_items').select('id, name, description, price, image_url, category_id').eq('restaurant_id', rid).eq('available', true).order('sort_order'),
      supabase.from('kitchen_notes').select('id, text').eq('restaurant_id', rid).eq('active', true).order('sort_order'),
      supabase.from('kds_station_categories').select('station_id, category_id'),
      supabase.from('menu_template_settings').select('*').eq('restaurant_id', rid).maybeSingle(),
    ])
    if (restRes.data) setRestaurant(restRes.data as Restaurant)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = tplRes.data as any
    const tplId = (d?.template ?? 'classic') as TemplateId
    setTpl(TEMPLATE_CONFIGS[tplId] ?? TEMPLATE_CONFIGS.classic)
    if (d?.primary_color)   setPrimaryColor(d.primary_color)
    if (d?.category_style)  setCategoryStyle(d.category_style)
    if (d?.item_style)      setItemStyle(d.item_style)
    if (d?.event_style)     setEventStyle(d.event_style)
    if (d?.social_style)    setSocialStyle(d.social_style)
    if (d?.show_prices     !== undefined) setShowPrices(d.show_prices)
    if (d?.show_descriptions !== undefined) setShowDescs(d.show_descriptions)
    if (d?.welcome_text)    setWelcomeText(d.welcome_text)
    setCategories((catsRes.data ?? []) as Category[])
    setEvents((eventsRes.data ?? []) as EventOffer[])
    setMenuItems((itemsRes.data ?? []) as MenuItem[])
    setKitchenNotes((notesRes.data ?? []) as KitchenNote[])
    const csMap = new Map<string, string>()
    for (const a of (stationCatRes.data ?? [])) csMap.set(a.category_id, a.station_id)
    setCatStationMap(csMap)
    setLoading(false)
  }, [tableId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Realtime: track order item status changes for the current order
  useEffect(() => {
    if (!currentOrderId) return
    const channel = supabase
      .channel(`guest-order-${currentOrderId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'order_items',
        filter: `order_id=eq.${currentOrderId}`,
      }, (payload) => {
        const u = payload.new as TrackedItem
        setTrackedItems(prev => prev.map(i => i.id === u.id ? { ...i, status: u.status } : i))
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_items',
        filter: `order_id=eq.${currentOrderId}`,
      }, (payload) => {
        const n = payload.new as TrackedItem
        setTrackedItems(prev => prev.find(i => i.id === n.id) ? prev : [...prev, n])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentOrderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const getQty = (itemId: string) => cart.get(itemId)?.qty ?? 0

  const addOne = (itemId: string) => {
    setCart(prev => {
      const next = new Map(prev)
      const e = next.get(itemId)
      next.set(itemId, e ? { ...e, qty: e.qty + 1 } : { qty: 1, selectedOptions: [], noteIds: [], customNote: '' })
      return next
    })
  }

  const removeOne = (itemId: string) => {
    setCart(prev => {
      const next = new Map(prev)
      const e = next.get(itemId)
      if (!e) return prev
      if (e.qty <= 1) next.delete(itemId)
      else next.set(itemId, { ...e, qty: e.qty - 1 })
      return next
    })
  }

  const confirmItem = (itemId: string, entry: CartEntry) => {
    setCart(prev => {
      const next = new Map(prev)
      if (entry.qty <= 0) next.delete(itemId)
      else next.set(itemId, entry)
      return next
    })
    setItemModalId(null)
  }

  const placeOrder = async () => {
    if (!table || !restaurant || cartItems.length === 0) return
    setPlacing(true)
    setPlaceError(null)

    // Find or create active order for this table
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('restaurant_id', restaurant.id)
      .eq('table_number', table.seq)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let orderId = existing?.id
    if (!orderId) {
      const { data: newOrder, error: createErr } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurant.id,
          table_number:  table.seq,
          status:        'active',
          source:        'guest',
          total:         0,
        })
        .select('id')
        .single()
      if (createErr || !newOrder) {
        setPlaceError(createErr?.message ?? 'Failed to create order')
        setPlacing(false)
        return
      }
      orderId = newOrder.id
      // Assign order number immediately so KDS monitor can display it
      await assignOrderNumber(supabase, restaurant.id, orderId)
    }

    // Insert items with status 'pending' (awaiting staff approval)
    const rows = cartItems.map(({ item, entry }) => {
      const modNames  = entry.selectedOptions.map(o => o.option_name)
      const noteTxts  = entry.noteIds.map(id => kitchenNotes.find(n => n.id === id)?.text).filter(Boolean) as string[]
      if (entry.customNote.trim()) noteTxts.push(entry.customNote.trim())
      const modPrice  = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
      const allParts  = [...modNames, ...noteTxts]
      return {
        order_id:   orderId,
        item_name:  item.name,
        item_price: item.price + modPrice,
        qty:        entry.qty,
        status:     'pending',
        note:       allParts.length > 0 ? allParts.join(' · ') : null,
        station_id: item.category_id ? (catStationMap.get(item.category_id) ?? null) : null,
      }
    })

    const { data: insertedItems, error: insertErr } = await supabase
      .from('order_items').insert(rows).select('id, item_name, qty, status')
    if (insertErr) {
      setPlaceError(insertErr.message)
      setPlacing(false)
      return
    }

    // Update order total
    const addedTotal = cartItems.reduce((s, { item, entry }) => {
      const modPrice = entry.selectedOptions.reduce((m, o) => m + o.price, 0)
      return s + (item.price + modPrice) * entry.qty
    }, 0)
    await supabase
      .from('orders')
      .update({ total: addedTotal, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    // Set realtime tracking
    setCurrentOrderId(orderId)
    if (insertedItems) {
      setTrackedItems(prev => {
        const existingIds = new Set(prev.map(i => i.id))
        const newItems = (insertedItems as TrackedItem[]).filter(i => !existingIds.has(i.id))
        return [...prev, ...newItems]
      })
    }

    setCart(new Map())
    setShowCart(false)
    setOrderPlaced(true)
    setPlacing(false)
  }

  if (loading) return (
    <div className={`min-h-screen ${tpl.pageBg} flex items-center justify-center`}>
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
    </div>
  )

  if (!restaurant) return (
    <div className={`min-h-screen ${tpl.pageBg} flex items-center justify-center`}>
      <UtensilsCrossed className="w-10 h-10 text-gray-200" />
    </div>
  )

  const tableLabel = table?.name
    ? `${table.table_number} · ${table.name}`
    : table?.table_number ?? ''

  const settings = (restaurant.settings ?? {}) as Record<string, string>

  const socialLinks = [
    { key: 'facebook',  value: settings.facebook  ?? '', label: 'Facebook',  icon: <FacebookIcon  className="w-5 h-5" />, iconBg: '#1877f2', textColor: '#1877f2', borderColor: '#bfdbfe' },
    { key: 'instagram', value: settings.instagram ?? '', label: 'Instagram', icon: <InstagramIcon className="w-5 h-5" />, iconBg: '#e1306c', textColor: '#e1306c', borderColor: '#fbcfe8' },
    { key: 'snapchat',  value: settings.snapchat  ?? '', label: 'Snapchat',  icon: <SnapchatIcon  className="w-5 h-5" />, iconBg: '#fffc00', textColor: '#ca8a04', borderColor: '#fef08a' },
    { key: 'whatsapp',  value: settings.whatsapp  ?? '', label: 'WhatsApp',  icon: <WhatsAppIcon  className="w-5 h-5" />, iconBg: '#25d366', textColor: '#16a34a', borderColor: '#bbf7d0' },
    { key: 'tiktok',    value: settings.tiktok    ?? '', label: 'TikTok',    icon: <TikTokIcon    className="w-5 h-5" />, iconBg: '#010101', textColor: '#111827', borderColor: '#e5e7eb' },
    { key: 'twitter',   value: settings.twitter   ?? '', label: 'X',         icon: <TwitterXIcon  className="w-5 h-5" />, iconBg: '#14171a', textColor: '#111827', borderColor: '#e5e7eb' },
    { key: 'youtube',   value: settings.youtube   ?? '', label: 'YouTube',   icon: <YoutubeIcon   className="w-5 h-5" />, iconBg: '#ff0000', textColor: '#dc2626', borderColor: '#fecaca' },
    { key: 'maps',      value: settings.maps_url  ?? '', label: 'Location',  icon: <MapPin        className="w-5 h-5" />, iconBg: '#10b981', textColor: '#059669', borderColor: '#a7f3d0' },
  ].filter(s => s.value.trim() !== '')

  return (
    <div className={`min-h-screen ${tpl.pageBg} flex flex-col items-center pt-16 text-center pb-28`}>
      <style>{`.cat-scroll::-webkit-scrollbar{display:none} .social-scroll::-webkit-scrollbar{display:none}`}</style>

      {/* Circle logo */}
      <div className="w-36 h-36 rounded-full overflow-hidden shadow-xl"
        style={{ outline: `4px solid ${tpl.logoRing}`, outlineOffset: '4px', background: '#f3f4f6' }}>
        {restaurant.logo_url
          ? <img src={restaurant.logo_url} alt={restaurant.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: tpl.logoRing }}>
              <span className="text-white text-5xl font-bold">{restaurant.name.charAt(0).toUpperCase()}</span>
            </div>
        }
      </div>

      {/* Restaurant name */}
      <h1 className={`mt-4 text-2xl font-bold tracking-tight px-6 ${tpl.nameColor}`}>{restaurant.name}</h1>

      {/* Table number */}
      {tableLabel && (
        <span className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${tpl.tableChipBg} ${tpl.tableChipText}`}>
          Table {tableLabel}
        </span>
      )}

      {/* Welcome message */}
      <p className={`mt-4 text-sm px-6 ${tpl.welcomeColor}`}>
        {welcomeText ?? 'Welcome! Browse our menu and order directly from your table.'}
      </p>

      {/* Order placed success banner */}
      {orderPlaced && (
        <div className="mx-6 mt-5 w-full max-w-sm flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-left">
            <p className="text-sm font-bold text-emerald-700">Order sent!</p>
            <p className="text-xs text-emerald-600 mt-0.5">Your order is being reviewed by staff. You can add more items anytime.</p>
          </div>
          <button onClick={() => setOrderPlaced(false)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live order status tracker */}
      {trackedItems.filter(i => i.status !== 'void').length > 0 && (
        <div className="mt-4 w-full max-w-sm px-4">
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-bold text-gray-800">Your Order · Live Updates</span>
            </div>
            <div className="divide-y divide-gray-50">
              {trackedItems.filter(i => i.status !== 'void').map(item => {
                const s = trackedStatus(item.status)
                return (
                  <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${s.bg}`}>
                    <div className="shrink-0">{s.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.item_name}</p>
                      <p className={`text-xs font-medium mt-0.5 ${s.color}`}>{s.label}</p>
                    </div>
                    <span className="text-xs text-gray-400 font-medium shrink-0">×{item.qty}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Category navigation */}
      {categories.length > 0 && (
        <div className="w-full mt-6 overflow-x-hidden">
          {categoryStyle === 'circles' ? (
            /* ── Circles ── */
            <div
              className="cat-scroll flex gap-5 overflow-x-auto px-6 py-4"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowY: 'visible' } as React.CSSProperties}
            >
              {categories.map(cat => {
                const isActive = activeId === cat.id
                const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="flex flex-col items-center gap-2 shrink-0 focus:outline-none"
                  >
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center shadow-md transition-all duration-200"
                      style={{
                        background: cat.color,
                        outline: isActive ? `3px solid ${primaryColor}` : 'none',
                        outlineOffset: '3px',
                        boxShadow: isActive ? `0 6px 20px ${primaryColor}55` : '0 3px 10px rgba(0,0,0,0.12)',
                        transform: isActive ? 'scale(1.12)' : 'scale(1)',
                      }}
                    >
                      {cat.icon
                        ? <span style={{ fontSize: '3.5rem', lineHeight: 1 }}>{cat.icon}</span>
                        : <span className="text-white text-3xl font-bold">{cat.name.charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    <span
                      className="text-xs font-semibold w-16 text-center leading-tight line-clamp-1 transition-colors"
                      style={{ color: isActive ? primaryColor : (isDark ? '#9ca3af' : '#6b7280') }}
                    >
                      {cat.name}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : categoryStyle === 'square' ? (
            /* ── Square cards ── */
            <div
              className="cat-scroll flex gap-3 overflow-x-auto px-6 py-3"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
            >
              {categories.map(cat => {
                const isActive = activeId === cat.id
                const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="flex flex-col items-center gap-2 shrink-0 focus:outline-none"
                  >
                    <div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-md transition-all duration-200"
                      style={{
                        background: cat.color,
                        outline: isActive ? `3px solid ${primaryColor}` : 'none',
                        outlineOffset: '3px',
                        boxShadow: isActive ? `0 6px 20px ${primaryColor}55` : '0 3px 10px rgba(0,0,0,0.12)',
                        transform: isActive ? 'scale(1.08)' : 'scale(1)',
                      }}
                    >
                      {cat.icon
                        ? <span style={{ fontSize: '2.8rem', lineHeight: 1 }}>{cat.icon}</span>
                        : <span className="text-white text-2xl font-bold">{cat.name.charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    <span
                      className="text-xs font-semibold w-14 text-center leading-tight line-clamp-1 transition-colors"
                      style={{ color: isActive ? primaryColor : (isDark ? '#9ca3af' : '#6b7280') }}
                    >
                      {cat.name}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : categoryStyle === 'horizontal' ? (
            /* ── Horizontal list ── */
            <div className="flex flex-col gap-2 px-4">
              {categories.map(cat => {
                const isActive = activeId === cat.id
                const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.98] text-left"
                    style={{
                      background: isActive ? `${primaryColor}18` : (isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb'),
                      borderLeft: `4px solid ${isActive ? primaryColor : cat.color}`,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: cat.color }}
                    >
                      {cat.icon
                        ? <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{cat.icon}</span>
                        : <span className="text-white text-base font-bold">{cat.name.charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    <span
                      className="text-sm font-semibold flex-1"
                      style={{ color: isActive ? primaryColor : (isDark ? '#e5e7eb' : '#374151') }}
                    >
                      {cat.name}
                    </span>
                    <span className="text-xs" style={{ color: isDark ? '#6b7280' : '#9ca3af' }}>
                      {menuItems.filter(i => i.category_id === cat.id).length} items
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            /* ── Pills ── */
            <div
              className="cat-scroll flex gap-2 overflow-x-auto px-6 py-3"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
            >
              {categories.map(cat => {
                const isActive = activeId === cat.id
                const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
                    style={isActive
                      ? { background: cat.color, color: '#fff', boxShadow: `0 4px 12px ${cat.color}50` }
                      : { background: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6', color: isDark ? 'rgba(255,255,255,0.5)' : '#6b7280' }
                    }
                  >
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
      {showItems && activeId && (() => {
        const activeCat = categories.find(c => c.id === activeId)
        const items = menuItems.filter(i => i.category_id === activeId)
        return (
          <div className="w-full mt-4 px-4 pb-10 text-left">
            {/* Back button */}
            <button
              onClick={() => setShowItems(false)}
              className={`mb-4 ml-2 flex items-center gap-1.5 text-sm font-semibold transition-colors ${tpl.backBtn}`}
            >
              ← Back
            </button>
            {/* Category title */}
            {activeCat && (
              <div className="flex items-center gap-2 mb-4 px-2">
                <span className="w-3 h-3 rounded-full" style={{ background: activeCat.color }} />
                <h2 className={`text-lg font-bold ${tpl.sectionTitleColor}`}>{activeCat.name}</h2>
                <span className="text-sm text-gray-400">({items.length})</span>
              </div>
            )}
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <UtensilsCrossed className="w-10 h-10 text-gray-200" />
                <p className="text-gray-400 text-sm">No items in this category</p>
              </div>
            ) : itemStyle === 'list' ? (
              /* ── List layout ── */
              <div className="space-y-3">
                {items.map(item => {
                  const qty = getQty(item.id)
                  const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                  return (
                    <div
                      key={item.id}
                      className={`flex gap-3 rounded-2xl border shadow-sm overflow-hidden ${tpl.itemCardBg} ${tpl.itemCardBorder}`}
                      style={{ boxShadow: qty > 0 ? `0 0 0 2px ${primaryColor}` : undefined }}
                    >
                      <div className="w-20 h-20 shrink-0 bg-gray-100 overflow-hidden">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-gray-200" /></div>
                        }
                      </div>
                      <div className="flex flex-col justify-center flex-1 py-3 pr-3 gap-1.5">
                        <p className={`text-sm font-bold line-clamp-1 ${tpl.itemNameColor}`}>{item.name}</p>
                        {showDescs && item.description && (
                          <p className="text-xs line-clamp-1" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9ca3af' }}>{item.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          {showPrices && <p className={`text-sm font-extrabold ${tpl.priceColor}`}>{formatPrice(item.price)}</p>}
                          {qty === 0 ? (
                            <button
                              onClick={() => addOne(item.id)}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${tpl.addBtnBg} ${tpl.addBtnText}`}
                            >
                              <Plus className="w-3.5 h-3.5" /> Add
                            </button>
                          ) : (
                            <div className={`flex items-center rounded-xl border ${tpl.qtyBg} ${tpl.qtyBorder}`}>
                              <button onClick={() => removeOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}>
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className={`text-xs font-bold w-5 text-center tabular-nums ${tpl.qtyText}`}>{qty}</span>
                              <button onClick={() => addOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}>
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : itemStyle === 'compact' ? (
              /* ── Compact list (no image) ── */
              <div className="divide-y" style={{ borderColor: tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c') ? 'rgba(255,255,255,0.07)' : '#f3f4f6' }}>
                {items.map(item => {
                  const qty = getQty(item.id)
                  const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 py-3 px-2 transition-all"
                      style={{ background: qty > 0 ? `${primaryColor}0d` : undefined }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${tpl.itemNameColor}`}>{item.name}</p>
                        {showDescs && item.description && (
                          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af' }}>{item.description}</p>
                        )}
                        {showPrices && <p className={`text-xs font-bold mt-1 ${tpl.priceColor}`}>{formatPrice(item.price)}</p>}
                      </div>
                      {qty === 0 ? (
                        <button
                          onClick={() => addOne(item.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-all"
                          style={{ background: primaryColor }}
                        >
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      ) : (
                        <div className={`flex items-center rounded-xl border ${tpl.qtyBg} ${tpl.qtyBorder} shrink-0`}>
                          <button onClick={() => removeOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}>
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className={`text-xs font-bold w-5 text-center tabular-nums ${tpl.qtyText}`}>{qty}</span>
                          <button onClick={() => addOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}>
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* ── Grid layout ── */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {items.map(item => {
                  const qty = getQty(item.id)
                  const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border shadow-sm overflow-hidden flex flex-col relative ${tpl.itemCardBg} ${tpl.itemCardBorder}`}
                      style={{ boxShadow: qty > 0 ? `0 0 0 2px ${primaryColor}` : undefined }}
                    >
                      {/* Image */}
                      <div className="relative w-full aspect-square bg-gray-50">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
                          : <div className="absolute inset-0 flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-gray-200" /></div>
                        }
                        {qty > 0 && (
                          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow" style={{ background: primaryColor }}>
                            <span className="text-white text-[10px] font-bold">{qty}</span>
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="p-2 flex-1 flex flex-col gap-1">
                        <p className={`text-xs font-bold line-clamp-2 leading-snug ${tpl.itemNameColor}`}>{item.name}</p>
                        {showDescs && item.description && (
                          <p className="text-[10px] line-clamp-2 leading-snug" style={{ color: isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af' }}>{item.description}</p>
                        )}
                        {showPrices && <p className={`text-xs font-extrabold mt-auto ${tpl.priceColor}`}>{formatPrice(item.price)}</p>}
                      </div>
                      {/* Add / qty controls */}
                      <div className="px-2 pb-2">
                        {qty === 0 ? (
                          <button
                            onClick={() => addOne(item.id)}
                            className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${tpl.addBtnBg} ${tpl.addBtnText}`}
                          >
                            <Plus className="w-3.5 h-3.5" /> Add
                          </button>
                        ) : (
                          <div className={`flex items-center justify-between rounded-xl border ${tpl.qtyBg} ${tpl.qtyBorder}`}>
                            <button onClick={() => removeOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 transition-all ${tpl.qtyText}`}>
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className={`text-xs font-bold tabular-nums flex-1 text-center ${tpl.qtyText}`}>{qty}</span>
                            <button onClick={() => addOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 transition-all ${tpl.qtyText}`}>
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Events & Offers + Social (hidden when browsing items) ── */}
      {!showItems && (
        <>
          {events.length > 0 && (
            <div className="w-full mt-6 text-left">
              <h2 className={`text-lg font-bold mb-3 px-6 ${tpl.sectionTitleColor}`}>Event &amp; Offers</h2>

              {eventStyle === 'story' ? (
                /* ── Story circles ── */
                <div
                  className="cat-scroll flex gap-4 overflow-x-auto px-6 pb-4 pt-2"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                >
                  {events.map(ev => (
                    <div key={ev.id} className="shrink-0 flex flex-col items-center gap-2">
                      <div
                        className="rounded-full p-[3px] shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${primaryColor}, #f97316)` }}
                      >
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200">
                          {ev.image_url
                            ? <img src={ev.image_url} alt={ev.title} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}cc, #f97316cc)` }}>
                                <span className="text-white text-2xl font-bold">{ev.title.charAt(0)}</span>
                              </div>
                          }
                        </div>
                      </div>
                      <p className={`text-[10px] font-semibold w-14 text-center line-clamp-2 leading-tight ${tpl.sectionTitleColor}`}>{ev.title}</p>
                    </div>
                  ))}
                </div>
              ) : eventStyle === 'banner' ? (
                /* ── Stacked banners ── */
                <div className="flex flex-col gap-3 px-4">
                  {events.map(ev => (
                    <div
                      key={ev.id}
                      className="relative rounded-2xl overflow-hidden h-32 shadow-md"
                      style={{ border: `2px solid ${primaryColor}44` }}
                    >
                      {ev.image_url
                        ? <img src={ev.image_url} alt={ev.title} className="absolute inset-0 w-full h-full object-cover" />
                        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primaryColor}cc, #f97316cc)` }} />
                      }
                      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                      <div className="absolute inset-0 flex flex-col justify-center px-5">
                        <p className="text-white text-sm font-bold leading-snug line-clamp-2">{ev.title}</p>
                        {ev.date_label && <p className="text-white/70 text-xs mt-1">{ev.date_label}</p>}
                        {ev.description && <p className="text-white/60 text-xs mt-1 line-clamp-1">{ev.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* ── Cards (default horizontal scroll) ── */
                <div
                  className="cat-scroll flex gap-5 overflow-x-auto px-6 pb-4 pt-2"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                >
                  {events.map(ev => (
                    <div
                      key={ev.id}
                      className="shrink-0 rounded-2xl p-[3px] shadow-lg"
                      style={{ background: primaryColor, boxShadow: `0 4px 18px ${primaryColor}55` }}
                    >
                      <div className="relative rounded-[14px] overflow-hidden w-40 h-56">
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {socialLinks.length > 0 && (
            <div className="w-full mt-6 pb-10 text-left">
              {socialStyle === 'grid' ? (
                /* ── 2-col grid ── */
                <div className="grid grid-cols-2 gap-2 px-4">
                  {socialLinks.map(s => {
                    const href = buildSocialHref(s.key, s.value)
                    const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                    return (
                      <a
                        key={s.key}
                        href={href === '#' ? undefined : href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl border active:scale-95 transition-all"
                        style={{ borderColor: s.borderColor, background: isDark ? 'rgba(255,255,255,0.05)' : '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: s.iconBg }}>
                          <span style={{ color: s.key === 'snapchat' ? '#111' : '#fff' }}>{s.icon}</span>
                        </div>
                        <span className="text-sm font-semibold whitespace-nowrap" style={{ color: s.textColor }}>{s.label}</span>
                      </a>
                    )
                  })}
                </div>
              ) : socialStyle === 'icons' ? (
                /* ── Icon circles only ── */
                <div
                  className="social-scroll flex gap-4 overflow-x-auto px-6 py-2"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                >
                  {socialLinks.map(s => {
                    const href = buildSocialHref(s.key, s.value)
                    return (
                      <a
                        key={s.key}
                        href={href === '#' ? undefined : href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex flex-col items-center gap-1.5 active:scale-90 transition-all"
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md" style={{ backgroundColor: s.iconBg }}>
                          <span style={{ color: s.key === 'snapchat' ? '#111' : '#fff' }}>{s.icon}</span>
                        </div>
                        <span className="text-[10px] font-semibold" style={{ color: tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c') ? '#9ca3af' : '#6b7280' }}>{s.label}</span>
                      </a>
                    )
                  })}
                </div>
              ) : (
                /* ── Pills (default horizontal scroll) ── */
                <div
                  className="social-scroll flex gap-3 overflow-x-auto px-6 py-2"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                >
                  {socialLinks.map(s => {
                    const href = buildSocialHref(s.key, s.value)
                    const isDark = tpl.pageBg.includes('0a0a') || tpl.pageBg.includes('080c')
                    return (
                      <a
                        key={s.key}
                        href={href === '#' ? undefined : href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-full border active:scale-95 transition-all"
                        style={{ borderColor: s.borderColor, background: isDark ? 'rgba(255,255,255,0.06)' : '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: s.iconBg }}>
                          <span style={{ color: s.key === 'snapchat' ? '#111' : '#fff' }}>{s.icon}</span>
                        </div>
                        <span className="text-base font-semibold whitespace-nowrap" style={{ color: s.textColor }}>{s.label}</span>
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Floating cart button ── */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4">
          <button
            onClick={() => setShowCart(true)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-amber-500 shadow-xl shadow-amber-500/40 active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <p className="text-white text-xs font-semibold opacity-80">{cartCount} item{cartCount !== 1 ? 's' : ''}</p>
                <p className="text-white text-sm font-extrabold">{formatPrice(cartTotal)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-white font-bold text-sm">
              View Order <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* ── Cart sheet ── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setShowCart(false)}>
          <div
            className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Your Order</h2>
                <p className="text-xs text-gray-400 mt-0.5">{cartCount} item{cartCount !== 1 ? 's' : ''} · Table {tableLabel}</p>
              </div>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cartItems.map(({ item, entry }) => {
                const modPrice = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
                const lineTotal = (item.price + modPrice) * entry.qty
                const noteTexts = entry.noteIds.map(id => kitchenNotes.find(n => n.id === id)?.text).filter(Boolean) as string[]
                const allNotes = [...entry.selectedOptions.map(o => o.option_name), ...noteTexts, ...(entry.customNote.trim() ? [entry.customNote.trim()] : [])]
                return (
                  <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-3 pt-3 pb-2">
                      {/* Image */}
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-4 h-4 text-gray-300" /></div>
                        }
                      </div>
                      {/* Name + price */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 line-clamp-1">{item.name}</p>
                        <p className="text-xs text-amber-500 font-bold mt-0.5">{formatPrice(lineTotal)}</p>
                      </div>
                      {/* Qty controls */}
                      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white shrink-0">
                        <button onClick={() => removeOne(item.id)} className="w-8 h-8 flex items-center justify-center text-gray-500 active:scale-90 transition-all">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-bold text-gray-800 w-5 text-center tabular-nums">{entry.qty}</span>
                        <button onClick={() => addOne(item.id)} className="w-8 h-8 flex items-center justify-center text-gray-500 active:scale-90 transition-all">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Customizations strip + pencil */}
                    <div className="flex items-center gap-2 px-3 pb-3">
                      <button
                        onClick={() => setItemModalId(item.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 text-xs font-semibold active:scale-95 transition-all shrink-0"
                      >
                        <ChevronRight className="w-3 h-3" />
                        {allNotes.length > 0 ? 'Edit' : 'Add notes & modifiers'}
                      </button>
                      {allNotes.length > 0 && (
                        <p className="text-[11px] text-gray-500 line-clamp-1 flex-1 min-w-0">{allNotes.join(' · ')}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total + place order */}
            <div className="px-5 pt-3 pb-6 border-t border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 font-medium">Total</span>
                <span className="text-base font-extrabold text-gray-900">{formatPrice(cartTotal)}</span>
              </div>
              {placeError && (
                <p className="text-xs text-rose-500 text-center">{placeError}</p>
              )}
              <button
                onClick={placeOrder}
                disabled={placing}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-amber-500 text-white text-sm font-bold shadow-lg shadow-amber-500/30 active:scale-95 transition-all disabled:opacity-60"
              >
                {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                {placing ? 'Placing order…' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item customize modal ── */}
      {itemModalId && (() => {
        const item = menuItems.find(m => m.id === itemModalId)
        if (!item) return null
        const existing = cart.get(itemModalId) ?? { qty: 1, selectedOptions: [], noteIds: [], customNote: '' }
        return (
          <GuestItemModal
            item={item}
            initial={existing}
            kitchenNotes={kitchenNotes}
            supabase={supabase}
            formatPrice={formatPrice}
            onConfirm={entry => confirmItem(itemModalId, entry)}
            onClose={() => setItemModalId(null)}
          />
        )
      })()}
    </div>
  )
}

// ── Guest Item Modal ──────────────────────────────────────────
function GuestItemModal({ item, initial, kitchenNotes, supabase, formatPrice, onConfirm, onClose }: {
  item: MenuItem
  initial: CartEntry
  kitchenNotes: KitchenNote[]
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>
  formatPrice: (n: number) => string
  onConfirm: (entry: CartEntry) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<CartEntry>({ ...initial, selectedOptions: [...initial.selectedOptions], noteIds: [...initial.noteIds] })
  const [modGroups, setModGroups] = useState<ModGroup[]>([])
  const [loadingMods, setLoadingMods] = useState(true)

  useEffect(() => {
    supabase
      .from('menu_item_modifiers')
      .select('menu_modifiers(id,name,required,min_select,max_select,modifier_options(id,name,price,sort_order))')
      .eq('item_id', item.id)
      .then(({ data }) => {
        if (data) {
          setModGroups((data as any[])
            .map(r => r.menu_modifiers).filter(Boolean)
            .map((m: any) => ({
              id: m.id, name: m.name, required: m.required,
              min_select: m.min_select, max_select: m.max_select,
              options: [...(m.modifier_options ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order),
            })))
        }
        setLoadingMods(false)
      })
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleNote = (id: string) =>
    setLocal(e => ({
      ...e,
      noteIds: e.noteIds.includes(id) ? e.noteIds.filter(n => n !== id) : [...e.noteIds, id],
    }))

  const toggleOption = (group: ModGroup, opt: { id: string; name: string; price: number }) =>
    setLocal(e => {
      const already = e.selectedOptions.find(o => o.option_id === opt.id)
      if (already) return { ...e, selectedOptions: e.selectedOptions.filter(o => o.option_id !== opt.id) }
      const filtered = group.max_select === 1
        ? e.selectedOptions.filter(o => o.modifier_id !== group.id)
        : [...e.selectedOptions]
      return { ...e, selectedOptions: [...filtered, { modifier_id: group.id, modifier_name: group.name, option_id: opt.id, option_name: opt.name, price: opt.price }] }
    })

  const modPrice = local.selectedOptions.reduce((s, o) => s + o.price, 0)
  const lineTotal = (item.price + modPrice) * local.qty
  const isEditing = initial.qty > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Card */}
      <div
        className="relative bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Hero image ── */}
        {item.image_url ? (
          <div className="shrink-0 relative h-40 overflow-hidden">
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white active:scale-95">
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-3 left-4 right-14">
              <p className="text-base font-extrabold text-white leading-tight">{item.name}</p>
              <p className="text-sm font-bold text-amber-400 mt-0.5">{formatPrice(item.price + modPrice)}</p>
            </div>
          </div>
        ) : (
          <div className="shrink-0 flex items-center justify-between px-4 py-4 border-b border-gray-100">
            <div>
              <p className="text-base font-extrabold text-gray-900">{item.name}</p>
              <p className="text-sm font-bold text-amber-500 mt-0.5">{formatPrice(item.price + modPrice)}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Qty row ── */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-600">Quantity</span>
          <div className="flex items-center rounded-xl border-2 border-amber-400 overflow-hidden">
            <button onClick={() => setLocal(e => ({ ...e, qty: Math.max(1, e.qty - 1) }))} className="w-9 h-9 flex items-center justify-center text-amber-600 bg-amber-50 active:bg-amber-100 transition-all">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-9 text-center text-sm font-extrabold text-gray-900 tabular-nums">{local.qty}</span>
            <button onClick={() => setLocal(e => ({ ...e, qty: e.qty + 1 }))} className="w-9 h-9 flex items-center justify-center text-white bg-amber-500 active:bg-amber-600 transition-all">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

          {/* Modifiers */}
          {loadingMods ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
          ) : modGroups.map(group => (
            <div key={group.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-900">{group.name}</span>
                  {group.required && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-500 font-bold">Required</span>}
                </div>
                <span className="text-xs text-gray-400">{group.max_select === 1 ? 'Choose 1' : `Up to ${group.max_select}`}</span>
              </div>
              <div className="space-y-1.5">
                {group.options.map(opt => {
                  const selected = local.selectedOptions.some(o => o.option_id === opt.id)
                  return (
                    <button key={opt.id} onClick={() => toggleOption(group, opt)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all active:scale-[0.98] ${selected ? 'border-amber-400 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'border-amber-500 bg-amber-500' : 'border-gray-300'}`}>
                        {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className={`flex-1 text-sm font-medium text-left ${selected ? 'text-amber-800' : 'text-gray-700'}`}>{opt.name}</span>
                      {opt.price > 0 && <span className={`text-xs font-bold tabular-nums ${selected ? 'text-amber-600' : 'text-gray-400'}`}>+{formatPrice(opt.price)}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Kitchen Notes */}
          {kitchenNotes.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-sm font-bold text-gray-900 mb-2">Kitchen Notes</p>
              <div className="flex flex-wrap gap-2">
                {kitchenNotes.map(note => {
                  const active = local.noteIds.includes(note.id)
                  return (
                    <button key={note.id} onClick={() => toggleNote(note.id)}
                      className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-all active:scale-95 ${active ? 'border-orange-400 bg-orange-500 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {note.text}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Special Request */}
          <div className="px-4 py-3">
            <p className="text-sm font-bold text-gray-900 mb-2">Special Request <span className="text-xs text-gray-400 font-normal ml-1">Optional</span></p>
            <input
              value={local.customNote}
              onChange={e => setLocal(en => ({ ...en, customNote: e.target.value }))}
              placeholder="e.g. No onions, extra sauce…"
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-amber-300 bg-gray-50"
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-4 pb-4 pt-3 border-t border-gray-100">
          <button
            onClick={() => onConfirm(local)}
            className="w-full py-3.5 rounded-2xl bg-amber-500 text-white text-sm font-extrabold shadow-lg shadow-amber-400/30 active:scale-[0.98] transition-all flex items-center justify-between px-4"
          >
            <span>{isEditing ? 'Update' : 'Add to Order'}</span>
            <span className="bg-white/25 px-3 py-1 rounded-xl text-sm font-bold">{formatPrice(lineTotal)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
