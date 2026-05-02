'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import NextImage from 'next/image'
import {
  Loader2, UtensilsCrossed, MapPin, ShoppingCart, Plus, Minus, X,
  CheckCircle2, ChevronRight, User, Phone, AlertCircle,
  Truck, Clock, Package, Crosshair, Search, ChevronDown, ChevronUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { assignOrderNumber } from '@/lib/orderNumber'
import { useRestaurantMenu } from '@/hooks/useRestaurantMenu'

const LocationPickerMap = dynamic(
  () => import('@/components/delivery/LocationPickerMap'),
  { ssr: false, loading: () => (
    <div className="w-full flex items-center justify-center bg-white/5" style={{ height: 200 }}>
      <Loader2 className="w-5 h-5 animate-spin text-white/30" />
    </div>
  )},
)

// ── Types ──────────────────────────────────────────────────────
interface Restaurant { id: string; name: string; logo_url: string | null; settings: Record<string, string> }
interface Category   { id: string; name: string; color: string; icon: string | null; sort_order: number }
interface EventOffer { id: string; title: string; description: string | null; date_label: string | null; image_url: string | null }
interface MenuItem   { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null }
interface KitchenNote { id: string; text: string }
interface GuestSelectedOption { modifier_id: string; modifier_name: string; option_id: string; option_name: string; price: number }
interface CartEntry  { qty: number; selectedOptions: GuestSelectedOption[]; noteIds: string[]; customNote: string }
interface ModGroup { id: string; name: string; required: boolean; min_select: number; max_select: number; options: { id: string; name: string; price: number }[] }

type TemplateId = 'classic' | 'dark' | 'warm' | 'bold' | 'elegant' | 'neon'

// ── Template configs ──────────────────────────────────────────
interface TplCfg {
  pageBg: string; nameColor: string; welcomeColor: string
  catLayout: 'circles' | 'pills' | 'square' | 'horizontal'
  sectionTitle: string
  itemCardBg: string; itemCardBorder: string
  itemNameColor: string; priceColor: string
  addBtnBg: string; addBtnText: string
  qtyBg: string; qtyBorder: string; qtyText: string
  backBtn: string
  isDark: boolean
}

const TEMPLATE_CONFIGS: Record<TemplateId, TplCfg> = {
  classic: {
    pageBg: 'bg-white', nameColor: 'text-gray-900', welcomeColor: 'text-gray-400',
    catLayout: 'circles', sectionTitle: 'text-gray-900',
    itemCardBg: 'bg-white', itemCardBorder: 'border-gray-100',
    itemNameColor: 'text-gray-800', priceColor: 'text-amber-500',
    addBtnBg: 'bg-amber-500 active:bg-amber-600', addBtnText: 'text-white',
    qtyBg: 'bg-amber-50', qtyBorder: 'border-amber-200', qtyText: 'text-amber-700',
    backBtn: 'text-gray-500 hover:text-gray-800', isDark: false,
  },
  dark: {
    pageBg: 'bg-[#080c14]', nameColor: 'text-white', welcomeColor: 'text-white/40',
    catLayout: 'circles', sectionTitle: 'text-white',
    itemCardBg: 'bg-white/5', itemCardBorder: 'border-white/10',
    itemNameColor: 'text-white/90', priceColor: 'text-amber-400',
    addBtnBg: 'bg-amber-500 active:bg-amber-600', addBtnText: 'text-white',
    qtyBg: 'bg-amber-500/10', qtyBorder: 'border-amber-500/20', qtyText: 'text-amber-400',
    backBtn: 'text-white/50 hover:text-white', isDark: true,
  },
  warm: {
    pageBg: 'bg-[#fdf6ec]', nameColor: 'text-[#451a03]', welcomeColor: 'text-amber-700/60',
    catLayout: 'circles', sectionTitle: 'text-[#451a03]',
    itemCardBg: 'bg-white', itemCardBorder: 'border-amber-100',
    itemNameColor: 'text-[#451a03]', priceColor: 'text-amber-600',
    addBtnBg: 'bg-amber-700 active:bg-amber-800', addBtnText: 'text-white',
    qtyBg: 'bg-amber-50', qtyBorder: 'border-amber-200', qtyText: 'text-amber-800',
    backBtn: 'text-amber-700/60 hover:text-amber-900', isDark: false,
  },
  bold: {
    pageBg: 'bg-white', nameColor: 'text-gray-900', welcomeColor: 'text-gray-500',
    catLayout: 'pills', sectionTitle: 'text-gray-900',
    itemCardBg: 'bg-white', itemCardBorder: 'border-gray-100',
    itemNameColor: 'text-gray-900', priceColor: 'text-violet-600',
    addBtnBg: 'bg-violet-600 active:bg-violet-700', addBtnText: 'text-white',
    qtyBg: 'bg-violet-50', qtyBorder: 'border-violet-200', qtyText: 'text-violet-700',
    backBtn: 'text-gray-500 hover:text-gray-800', isDark: false,
  },
  elegant: {
    pageBg: 'bg-[#f7f4f0]', nameColor: 'text-[#1c1917]', welcomeColor: 'text-stone-400',
    catLayout: 'horizontal', sectionTitle: 'text-[#1c1917]',
    itemCardBg: 'bg-white', itemCardBorder: 'border-stone-200',
    itemNameColor: 'text-stone-900', priceColor: 'text-stone-600',
    addBtnBg: 'bg-stone-800 active:bg-stone-900', addBtnText: 'text-white',
    qtyBg: 'bg-stone-100', qtyBorder: 'border-stone-300', qtyText: 'text-stone-700',
    backBtn: 'text-stone-500 hover:text-stone-800', isDark: false,
  },
  neon: {
    pageBg: 'bg-[#0a0a0f]', nameColor: 'text-white', welcomeColor: 'text-white/40',
    catLayout: 'square', sectionTitle: 'text-white',
    itemCardBg: 'bg-white/5', itemCardBorder: 'border-white/8',
    itemNameColor: 'text-white/90', priceColor: 'text-[#39ff14]',
    addBtnBg: 'bg-[#39ff14] active:opacity-80', addBtnText: 'text-black',
    qtyBg: 'bg-[#39ff14]/10', qtyBorder: 'border-[#39ff14]/30', qtyText: 'text-[#39ff14]',
    backBtn: 'text-white/40 hover:text-white', isDark: true,
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

function buildSocialHref(key: string, value: string) {
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

// ── Delivery Info Modal ────────────────────────────────────────
function DeliveryModal({
  primaryColor, cartCount, cartTotal, formatPrice,
  onClose, onConfirm, placing, placeError,
  deliveryFee, estimatedTime, minOrder,
}: {
  primaryColor: string
  cartCount: number
  cartTotal: number
  formatPrice: (n: number) => string
  onClose: () => void
  onConfirm: (name: string, phone: string, lat: number | null, lng: number | null, address: string | null) => void
  placing: boolean
  placeError: string | null
  deliveryFee: number
  estimatedTime: number
  minOrder: number
}) {
  const [name, setName]           = useState('')
  const [phone, setPhone]         = useState('')
  const [lat, setLat]             = useState<number | null>(null)
  const [lng, setLng]             = useState<number | null>(null)
  const [flyToLat, setFlyToLat]   = useState<number | null>(null)
  const [flyToLng, setFlyToLng]   = useState<number | null>(null)
  const [address, setAddress]     = useState<string | null>(null)
  const [accuracy, setAccuracy]   = useState<number | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError]   = useState('')
  const [errors, setErrors]       = useState<{ name?: string; phone?: string; loc?: string }>({})
  const watchRef  = useRef<number | null>(null)
  const geocodeTO = useRef<ReturnType<typeof setTimeout> | null>(null)

  const phoneValid = /^[\d\s\-\+\(\)]{7,15}$/.test(phone.trim())

  // Cleanup watchPosition and geocode timeout on unmount
  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
      if (geocodeTO.current) clearTimeout(geocodeTO.current)
    }
  }, [])

  // Reverse geocode whenever lat/lng changes (debounced 600ms)
  const reverseGeocode = useCallback(async (la: number, lo: number) => {
    if (geocodeTO.current) clearTimeout(geocodeTO.current)
    geocodeTO.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${la}&lon=${lo}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const data = await res.json()
        setAddress(data.display_name ?? null)
      } catch { /* ignore */ }
    }, 600)
  }, [])

  // Called when user drags pin or clicks map
  const handleMapMove = useCallback((la: number, lo: number) => {
    setLat(la)
    setLng(lo)
    setErrors(er => ({ ...er, loc: undefined }))
    reverseGeocode(la, lo)
  }, [reverseGeocode])

  // Fire GPS → fly map to accurate position
  const handleGPS = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation not supported'); return }
    setGpsLoading(true)
    setGpsError('')
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords
        setAccuracy(Math.round(acc))
        // Update fly-to → map will animate to new coords
        setFlyToLat(latitude)
        setFlyToLng(longitude)
        // handleMapMove will be called via onMove after the map moves,
        // but also update state here directly so validation passes
        setLat(latitude)
        setLng(longitude)
        setErrors(er => ({ ...er, loc: undefined }))
        reverseGeocode(latitude, longitude)
        setGpsLoading(false)
        // Stop watching once accurate enough
        if (acc < 50 && watchRef.current !== null) {
          navigator.geolocation.clearWatch(watchRef.current)
          watchRef.current = null
        }
      },
      err => {
        if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
        setGpsLoading(false)
        setGpsError(
          err.code === 1 ? 'Location permission denied. Allow location access and try again.'
          : err.code === 2 ? 'Location unavailable. Check your GPS and try again.'
          : 'Could not get location. Please try again.'
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const validate = () => {
    const e: { name?: string; phone?: string; loc?: string } = {}
    if (!name.trim()) e.name = 'Full name is required'
    if (!phone.trim()) e.phone = 'Phone number is required'
    else if (!phoneValid) e.phone = 'Enter a valid phone number'
    if (!lat || !lng) e.loc = 'Please set your delivery location on the map'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = () => {
    if (!validate()) return
    onConfirm(name.trim(), phone.trim(), lat, lng, address)
  }

  const grandTotal = cartTotal + deliveryFee

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="relative w-full max-w-md mx-4 mb-0 sm:mb-4 rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)',
          backdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        {/* Gradient orb decoration */}
        <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${primaryColor}30 0%, transparent 70%)` }} />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />

        {/* Header */}
        <div className="relative flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: `${primaryColor}25`, border: `1px solid ${primaryColor}40` }}>
              <Truck className="w-5 h-5" style={{ color: primaryColor }} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Delivery Details</h2>
              <p className="text-[11px] text-white/50">{cartCount} item{cartCount !== 1 ? 's' : ''} · {formatPrice(cartTotal)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Order summary strip */}
        <div className="mx-6 mb-4 rounded-2xl px-4 py-3 flex items-center gap-4"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-1.5 flex-1">
            <Clock className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <span className="text-[11px] text-white/50">Est. {estimatedTime} min</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-1.5 flex-1">
            <Package className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <span className="text-[11px] text-white/50">Fee: {formatPrice(deliveryFee)}</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="text-right">
            <span className="text-xs font-bold" style={{ color: primaryColor }}>{formatPrice(grandTotal)}</span>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-2 space-y-4">

          {/* Full Name */}
          <div>
            <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">Full Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(er => ({ ...er, name: undefined })) }}
                placeholder="Your full name"
                className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm text-white placeholder:text-white/25 outline-none transition-all"
                style={{
                  background: errors.name ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${errors.name ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)'}`,
                }}
                onFocus={e => { if (!errors.name) e.target.style.borderColor = `${primaryColor}60` }}
                onBlur={e => { if (!errors.name) e.target.style.borderColor = 'rgba(255,255,255,0.12)' }}
              />
            </div>
            {errors.name && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setErrors(er => ({ ...er, phone: undefined })) }}
                placeholder="+964 7XX XXX XXXX"
                className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm text-white placeholder:text-white/25 outline-none transition-all"
                style={{
                  background: errors.phone ? 'rgba(239,68,68,0.08)' : phone && !phoneValid ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${errors.phone ? 'rgba(239,68,68,0.4)' : phone && !phoneValid ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.12)'}`,
                }}
                onFocus={e => { if (!errors.phone) e.target.style.borderColor = `${primaryColor}60` }}
                onBlur={e => { if (!errors.phone) e.target.style.borderColor = phone && !phoneValid ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.12)' }}
              />
              {phone && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {phoneValid
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    : <AlertCircle className="w-4 h-4 text-amber-400" />}
                </div>
              )}
            </div>
            {errors.phone && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.phone}</p>}
          </div>

          {/* Location */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Delivery Location</label>
              {lat && lng && (
                <div className="flex items-center gap-1.5">
                  {accuracy !== null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: accuracy < 30 ? 'rgba(16,185,129,0.20)' : accuracy < 100 ? 'rgba(245,158,11,0.20)' : 'rgba(239,68,68,0.15)',
                        color: accuracy < 30 ? '#34d399' : accuracy < 100 ? '#fbbf24' : '#f87171',
                      }}>
                      ±{accuracy}m
                    </span>
                  )}
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              )}
            </div>

            {/* Interactive map */}
            <div className="relative rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${errors.loc ? 'rgba(239,68,68,0.4)' : lat && lng ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.12)'}` }}>

              <LocationPickerMap
                flyToLat={flyToLat}
                flyToLng={flyToLng}
                onMove={handleMapMove}
              />

              {/* Live location button — overlay top-right */}
              <button
                onClick={handleGPS}
                disabled={gpsLoading}
                className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-70"
                style={{
                  background: 'rgba(10,10,20,0.85)',
                  border: `1px solid ${primaryColor}50`,
                  color: primaryColor,
                  backdropFilter: 'blur(8px)',
                  boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px ${primaryColor}20`,
                }}
              >
                {gpsLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Crosshair className="w-3.5 h-3.5" />}
                {gpsLoading ? 'Locating…' : 'Live Location'}
              </button>

              {/* Hint overlay when no pin yet */}
              {!lat && !lng && (
                <div className="absolute inset-0 z-[999] flex flex-col items-center justify-center pointer-events-none"
                  style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(1px)' }}>
                  <MapPin className="w-6 h-6 text-white/60 mb-1" />
                  <p className="text-[11px] text-white/70 font-medium">Tap map to pin your location</p>
                  <p className="text-[10px] text-white/40 mt-0.5">or use Live Location button</p>
                </div>
              )}

              {/* Accuracy improving banner */}
              {accuracy !== null && accuracy >= 50 && lat && lng && (
                <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center gap-2 px-3 py-1.5"
                  style={{ background: 'rgba(245,158,11,0.85)', backdropFilter: 'blur(4px)' }}>
                  <Loader2 className="w-3 h-3 text-amber-900 animate-spin shrink-0" />
                  <p className="text-[10px] text-amber-900 font-medium">Improving accuracy — stay still…</p>
                </div>
              )}
            </div>

            {/* Address row */}
            {address && lat && lng && (
              <div className="mt-1.5 flex items-start gap-1.5 px-1">
                <MapPin className="w-3 h-3 text-emerald-400/70 shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2">{address}</p>
              </div>
            )}

            {gpsError && (
              <p className="text-[11px] text-rose-400 mt-1.5 flex items-start gap-1">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{gpsError}
              </p>
            )}
            {errors.loc && (
              <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.loc}
              </p>
            )}
          </div>

          {/* Min order warning */}
          {minOrder > 0 && cartTotal < minOrder && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)' }}>
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-[11px] text-amber-400">Minimum order is {formatPrice(minOrder)}</p>
            </div>
          )}

          {placeError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <p className="text-[11px] text-rose-400">{placeError}</p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="px-6 py-5">
          <button
            onClick={submit}
            disabled={placing || (minOrder > 0 && cartTotal < minOrder)}
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
              boxShadow: `0 8px 32px ${primaryColor}40`,
              color: primaryColor === '#39ff14' ? '#000' : '#fff',
            }}
          >
            {placing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing Order…</>
              : <><Truck className="w-4 h-4" /> Place Delivery Order · {formatPrice(grandTotal)}</>}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%) }
          100% { transform: translateX(100%) }
        }
      `}</style>
    </div>
  )
}

// ── Track Order Section ────────────────────────────────────────
interface TrackOrder {
  id: string
  order_number: number | null
  customer_name: string
  address_text: string | null
  delivery_fee: number
  status: string
  created_at: string
  order_status: string
  total: number
  items: { item_name: string; qty: number; item_price: number }[]
}

const DELIVERY_STEPS = [
  { key: 'pending',           label: 'Order Received',   icon: Package },
  { key: 'preparing',         label: 'Preparing',        icon: Clock },
  { key: 'out_for_delivery',  label: 'On the Way',       icon: Truck },
  { key: 'delivered',         label: 'Delivered',        icon: CheckCircle2 },
]

function stepIndex(status: string) {
  const i = DELIVERY_STEPS.findIndex(s => s.key === status)
  return i === -1 ? 0 : i
}

function TrackOrderSection({
  restaurantId, primaryColor, isDark, formatPrice,
}: {
  restaurantId: string
  primaryColor: string
  isDark: boolean
  formatPrice: (n: number) => string
}) {
  const supabase = createClient()
  const [open, setOpen]         = useState(false)
  const [phone, setPhone]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [orders, setOrders]     = useState<TrackOrder[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const dimText  = isDark ? 'rgba(255,255,255,0.45)' : '#9ca3af'
  const bodyText = isDark ? 'rgba(255,255,255,0.85)' : '#111827'
  const cardBg   = isDark ? 'rgba(255,255,255,0.05)' : '#fff'
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : '#e5e7eb'
  const inputBg  = isDark ? 'rgba(255,255,255,0.07)' : '#f9fafb'

  const search = async () => {
    const raw = phone.trim()
    if (!raw) { setError('Enter your phone number'); return }
    setLoading(true); setError(null); setOrders(null)

    const { data: delivRows, error: dErr } = await supabase
      .from('delivery_orders')
      .select('id, order_id, customer_name, address_text, delivery_fee, status, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', raw)
      .order('created_at', { ascending: false })
      .limit(10)

    if (dErr) { setError('Could not fetch orders. Try again.'); setLoading(false); return }
    if (!delivRows || delivRows.length === 0) {
      setError('No orders found for this phone number.'); setLoading(false); return
    }

    const orderIds = delivRows.map(r => r.order_id)

    const [ordersRes, itemsRes] = await Promise.all([
      supabase.from('orders').select('id, status, total, order_number, created_at').in('id', orderIds),
      supabase.from('order_items').select('order_id, item_name, qty, item_price').in('order_id', orderIds),
    ])

    const ordersMap = new Map((ordersRes.data ?? []).map(o => [o.id, o]))
    const itemsMap  = new Map<string, { item_name: string; qty: number; item_price: number }[]>()
    for (const item of (itemsRes.data ?? [])) {
      const arr = itemsMap.get(item.order_id) ?? []
      arr.push(item)
      itemsMap.set(item.order_id, arr)
    }

    const result: TrackOrder[] = delivRows.map(d => {
      const o = ordersMap.get(d.order_id)
      return {
        id:            d.id,
        order_number:  o?.order_number ?? null,
        customer_name: d.customer_name,
        address_text:  d.address_text,
        delivery_fee:  d.delivery_fee,
        status:        d.status,
        created_at:    d.created_at,
        order_status:  o?.status ?? 'active',
        total:         o?.total ?? 0,
        items:         itemsMap.get(d.order_id) ?? [],
      }
    })

    setOrders(result)
    if (result.length > 0) setExpanded(result[0].id)
    setLoading(false)
  }

  const statusLabel = (s: string) => {
    const found = DELIVERY_STEPS.find(x => x.key === s)
    return found?.label ?? s.replace(/_/g, ' ')
  }

  return (
    <div className="w-full max-w-sm mt-5 mx-auto px-4">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
        style={{
          background: open ? `${primaryColor}15` : (isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6'),
          border: `1.5px solid ${open ? primaryColor + '40' : (isDark ? 'rgba(255,255,255,0.10)' : '#e5e7eb')}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: `${primaryColor}20` }}>
            <Search className="w-4 h-4" style={{ color: primaryColor }} />
          </div>
          <span className="text-sm font-bold" style={{ color: bodyText }}>Track Your Order</span>
        </div>
        {open
          ? <ChevronUp  className="w-4 h-4" style={{ color: dimText }} />
          : <ChevronDown className="w-4 h-4" style={{ color: dimText }} />}
      </button>

      {open && (
        <div className="mt-2 rounded-2xl px-4 py-4 space-y-3"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>

          {/* Phone input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: dimText }} />
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(null) }}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="+964 7XX XXX XXXX"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: inputBg,
                  border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : (isDark ? 'rgba(255,255,255,0.12)' : '#e5e7eb')}`,
                  color: bodyText,
                }}
              />
            </div>
            <button
              onClick={search}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-60 flex items-center gap-1.5"
              style={{ background: primaryColor, color: primaryColor === '#39ff14' ? '#000' : '#fff' }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
            </p>
          )}

          {/* Results */}
          {orders && orders.map(order => {
            const isCancelled = order.status === 'cancelled'
            const step        = stepIndex(order.status)
            const isExpanded  = expanded === order.id
            return (
              <div key={order.id} className="rounded-2xl overflow-hidden"
                style={{ border: `1.5px solid ${isCancelled ? 'rgba(239,68,68,0.45)' : cardBorder}` }}>

                {/* Order header row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : order.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  style={{ background: isCancelled ? 'rgba(239,68,68,0.07)' : (isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb') }}
                >
                  <div>
                    <p className="text-sm font-bold" style={{ color: bodyText }}>
                      {order.order_number ? `Order #${order.order_number}` : 'Order'}
                      <span className="ml-2 text-xs font-normal" style={{ color: dimText }}>
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                    </p>
                    {isCancelled ? (
                      <p className="text-xs mt-0.5 font-bold flex items-center gap-1" style={{ color: '#f87171' }}>
                        ⚠️ Order Cancelled
                      </p>
                    ) : (
                      <p className="text-xs mt-0.5 font-semibold" style={{ color: primaryColor }}>
                        {statusLabel(order.status)}
                      </p>
                    )}
                  </div>
                  {isExpanded
                    ? <ChevronUp  className="w-4 h-4 shrink-0" style={{ color: dimText }} />
                    : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: dimText }} />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Cancelled banner OR progress bar */}
                    {isCancelled ? (
                      <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-2xl"
                        style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
                        <div>
                          <p className="text-sm font-bold" style={{ color: '#f87171' }}>Order Cancelled</p>
                          <p className="text-xs mt-0.5" style={{ color: 'rgba(248,113,113,0.75)' }}>
                            This order has been cancelled. Please contact us if you have any questions.
                          </p>
                        </div>
                      </div>
                    ) : (
                    <div className="pt-3">
                      <div className="flex items-center justify-between relative">
                        {/* Connecting line */}
                        <div className="absolute top-4 left-0 right-0 h-0.5 mx-4"
                          style={{ background: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }} />
                        <div className="absolute top-4 left-0 h-0.5 mx-4 transition-all duration-500"
                          style={{
                            background: primaryColor,
                            width: `${(step / (DELIVERY_STEPS.length - 1)) * (100 - 8) + '%'}`,
                          }} />
                        {DELIVERY_STEPS.map((s, i) => {
                          const Icon    = s.icon
                          const done    = i <= step
                          return (
                            <div key={s.key} className="relative z-10 flex flex-col items-center gap-1" style={{ flex: 1 }}>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                                style={{
                                  background: done ? primaryColor : (isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'),
                                  boxShadow: done ? `0 2px 8px ${primaryColor}50` : 'none',
                                }}>
                                <Icon className="w-3.5 h-3.5" style={{ color: done ? (primaryColor === '#39ff14' ? '#000' : '#fff') : dimText }} />
                              </div>
                              <p className="text-[9px] font-semibold text-center leading-tight w-14"
                                style={{ color: done ? primaryColor : dimText }}>
                                {s.label}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    )}

                    {/* Customer info */}
                    <div className="flex items-center gap-2 pt-1">
                      <User className="w-3.5 h-3.5 shrink-0" style={{ color: dimText }} />
                      <span className="text-xs" style={{ color: bodyText }}>{order.customer_name}</span>
                    </div>
                    {order.address_text && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: dimText }} />
                        <span className="text-xs leading-relaxed line-clamp-2" style={{ color: dimText }}>{order.address_text}</span>
                      </div>
                    )}

                    {/* Items */}
                    {order.items.length > 0 && (
                      <div className="rounded-xl overflow-hidden"
                        style={{ border: `1px solid ${cardBorder}` }}>
                        {order.items.map((item, idx) => (
                          <div key={idx}
                            className="flex items-center justify-between px-3 py-2"
                            style={{
                              borderBottom: idx < order.items.length - 1 ? `1px solid ${cardBorder}` : 'none',
                              background: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa',
                            }}>
                            <span className="text-xs font-semibold" style={{ color: bodyText }}>
                              {item.qty}× {item.item_name}
                            </span>
                            <span className="text-xs font-bold" style={{ color: primaryColor }}>
                              {formatPrice(item.item_price * item.qty)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 py-2"
                          style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6' }}>
                          <span className="text-xs font-bold" style={{ color: bodyText }}>Total</span>
                          <span className="text-sm font-extrabold" style={{ color: primaryColor }}>
                            {formatPrice(order.total)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────
export default function DeliveryOrderPage() {
  const { slug } = useParams<{ slug: string }>()
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const [restaurantId, setRestaurantId] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    supabase.from('restaurants').select('id').eq('menu_slug', slug).maybeSingle()
      .then(({ data }) => { if (data?.id) setRestaurantId(data.id) })
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Data
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [events, setEvents]         = useState<EventOffer[]>([])
  const [menuItems, setMenuItems]   = useState<MenuItem[]>([])
  const [kitchenNotes, setKitchenNotes] = useState<KitchenNote[]>([])
  const [loading, setLoading]       = useState(true)

  // Template
  const [tpl, setTpl]               = useState<TplCfg>(TEMPLATE_CONFIGS.classic)
  const [primaryColor, setPrimaryColor] = useState('#f59e0b')
  const [categoryStyle, setCategoryStyle] = useState<TplCfg['catLayout']>('circles')
  const [itemStyle, setItemStyle]   = useState<'grid' | 'list' | 'compact'>('grid')
  const [showPrices, setShowPrices] = useState(true)
  const [showDescs, setShowDescs]   = useState(true)
  const [welcomeText, setWelcomeText] = useState<string | null>(null)

  // Delivery config
  const [deliveryEnabled, setDeliveryEnabled] = useState(false)
  const [deliveryFee, setDeliveryFee]         = useState(0)
  const [minOrder, setMinOrder]               = useState(0)
  const [estimatedTime, setEstimatedTime]     = useState(30)

  // Story viewer
  const [storyIdx, setStoryIdx]     = useState<number | null>(null)
  const [storyKey, setStoryKey]     = useState(0)
  const storyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openStory  = (idx: number) => { setStoryIdx(idx); setStoryKey(k => k + 1) }
  const closeStory = () => { setStoryIdx(null); if (storyTimer.current) clearTimeout(storyTimer.current) }
  const goPrev = (e: React.MouseEvent) => { e.stopPropagation(); if (storyIdx !== null && storyIdx > 0) openStory(storyIdx - 1) }
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (storyIdx !== null && storyIdx < events.length - 1) openStory(storyIdx + 1)
    else closeStory()
  }

  // Category / items nav
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [showItems, setShowItems]   = useState(false)

  // Cart
  const [cart, setCart]             = useState<Map<string, CartEntry>>(new Map())
  const [showCart, setShowCart]     = useState(false)
  const [showModal, setShowModal]   = useState(false)
  const [itemModalId, setItemModalId] = useState<string | null>(null)

  // Order
  const [placing, setPlacing]       = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [orderPlaced, setOrderPlaced] = useState(false)

  const cartCount = useMemo(() => [...cart.values()].reduce((s, e) => s + e.qty, 0), [cart])
  const cartTotal = useMemo(() => {
    let total = 0
    cart.forEach((entry, id) => {
      const item = menuItems.find(m => m.id === id)
      if (item) {
        const modPrice = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
        total += (item.price + modPrice) * entry.qty
      }
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

  useEffect(() => {
    if (storyIdx === null) return
    storyTimer.current = setTimeout(() => {
      if (storyIdx < events.length - 1) openStory(storyIdx + 1)
      else closeStory()
    }, 10000)
    return () => { if (storyTimer.current) clearTimeout(storyTimer.current) }
  }, [storyIdx, storyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── SWR: cached menu data (instant on repeat visits) ──────────
  const { data: menuData, isLoading: menuLoading } = useRestaurantMenu(restaurantId ?? null)

  useEffect(() => {
    if (menuLoading) return
    if (!menuData?.restaurant) { setLoading(false); return }

    setRestaurant(menuData.restaurant as unknown as Restaurant)
    setCategories((menuData.categories) as unknown as Category[])
    setEvents((menuData.offers) as unknown as EventOffer[])
    setMenuItems((menuData.items) as unknown as MenuItem[])
    setKitchenNotes((menuData.notes) as unknown as KitchenNote[])

    // Load template
    if (menuData.template) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = menuData.template as any
      const tplId = (d.template ?? 'classic') as TemplateId
      setTpl(TEMPLATE_CONFIGS[tplId] ?? TEMPLATE_CONFIGS.classic)
      if (d.primary_color)    setPrimaryColor(d.primary_color)
      if (d.category_style)   setCategoryStyle(d.category_style)
      if (d.item_style)       setItemStyle(d.item_style)
      if (d.show_prices       !== undefined) setShowPrices(d.show_prices)
      if (d.show_descriptions !== undefined) setShowDescs(d.show_descriptions)
      if (d.welcome_text)     setWelcomeText(d.welcome_text)
    }

    // Load delivery settings from restaurant.settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rs = ((menuData.restaurant as any).settings ?? {}) as Record<string, unknown>
    setDeliveryEnabled(rs.delivery_enabled === true)
    setDeliveryFee(Number(rs.default_delivery_fee ?? 0))
    setMinOrder(Number(rs.min_order_amount ?? 0))
    setEstimatedTime(Number(rs.estimated_delivery_time ?? 30))

    setLoading(false)
  }, [menuData, menuLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const addOne = (id: string) => setCart(prev => {
    const next = new Map(prev)
    const e = next.get(id)
    next.set(id, e ? { ...e, qty: e.qty + 1 } : { qty: 1, selectedOptions: [], noteIds: [], customNote: '' })
    return next
  })

  const removeOne = (id: string) => setCart(prev => {
    const next = new Map(prev)
    const e = next.get(id)
    if (!e) return prev
    if (e.qty <= 1) next.delete(id)
    else next.set(id, { ...e, qty: e.qty - 1 })
    return next
  })

  const confirmItem = (id: string, entry: CartEntry) => {
    setCart(prev => {
      const next = new Map(prev)
      if (entry.qty <= 0) next.delete(id)
      else next.set(id, entry)
      return next
    })
    setItemModalId(null)
  }

  const getQty = (id: string) => cart.get(id)?.qty ?? 0

  const placeOrder = async (custName: string, custPhone: string, lat: number | null, lng: number | null, address: string | null) => {
    if (!restaurant || cartItems.length === 0) return
    setPlacing(true); setPlaceError(null)

    // Create order
    const { data: newOrder, error: orderErr } = await supabase
      .from('orders')
      .insert({
        restaurant_id: restaurant.id,
        table_number:  0,
        status:        'active',
        source:        'delivery',
        total:         cartTotal + deliveryFee,
      })
      .select('id')
      .single()

    if (orderErr || !newOrder) {
      setPlaceError(orderErr?.message ?? 'Failed to create order')
      setPlacing(false); return
    }

    await assignOrderNumber(supabase, restaurant.id, newOrder.id)

    // Insert order items
    const rows = cartItems.map(({ item, entry }) => {
      const modPrice = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
      const noteParts = [
        ...entry.selectedOptions.map(o => o.option_name),
        ...entry.noteIds.map(nid => kitchenNotes.find(k => k.id === nid)?.text ?? '').filter(Boolean),
        entry.customNote.trim(),
      ].filter(Boolean)
      return {
        order_id:   newOrder.id,
        item_name:  item.name,
        item_price: item.price + modPrice,
        qty:        entry.qty,
        status:     'pending',
        note:       noteParts.length > 0 ? noteParts.join(', ') : null,
        station_id: null,
      }
    })
    const { error: itemsErr } = await supabase.from('order_items').insert(rows)
    if (itemsErr) { setPlaceError(itemsErr.message); setPlacing(false); return }

    // Insert delivery info
    const { error: delivErr } = await supabase.from('delivery_orders').insert({
      order_id:      newOrder.id,
      restaurant_id: restaurant.id,
      customer_name: custName,
      customer_phone: custPhone,
      latitude:      lat,
      longitude:     lng,
      address_text:  address,
      delivery_fee:  deliveryFee,
      status:        'pending',
    })
    if (delivErr) { setPlaceError(delivErr.message); setPlacing(false); return }

    setCart(new Map())
    setShowModal(false)
    setShowCart(false)
    setOrderPlaced(true)
    setPlacing(false)
  }

  // ── Render ──────────────────────────────────────────────────
  if (loading) return (
    <div className={`min-h-screen ${TEMPLATE_CONFIGS.classic.pageBg} flex items-center justify-center`}>
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
    </div>
  )
  if (!restaurant) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <UtensilsCrossed className="w-10 h-10 text-gray-200" />
    </div>
  )
  if (!deliveryEnabled) return (
    <div className={`min-h-screen ${tpl.pageBg} flex flex-col items-center justify-center gap-4 px-6 text-center`}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${primaryColor}20` }}>
        <Truck className="w-8 h-8" style={{ color: primaryColor }} />
      </div>
      <h2 className={`text-xl font-bold ${tpl.nameColor}`}>Delivery Unavailable</h2>
      <p className={`text-sm ${tpl.welcomeColor}`}>{restaurant.name} is not currently accepting delivery orders.</p>
    </div>
  )

  const rst = (restaurant.settings ?? {}) as Record<string, string>
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

  return (
    <div className={`min-h-screen ${tpl.pageBg} flex flex-col items-center pt-14 text-center pb-28`}>
      <style>{`.scroll-hide::-webkit-scrollbar{display:none}`}</style>

      {/* Logo */}
      <div className="w-32 h-32 rounded-full overflow-hidden shadow-xl relative"
        style={{ outline: `4px solid ${primaryColor}`, outlineOffset: '4px', background: '#f3f4f6' }}>
        {restaurant.logo_url
          ? <NextImage src={restaurant.logo_url} alt={restaurant.name} fill className="object-cover" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: primaryColor }}>
              <span className="text-white text-5xl font-bold">{restaurant.name.charAt(0).toUpperCase()}</span>
            </div>}
      </div>

      {/* Name */}
      <h1 className={`mt-4 text-2xl font-bold tracking-tight px-6 ${tpl.nameColor}`}>{restaurant.name}</h1>

      {/* Delivery badge */}
      <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold"
        style={{ background: `${primaryColor}18`, color: primaryColor }}>
        <Truck className="w-3.5 h-3.5" /> Delivery Order
      </span>

      {/* Delivery info strip */}
      <div className="mt-3 flex items-center gap-4 text-xs"
        style={{ color: tpl.isDark ? 'rgba(255,255,255,0.40)' : '#9ca3af' }}>
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{estimatedTime} min</span>
        <span>·</span>
        <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Fee: {formatPrice(deliveryFee)}</span>
        {minOrder > 0 && <><span>·</span><span>Min: {formatPrice(minOrder)}</span></>}
      </div>

      {/* Welcome */}
      <p className={`mt-3 text-sm px-8 ${tpl.welcomeColor}`}>
        {welcomeText ?? 'Browse our menu and place your delivery order below.'}
      </p>

      {/* Order placed banner */}
      {orderPlaced && (
        <div className="mx-6 mt-5 w-full max-w-sm flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-left">
            <p className="text-sm font-bold text-emerald-700">Order Placed!</p>
            <p className="text-xs text-emerald-600 mt-0.5">We received your order and will contact you shortly to confirm delivery.</p>
          </div>
          <button onClick={() => setOrderPlaced(false)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Track Order ── */}
      <TrackOrderSection
        restaurantId={restaurantId ?? ''}
        primaryColor={primaryColor}
        isDark={tpl.isDark}
        formatPrice={formatPrice}
      />

      {/* ── Category navigation ── */}
      {categories.length > 0 && (
        <div className="w-full mt-6 overflow-x-hidden">
          {categoryStyle === 'circles' ? (
            <div className="scroll-hide flex gap-5 overflow-x-auto px-6 py-4"
              style={{ scrollbarWidth: 'none', overflowY: 'visible' } as React.CSSProperties}>
              {categories.map(cat => {
                const isActive = activeId === cat.id
                return (
                  <button key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="flex flex-col items-center gap-2 shrink-0 focus:outline-none">
                    <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-md transition-all duration-200"
                      style={{
                        background: cat.color,
                        outline: isActive ? `3px solid ${primaryColor}` : 'none',
                        outlineOffset: '3px',
                        boxShadow: isActive ? `0 6px 20px ${primaryColor}55` : '0 3px 10px rgba(0,0,0,0.12)',
                        transform: isActive ? 'scale(1.12)' : 'scale(1)',
                      }}>
                      {cat.icon
                        ? <span style={{ fontSize: '3.5rem', lineHeight: 1 }}>{cat.icon}</span>
                        : <span className="text-white text-3xl font-bold">{cat.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    <span className="text-xs font-semibold w-16 text-center leading-tight line-clamp-1"
                      style={{ color: isActive ? primaryColor : (tpl.isDark ? '#9ca3af' : '#6b7280') }}>
                      {cat.name}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : categoryStyle === 'square' ? (
            <div className="scroll-hide flex gap-3 overflow-x-auto px-6 py-3"
              style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
              {categories.map(cat => {
                const isActive = activeId === cat.id
                return (
                  <button key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="flex flex-col items-center gap-2 shrink-0 focus:outline-none">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-md transition-all duration-200"
                      style={{
                        background: cat.color,
                        outline: isActive ? `3px solid ${primaryColor}` : 'none',
                        outlineOffset: '3px',
                        transform: isActive ? 'scale(1.08)' : 'scale(1)',
                      }}>
                      {cat.icon
                        ? <span style={{ fontSize: '2.8rem', lineHeight: 1 }}>{cat.icon}</span>
                        : <span className="text-white text-2xl font-bold">{cat.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    <span className="text-xs font-semibold w-14 text-center leading-tight line-clamp-1"
                      style={{ color: isActive ? primaryColor : (tpl.isDark ? '#9ca3af' : '#6b7280') }}>
                      {cat.name}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : categoryStyle === 'horizontal' ? (
            <div className="flex flex-col gap-2 px-4">
              {categories.map(cat => {
                const isActive = activeId === cat.id
                return (
                  <button key={cat.id}
                    onClick={() => { setActiveId(cat.id); setShowItems(true) }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.98] text-left"
                    style={{
                      background: isActive ? `${primaryColor}18` : (tpl.isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb'),
                      borderLeft: `4px solid ${isActive ? primaryColor : cat.color}`,
                    }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: cat.color }}>
                      {cat.icon
                        ? <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{cat.icon}</span>
                        : <span className="text-white text-base font-bold">{cat.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    <span className="text-sm font-semibold flex-1"
                      style={{ color: isActive ? primaryColor : (tpl.isDark ? '#e5e7eb' : '#374151') }}>
                      {cat.name}
                    </span>
                    <span className="text-xs" style={{ color: tpl.isDark ? '#6b7280' : '#9ca3af' }}>
                      {menuItems.filter(i => i.category_id === cat.id).length} items
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
                      : { background: tpl.isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6', color: tpl.isDark ? 'rgba(255,255,255,0.5)' : '#6b7280' }}>
                    {cat.icon && <span className="text-base leading-none">{cat.icon}</span>}
                    {cat.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Items view ── */}
      {showItems && activeId && (() => {
        const activeCat = categories.find(c => c.id === activeId)
        const catItems  = menuItems.filter(i => i.category_id === activeId)
        return (
          <div className="w-full mt-4 px-4 pb-10 text-left">
            <button onClick={() => setShowItems(false)}
              className={`mb-4 ml-2 flex items-center gap-1.5 text-sm font-semibold transition-colors ${tpl.backBtn}`}>
              ← Back
            </button>
            {activeCat && (
              <div className="flex items-center gap-2 mb-4 px-2">
                <span className="w-3 h-3 rounded-full" style={{ background: activeCat.color }} />
                <h2 className={`text-lg font-bold ${tpl.sectionTitle}`}>{activeCat.name}</h2>
                <span className="text-sm text-gray-400">({catItems.length})</span>
              </div>
            )}
            {catItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <UtensilsCrossed className="w-10 h-10 text-gray-200" />
                <p className="text-gray-400 text-sm">No items in this category</p>
              </div>
            ) : itemStyle === 'list' ? (
              <div className="space-y-3">
                {catItems.map(item => {
                  const qty = getQty(item.id)
                  return (
                    <div key={item.id}
                      className={`flex gap-3 rounded-2xl border shadow-sm overflow-hidden ${tpl.itemCardBg} ${tpl.itemCardBorder}`}
                      style={{ boxShadow: qty > 0 ? `0 0 0 2px ${primaryColor}` : undefined }}>
                      <div className="w-20 h-20 shrink-0 bg-gray-100 overflow-hidden relative">
                        {item.image_url
                          ? <NextImage src={item.image_url} alt={item.name} fill className="object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-gray-200" /></div>}
                      </div>
                      <div className="flex flex-col justify-center flex-1 py-3 pr-3 gap-1.5">
                        <p className={`text-sm font-bold line-clamp-1 ${tpl.itemNameColor}`}>{item.name}</p>
                        {showDescs && item.description && (
                          <p className="text-xs line-clamp-1" style={{ color: tpl.isDark ? 'rgba(255,255,255,0.4)' : '#9ca3af' }}>{item.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          {showPrices && <p className={`text-sm font-extrabold ${tpl.priceColor}`}>{formatPrice(item.price)}</p>}
                          {qty === 0 ? (
                            <button onClick={() => addOne(item.id)}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 ${tpl.addBtnBg} ${tpl.addBtnText}`}>
                              <Plus className="w-3.5 h-3.5" /> Add
                            </button>
                          ) : (
                            <div className={`flex items-center rounded-xl border ${tpl.qtyBg} ${tpl.qtyBorder}`}>
                              <button onClick={() => removeOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}><Minus className="w-3.5 h-3.5" /></button>
                              <span className={`text-xs font-bold w-5 text-center tabular-nums ${tpl.qtyText}`}>{qty}</span>
                              <button onClick={() => addOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}><Plus className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : itemStyle === 'compact' ? (
              <div className="divide-y" style={{ borderColor: tpl.isDark ? 'rgba(255,255,255,0.07)' : '#f3f4f6' }}>
                {catItems.map(item => {
                  const qty = getQty(item.id)
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3 px-2 transition-all"
                      style={{ background: qty > 0 ? `${primaryColor}0d` : undefined }}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${tpl.itemNameColor}`}>{item.name}</p>
                        {showDescs && item.description && (
                          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: tpl.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af' }}>{item.description}</p>
                        )}
                        {showPrices && <p className={`text-xs font-bold mt-1 ${tpl.priceColor}`}>{formatPrice(item.price)}</p>}
                      </div>
                      {qty === 0 ? (
                        <button onClick={() => addOne(item.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 active:scale-90"
                          style={{ background: primaryColor }}>
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      ) : (
                        <div className={`flex items-center rounded-xl border ${tpl.qtyBg} ${tpl.qtyBorder} shrink-0`}>
                          <button onClick={() => removeOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}><Minus className="w-3.5 h-3.5" /></button>
                          <span className={`text-xs font-bold w-5 text-center tabular-nums ${tpl.qtyText}`}>{qty}</span>
                          <button onClick={() => addOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {catItems.map(item => {
                  const qty = getQty(item.id)
                  return (
                    <div key={item.id}
                      className={`rounded-2xl border shadow-sm overflow-hidden flex flex-col ${tpl.itemCardBg} ${tpl.itemCardBorder}`}
                      style={{ boxShadow: qty > 0 ? `0 0 0 2px ${primaryColor}` : undefined }}>
                      <div className="relative w-full aspect-square bg-gray-50">
                        {item.image_url
                          ? <NextImage src={item.image_url} alt={item.name} fill className="object-cover" />
                          : <div className="absolute inset-0 flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-gray-200" /></div>}
                        {qty > 0 && (
                          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
                            style={{ background: primaryColor }}>
                            <span className="text-white text-[10px] font-bold">{qty}</span>
                          </div>
                        )}
                      </div>
                      <div className="p-2 flex-1 flex flex-col gap-1">
                        <p className={`text-xs font-bold line-clamp-2 leading-snug ${tpl.itemNameColor}`}>{item.name}</p>
                        {showDescs && item.description && (
                          <p className="text-[10px] line-clamp-2 leading-snug" style={{ color: tpl.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af' }}>{item.description}</p>
                        )}
                        {showPrices && <p className={`text-xs font-extrabold mt-auto ${tpl.priceColor}`}>{formatPrice(item.price)}</p>}
                      </div>
                      <div className="px-2 pb-2">
                        {qty === 0 ? (
                          <button onClick={() => addOne(item.id)}
                            className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-bold active:scale-95 ${tpl.addBtnBg} ${tpl.addBtnText}`}>
                            <Plus className="w-3.5 h-3.5" /> Add
                          </button>
                        ) : (
                          <div className={`flex items-center justify-between rounded-xl border ${tpl.qtyBg} ${tpl.qtyBorder}`}>
                            <button onClick={() => removeOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}><Minus className="w-3.5 h-3.5" /></button>
                            <span className={`text-xs font-bold tabular-nums flex-1 text-center ${tpl.qtyText}`}>{qty}</span>
                            <button onClick={() => addOne(item.id)} className={`w-8 h-8 flex items-center justify-center active:scale-90 ${tpl.qtyText}`}><Plus className="w-3.5 h-3.5" /></button>
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

      {/* ── Events & Social ── */}
      {!showItems && (
        <>
          {events.length > 0 && (
            <div className="w-full mt-6 text-left">
              <h2 className={`text-lg font-bold mb-3 px-6 ${tpl.sectionTitle}`}>Event &amp; Offers</h2>
              <div className="scroll-hide flex gap-5 overflow-x-auto px-6 pb-4 pt-2"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {events.map((ev, idx) => (
                  <div key={ev.id} onClick={() => openStory(idx)}
                    className="shrink-0 rounded-2xl p-[3px] shadow-lg cursor-pointer active:scale-95 transition-transform"
                    style={{ background: primaryColor, boxShadow: `0 4px 18px ${primaryColor}55` }}>
                    <div className="relative rounded-[14px] overflow-hidden w-40 h-56">
                      {ev.image_url
                        ? <NextImage src={ev.image_url} alt={ev.title} fill className="object-cover" />
                        : <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-white text-xs font-bold leading-snug line-clamp-2">{ev.title}</p>
                        {ev.date_label && <p className="text-white/70 text-[10px] mt-0.5">{ev.date_label}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {socialLinks.length > 0 && (
            <div className="w-full mt-4 pb-10 text-left">
              <div className="scroll-hide flex gap-3 overflow-x-auto px-6 py-2"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {socialLinks.map(s => {
                  const href = buildSocialHref(s.key, s.value)
                  return (
                    <a key={s.key} href={href === '#' ? undefined : href}
                      target="_blank" rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-full border bg-white shadow-sm active:scale-95 transition-all"
                      style={{ borderColor: s.borderColor }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: s.iconBg }}>
                        <span style={{ color: s.key === 'snapchat' ? '#111' : '#fff' }}>{s.icon}</span>
                      </div>
                      <span className="text-base font-semibold whitespace-nowrap" style={{ color: s.textColor }}>{s.label}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Floating cart button ── */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4">
          <button
            onClick={() => setShowCart(true)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl shadow-xl active:scale-95 transition-all"
            style={{ background: primaryColor, boxShadow: `0 8px 32px ${primaryColor}50` }}>
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
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Your Order</h2>
                <p className="text-xs text-gray-400 mt-0.5">{cartCount} item{cartCount !== 1 ? 's' : ''} · Delivery</p>
              </div>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cartItems.map(({ item, entry }) => {
                const modPrice = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
                const lineTotal = (item.price + modPrice) * entry.qty
                const allNotes = [
                  ...entry.selectedOptions.map(o => o.option_name),
                  ...entry.noteIds.map(nid => kitchenNotes.find(k => k.id === nid)?.text ?? '').filter(Boolean),
                  entry.customNote.trim(),
                ].filter(Boolean)
                return (
                  <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
                    <div className="flex items-center gap-3 px-3 pt-3">
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-200 shrink-0 relative">
                        {item.image_url
                          ? <NextImage src={item.image_url} alt={item.name} fill className="object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-4 h-4 text-gray-300" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 line-clamp-1">{item.name}</p>
                        <p className="text-xs font-bold mt-0.5" style={{ color: primaryColor }}>{formatPrice(lineTotal)}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white shrink-0">
                        <button onClick={() => removeOne(item.id)} className="w-8 h-8 flex items-center justify-center text-gray-500 active:scale-90">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-bold text-gray-800 w-5 text-center tabular-nums">{entry.qty}</span>
                        <button onClick={() => addOne(item.id)} className="w-8 h-8 flex items-center justify-center text-gray-500 active:scale-90">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 pb-3 pt-2">
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

            {/* Totals */}
            <div className="px-5 pt-3 pb-2 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span><span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Delivery fee</span><span>{formatPrice(deliveryFee)}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-gray-900 pt-1 border-t border-gray-100">
                <span>Total</span><span style={{ color: primaryColor }}>{formatPrice(cartTotal + deliveryFee)}</span>
              </div>
            </div>

            <div className="px-5 pb-6 pt-2">
              {minOrder > 0 && cartTotal < minOrder && (
                <p className="text-xs text-amber-600 text-center mb-2">
                  Minimum order is {formatPrice(minOrder)} — add {formatPrice(minOrder - cartTotal)} more
                </p>
              )}
              <button
                onClick={() => { setShowCart(false); setShowModal(true) }}
                disabled={minOrder > 0 && cartTotal < minOrder}
                className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: primaryColor, color: primaryColor === '#39ff14' ? '#000' : '#fff', boxShadow: `0 6px 24px ${primaryColor}40` }}>
                <Truck className="w-4 h-4" /> Place Order · {formatPrice(cartTotal + deliveryFee)}
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
          <DeliveryItemModal
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

      {/* ── Delivery Modal ── */}
      {showModal && (
        <DeliveryModal
          primaryColor={primaryColor}
          cartCount={cartCount}
          cartTotal={cartTotal}
          formatPrice={formatPrice}
          onClose={() => setShowModal(false)}
          onConfirm={placeOrder}
          placing={placing}
          placeError={placeError}
          deliveryFee={deliveryFee}
          estimatedTime={estimatedTime}
          minOrder={minOrder}
        />
      )}

      {/* ── Story Viewer ── */}
      {storyIdx !== null && events[storyIdx] && (() => {
        const ev = events[storyIdx]
        return (
          <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
            style={{ animation: 'story-fadein 0.25s ease forwards' }}>

            <style>{`
              @keyframes story-fadein   { from{opacity:0} to{opacity:1} }
              @keyframes story-progress { from{transform:scaleX(0)} to{transform:scaleX(1)} }
              @keyframes story-slideup  { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
              @keyframes story-badge    { from{opacity:0;transform:translateY(-14px) scale(.88)} to{opacity:1;transform:translateY(0) scale(1)} }
              @keyframes story-desc     { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
            `}</style>

            {/* Desktop arrows */}
            {storyIdx > 0 && (
              <button onClick={goPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm hidden sm:flex items-center justify-center active:scale-90 transition-transform">
                <ChevronRight className="w-5 h-5 text-white rotate-180" />
              </button>
            )}
            {storyIdx < events.length - 1 && (
              <button onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm hidden sm:flex items-center justify-center active:scale-90 transition-transform">
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            )}

            {/* 9:16 canvas */}
            <div className="relative overflow-hidden"
              style={{ height: '100dvh', width: 'calc(100dvh * 9 / 16)', maxWidth: '100vw', maxHeight: '1920px' }}>

              {/* Background */}
              <div className="absolute inset-0">
                {ev.image_url
                  ? <NextImage src={ev.image_url} alt={ev.title} fill className="object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500" />
                }
                <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent via-40% to-black/85" />
                <div className="absolute inset-0 bg-black/15" />
              </div>

              {/* Progress bars */}
              <div className="absolute top-0 left-0 right-0 flex gap-1.5 px-4 pt-4 z-10">
                {events.map((_, i) => (
                  <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
                    {i === storyIdx && (
                      <div key={storyKey} className="h-full bg-white rounded-full origin-left"
                        style={{ animation: 'story-progress 10s linear forwards' }} />
                    )}
                    {i < storyIdx && <div className="h-full bg-white rounded-full w-full" />}
                  </div>
                ))}
              </div>

              {/* Header */}
              <div className="absolute top-10 left-0 right-0 flex items-center justify-between px-5 z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full border-2 border-white/40 overflow-hidden bg-amber-400 flex items-center justify-center text-black font-black text-sm shrink-0">
                    {restaurant?.logo_url
                      ? <NextImage src={restaurant.logo_url} alt="" fill className="object-cover" />
                      : (restaurant?.name?.[0] ?? 'R')}
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold leading-tight">{restaurant?.name}</p>
                    <p className="text-white/55 text-[11px]">Event &amp; Offers</p>
                  </div>
                </div>
                <button onClick={closeStory}
                  className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>

              {/* Bottom content */}
              <div className="absolute bottom-0 left-0 right-0 px-6 pb-14 z-10 space-y-4">
                {ev.date_label && (
                  <div key={`badge-${storyKey}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400 text-black text-sm font-bold shadow-lg shadow-amber-400/30"
                    style={{ animation: 'story-badge 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}>
                    {ev.date_label}
                  </div>
                )}
                <h2 key={`title-${storyKey}`} className="text-white font-black leading-[1.1]"
                  style={{ fontSize: 'clamp(1.75rem, 7vw, 3rem)', textShadow: '0 2px 24px rgba(0,0,0,0.65)', animation: 'story-slideup 0.55s cubic-bezier(0.22,1,0.36,1) 0.22s both' }}>
                  {ev.title}
                </h2>
                {ev.description && (
                  <p key={`desc-${storyKey}`} className="text-white/90 leading-relaxed"
                    style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.15rem)', textShadow: '0 1px 12px rgba(0,0,0,0.7)', animation: 'story-desc 0.6s ease 0.45s both' }}>
                    {ev.description}
                  </p>
                )}
                <p className="text-white/40 text-xs font-medium">{storyIdx + 1} / {events.length}</p>
              </div>

              {/* Tap zones */}
              <div className="absolute inset-0 flex z-20">
                <div className="w-1/3 h-full cursor-pointer" onClick={goPrev} />
                <div className="w-2/3 h-full cursor-pointer" onClick={goNext} />
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Delivery Item Modal ───────────────────────────────────────
function DeliveryItemModal({ item, initial, kitchenNotes, supabase, formatPrice, onConfirm, onClose }: {
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={e => e.stopPropagation()}
      >
        {item.image_url ? (
          <div className="shrink-0 relative h-40 overflow-hidden">
            <NextImage src={item.image_url} alt={item.name} fill className="object-cover" />
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

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
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
