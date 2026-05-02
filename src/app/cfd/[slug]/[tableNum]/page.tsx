'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { QRCodeSVG } from 'qrcode.react'
import { Star, Check, ChefHat, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────
type Phase = 'loading' | 'idle' | 'ordering' | 'thankyou'

interface Restaurant { id: string; name: string; logo_url: string | null }
interface Currency   { symbol: string; decimal_places: number }
interface OItem      { id: string; menu_item_id: string | null; item_name: string; item_price: number; qty: number; status: string }

// ══════════════════════════════════════════════════════════════
export default function CFDPage() {
  const { slug, tableNum } = useParams<{ slug: string; tableNum: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string>('')
  const [phase,     setPhase]     = useState<Phase>('loading')
  const [rest,      setRest]      = useState<Restaurant | null>(null)
  const [currency,  setCurrency]  = useState<Currency>({ symbol: '$', decimal_places: 2 })
  const [orderId,   setOrderId]   = useState<string | null>(null)
  const [paidOId,   setPaidOId]   = useState<string | null>(null)
  const [items,     setItems]     = useState<OItem[]>([])
  const [imgMap,    setImgMap]    = useState<Map<string, string | null>>(new Map())
  const [newestId,  setNewestId]  = useState<string | null>(null)

  // Clock
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [])

  // Feedback
  const [rating,    setRating]    = useState(0)
  const [hoverStar, setHoverStar] = useState(0)
  const [comment,   setComment]   = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting,setSubmitting]= useState(false)
  const [timer,     setTimer]     = useState(40)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Init: resolve slug → UUID, then load restaurant + currency + menu images ─
  useEffect(() => {
    if (!slug) return
    const init = async () => {
      const { data: r } = await supabase.from('restaurants').select('id, name, logo_url').eq('menu_slug', slug).maybeSingle()
      if (!r) return
      setRest(r as Restaurant)
      setRestaurantId(r.id)
      const [{ data: c }, { data: mi }] = await Promise.all([
        supabase.from('currencies').select('symbol, decimal_places').eq('restaurant_id', r.id).eq('is_default', true).limit(1).maybeSingle(),
        supabase.from('menu_items').select('id, name, image_url').eq('restaurant_id', r.id),
      ])
      if (c) setCurrency(c as Currency)
      const m = new Map<string, string | null>()
      ;(mi ?? []).forEach((x: { id: string; name: string; image_url: string | null }) => {
        m.set(x.name, x.image_url)
        m.set(x.id,   x.image_url)
      })
      setImgMap(m)
    }
    init()
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Find active order for this table ─────────────────────
  const findOrder = useCallback(async () => {
    if (!restaurantId) return
    if (tableNum === 'idle') { setPhase('idle'); setItems([]); setOrderId(null); return }
    const n = parseInt(tableNum)
    const q = isNaN(n)
      ? supabase.from('orders').select('id').eq('restaurant_id', restaurantId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
      : supabase.from('orders').select('id').eq('restaurant_id', restaurantId).eq('table_number', n).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
    const { data } = await q
    if (data) {
      setOrderId(data.id)
      const { data: ois } = await supabase
        .from('order_items').select('id,menu_item_id,item_name,item_price,qty,status')
        .eq('order_id', data.id).neq('status', 'void').order('created_at')
      setItems((ois ?? []) as OItem[])
      setPhase('ordering')
    } else {
      setOrderId(null); setItems([]); setPhase('idle')
    }
  }, [restaurantId, tableNum]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { findOrder() }, [findOrder])

  // ── POS broadcast: switch table when staff opens payment screen ──
  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase
      .channel(`cfd-sync-${restaurantId}`)
      .on('broadcast', { event: 'table_change' }, ({ payload }) => {
        if (!payload?.table) return
        if (payload.table === 'idle') {
          setPhase('idle'); setItems([]); setOrderId(null)
        } else if (String(payload.table) === String(tableNum)) {
          findOrder()
        } else {
          router.replace(`/cfd/${slug}/${payload.table}`)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId, tableNum]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start thank-you countdown ─────────────────────────────
  const startCountdown = useCallback((seconds = 40) => {
    setTimer(seconds)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(countdownRef.current!)
          setPhase('idle'); setItems([]); setOrderId(null)
          return 0
        }
        return t - 1
      })
    }, 1000)
  }, [])

  // ── Realtime: orders table ────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel('cfd-orders')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, async (payload) => {
        const rec = payload.new as { id: string; status: string; table_number: number } | null
        if (!rec) return
        const n = parseInt(tableNum)
        if (!isNaN(n) && rec.table_number !== n) return  // not our table

        if (rec.status === 'active') {
          setOrderId(rec.id); setPhase('ordering')
          const { data: ois } = await supabase
            .from('order_items').select('id,menu_item_id,item_name,item_price,qty,status')
            .eq('order_id', rec.id).neq('status', 'void').order('created_at')
          setItems((ois ?? []) as OItem[])
        } else if (rec.status === 'paid') {
          setPaidOId(rec.id)
          setOrderId(null)
          setPhase('thankyou')
          setRating(0); setHoverStar(0); setComment(''); setSubmitted(false)
          startCountdown(40)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [restaurantId, tableNum, startCountdown]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: order items ─────────────────────────────────
  useEffect(() => {
    if (!orderId) return
    const ch = supabase.channel(`cfd-oi-${orderId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_items',
        filter: `order_id=eq.${orderId}`,
      }, (p) => {
        const item = p.new as OItem
        if (item.status === 'void') return
        setItems(prev => {
          const ex = prev.find(i => i.item_name === item.item_name && i.menu_item_id === item.menu_item_id)
          if (ex) return prev.map(i => i.id === ex.id ? { ...i, qty: i.qty + item.qty } : i)
          return [...prev, item]
        })
        setNewestId(item.id)
        setTimeout(() => setNewestId(null), 2500)
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'order_items',
        filter: `order_id=eq.${orderId}`,
      }, (p) => {
        const item = p.new as OItem
        if (item.status === 'void') setItems(prev => prev.filter(i => i.id !== item.id))
        else setItems(prev => prev.map(i => i.id === item.id ? item : i))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────
  const total = items.reduce((s, i) => s + i.item_price * i.qty, 0)
  const fmt = (n: number) =>
    `${currency.symbol} ${n.toLocaleString(undefined, { minimumFractionDigits: currency.decimal_places, maximumFractionDigits: currency.decimal_places })}`
  const menuUrl = typeof window !== 'undefined' ? `${window.location.origin}/r/${slug}` : ''

  const submitFeedback = async () => {
    if (rating === 0 || submitting) return
    setSubmitting(true)
    await supabase.from('customer_feedback').insert({
      restaurant_id: restaurantId,
      order_id: paidOId,
      table_num: tableNum,
      rating,
      comment: comment.trim() || null,
    })
    setSubmitting(false)
    setSubmitted(true)
  }

  // ═══════════════════════════════════════════════════════════
  // ── LOADING ────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div className="min-h-screen bg-[#022658] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ═══════════════════════════════════════════════════════════
  // ── IDLE ───────────────────────────────────────────────────
  if (phase === 'idle') return (
    <div className="min-h-screen bg-[#022658] flex flex-col relative overflow-hidden">
      <style>{`
        @keyframes cfd-float    { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-14px)} }
        @keyframes cfd-ring     { 0%{transform:scale(0.92);opacity:.7} 100%{transform:scale(1.5);opacity:0} }
        @keyframes cfd-fadein   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .cfd-float   { animation: cfd-float  5s ease-in-out infinite }
        .cfd-ring    { animation: cfd-ring   2.5s ease-out infinite }
        .cfd-fadein  { animation: cfd-fadein 0.7s ease both }
      `}</style>

      {/* Background glows */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/6 via-transparent to-orange-600/6 pointer-events-none" />
      <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-amber-500/6 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full bg-orange-500/6 blur-3xl pointer-events-none" />

      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          {rest?.logo_url
            ? <img src={rest.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
            : <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center"><ChefHat className="w-4 h-4 text-amber-400" /></div>
          }
          <span className="text-base font-bold text-white/70">{rest?.name}</span>
        </div>
        <div className="flex items-center gap-3 text-white/25 text-sm">
          <span>Table · مێز  {tableNum}</span>
          <span className="w-px h-4 bg-white/10" />
          <span className="font-mono text-lg font-bold">{time}</span>
        </div>
      </header>

      {/* Center */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="flex flex-col lg:flex-row items-center gap-16 cfd-fadein">

          {/* Logo + welcome */}
          <div className="text-center">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 rounded-full cfd-ring bg-amber-400/20" />
              <div className="absolute inset-0 rounded-full cfd-ring bg-amber-400/10" style={{ animationDelay: '1.2s' }} />
              {rest?.logo_url
                ? <img src={rest.logo_url} alt="" className="relative w-36 h-36 rounded-full object-cover border-4 border-amber-500/25 cfd-float shadow-2xl shadow-amber-500/20" />
                : <div className="relative w-36 h-36 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center cfd-float shadow-2xl shadow-amber-500/30 border-4 border-amber-500/25">
                    <UtensilsCrossed className="w-16 h-16 text-white" />
                  </div>
              }
            </div>
            <h1 className="text-5xl font-black text-white mb-3 tracking-tight">{rest?.name ?? 'Welcome'}</h1>
            <p className="text-2xl text-white/35 font-light mb-1">Welcome — بخێر بێ</p>
            <p className="text-white/20 text-sm">Customer Display · شاشەی کڕیار</p>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px h-48 bg-white/8" />

          {/* QR code */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-white/35 text-sm font-medium text-center">
              Scan to view our menu<br />
              <span className="text-white/20">سکان بکە بۆ بینینی مینیوو</span>
            </p>
            <div className="p-4 rounded-3xl bg-white shadow-2xl shadow-black/50">
              <QRCodeSVG value={menuUrl} size={160} bgColor="#ffffff" fgColor="#022658" level="H" />
            </div>
            <p className="text-[11px] text-white/20 text-center">Digital Menu · مینیووی دیجیتاڵ</p>
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="shrink-0 border-t border-white/5 px-8 py-3 flex items-center justify-center">
        <p className="text-[11px] text-white/15 tracking-widest uppercase">Powered by ClickGroup POS</p>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════
  // ── ORDERING ───────────────────────────────────────────────
  if (phase === 'ordering') return (
    <div className="min-h-screen bg-[#022658] flex flex-col overflow-hidden">
      <style>{`
        @keyframes cfd-slidein   { from{transform:translateX(-24px) scale(0.97);opacity:0} to{transform:translateX(0) scale(1);opacity:1} }
        @keyframes cfd-highlight { 0%,100%{background-color:transparent} 40%{background-color:rgba(251,191,36,0.12)} }
        @keyframes cfd-pricepop  { 0%{transform:scale(1)} 40%{transform:scale(1.08)} 100%{transform:scale(1)} }
        .cfd-slidein   { animation: cfd-slidein   0.45s cubic-bezier(0.34,1.56,0.64,1) }
        .cfd-highlight { animation: cfd-highlight 2.5s ease }
        .cfd-pricepop  { animation: cfd-pricepop  0.5s ease }
      `}</style>

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/8 bg-black/30 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {rest?.logo_url
            ? <img src={rest.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/10" />
            : <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center"><ChefHat className="w-5 h-5 text-amber-400" /></div>
          }
          <div>
            <p className="text-sm font-bold text-white leading-none">{rest?.name}</p>
            <p className="text-xs text-white/35 mt-0.5">Table {tableNum} · مێز {tableNum}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black text-amber-400 leading-none tabular-nums">{fmt(total)}</p>
          <p className="text-xs text-white/30 mt-1">{items.length} item{items.length !== 1 ? 's' : ''} · کاڵا</p>
        </div>
      </header>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: 'none' }}>
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <UtensilsCrossed className="w-16 h-16 text-white/10 mb-4" />
            <p className="text-white/25 text-lg font-medium">Waiting for order…</p>
            <p className="text-white/15 text-sm mt-1">چاوەڕوانی داواکاری دەکرێت</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl mx-auto">
            {items.map(item => {
              const img = imgMap.get(item.menu_item_id ?? '') ?? imgMap.get(item.item_name) ?? null
              const isNew = item.id === newestId
              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center gap-4 p-3 rounded-2xl border transition-colors',
                    isNew
                      ? 'cfd-slidein cfd-highlight border-amber-500/30'
                      : 'border-white/8 bg-white/3'
                  )}
                >
                  {/* Photo */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-white/5 border border-white/8">
                    {img
                      ? <img src={img} alt={item.item_name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
                    }
                  </div>

                  {/* Name + unit price */}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-white leading-snug">{item.item_name}</p>
                    <p className="text-sm text-white/35 mt-0.5">{fmt(item.item_price)} × each</p>
                  </div>

                  {/* Qty badge */}
                  <div className={cn('w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center shrink-0', isNew && 'bg-amber-500/20')}>
                    <span className={cn('text-base font-black', isNew ? 'text-amber-300' : 'text-white')}>×{item.qty}</span>
                  </div>

                  {/* Line total */}
                  <div className={cn('min-w-[110px] text-right shrink-0', isNew && 'cfd-pricepop')}>
                    <p className={cn('text-lg font-black tabular-nums', isNew ? 'text-amber-400' : 'text-white/80')}>
                      {fmt(item.item_price * item.qty)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer total bar */}
      <footer className="shrink-0 border-t border-white/8 bg-black/40 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest">Total · کۆی گشتی</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black text-white tabular-nums">{fmt(total)}</p>
          </div>
        </div>
      </footer>
    </div>
  )

  // ═══════════════════════════════════════════════════════════
  // ── THANK YOU / FEEDBACK ───────────────────────────────────
  return (
    <div className="min-h-screen bg-[#022658] flex flex-col items-center justify-center px-8 relative overflow-hidden">
      <style>{`
        @keyframes cfd-checkpop  { 0%{transform:scale(0) rotate(-10deg);opacity:0} 70%{transform:scale(1.15) rotate(3deg)} 100%{transform:scale(1) rotate(0deg);opacity:1} }
        @keyframes cfd-starburst { 0%{transform:scale(0.6);opacity:0} 100%{transform:scale(1);opacity:1} }
        .cfd-checkpop  { animation: cfd-checkpop  0.7s cubic-bezier(0.34,1.56,0.64,1) }
        .cfd-starburst { animation: cfd-starburst 0.5s cubic-bezier(0.34,1.56,0.64,1) both }
      `}</style>

      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/5 blur-3xl pointer-events-none" />

      {!submitted ? (
        <div className="relative z-10 text-center w-full max-w-lg">

          {/* Check icon */}
          <div className="w-28 h-28 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-7 cfd-checkpop shadow-2xl shadow-emerald-500/20">
            <Check className="w-14 h-14 text-emerald-400" strokeWidth={2.5} />
          </div>

          <h1 className="text-5xl font-black text-white mb-3 tracking-tight">Thank You!</h1>
          <p className="text-2xl text-white/40 font-light mb-1">سوپاس بۆ سەردانکردنتان</p>
          <p className="text-white/20 text-sm mb-10">Table {tableNum} · مێز {tableNum}</p>

          {/* Stars */}
          <p className="text-white/45 text-sm font-medium mb-5">
            Rate your experience · نرخاندنی ئەزموونت
          </p>
          <div className="flex items-center justify-center gap-4 mb-7">
            {[1, 2, 3, 4, 5].map((s, i) => (
              <button
                key={s}
                onMouseEnter={() => setHoverStar(s)}
                onMouseLeave={() => setHoverStar(0)}
                onClick={() => setRating(s)}
                style={{ animationDelay: `${i * 0.07}s` }}
                className="transition-transform active:scale-90 cfd-starburst"
              >
                <Star
                  className={cn(
                    'w-14 h-14 transition-all duration-150',
                    (hoverStar || rating) >= s
                      ? 'text-amber-400 fill-amber-400 scale-110 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                      : 'text-white/20 scale-100'
                  )}
                />
              </button>
            ))}
          </div>

          {/* Comment (appears after rating) */}
          <div className={cn('mb-7 transition-all duration-300 overflow-hidden', rating > 0 ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0')}>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Tell us more (optional) · بۆچی زیادتر بنووسە"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/40 transition-colors resize-none"
            />
          </div>

          {/* Submit */}
          <button
            onClick={submitFeedback}
            disabled={rating === 0 || submitting}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-25 disabled:cursor-not-allowed text-white text-base font-bold transition-all active:scale-[0.98] shadow-xl shadow-emerald-500/20 mb-7"
          >
            {submitting ? 'Sending…' : 'Submit Feedback · ناردنی ڕای'}
          </button>

          {/* Auto-return timer */}
          <div className="flex items-center justify-center gap-3 text-white/20 text-xs">
            <div className="w-32 h-1 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full bg-white/25 rounded-full transition-all duration-1000"
                style={{ width: `${(timer / 40) * 100}%` }}
              />
            </div>
            <span>Back in {timer}s · دەگەڕێتەوە لە {timer}s</span>
          </div>
        </div>

      ) : (
        /* ── Submitted ── */
        <div className="relative z-10 text-center">
          <div className="w-28 h-28 rounded-full bg-amber-500/15 border-2 border-amber-500/30 flex items-center justify-center mx-auto mb-7 cfd-checkpop shadow-2xl shadow-amber-500/20">
            <Star className="w-14 h-14 text-amber-400 fill-amber-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Feedback Received!</h1>
          <p className="text-xl text-white/35 mb-8">سوپاس بۆ ڕاکێشانت</p>
          <div className="flex items-center justify-center gap-2 mb-10">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} className={cn('w-10 h-10 transition-colors', s <= rating ? 'text-amber-400 fill-amber-400' : 'text-white/12')} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 text-white/20 text-xs">
            <div className="w-32 h-1 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full bg-white/25 rounded-full transition-all duration-1000" style={{ width: `${(timer / 40) * 100}%` }} />
            </div>
            <span>Back in {timer}s</span>
          </div>
        </div>
      )}
    </div>
  )
}
