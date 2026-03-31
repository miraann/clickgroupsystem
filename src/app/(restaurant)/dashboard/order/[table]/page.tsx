'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Users, Minus, Plus, X,
  Send, ChefHat, ShoppingBag, CreditCard,
  Loader2, AlertCircle, Trash2, Tag, ArrowRightLeft, DollarSign, ChevronRight, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import PaymentScreen from '@/components/restaurant/payment-screen'
import { assignOrderNumber } from '@/lib/orderNumber'

// ── Types ─────────────────────────────────────────────────────
interface DbCategory { id: string; name: string; color: string }
interface DbMenuItem  { id: string; name: string; price: number; category_id: string | null; image_url?: string | null }
interface KitchenNote { id: string; text: string }

interface SelectedOption {
  modifier_id: string
  modifier_name: string
  option_id: string
  option_name: string
  price: number
}

interface DraftEntry {
  qty: number
  selectedNoteIds: string[]
  customNote: string
  selectedOptions: SelectedOption[]
}

interface ModifierGroup {
  id: string
  name: string
  required: boolean
  min_select: number
  max_select: number
  options: { id: string; name: string; price: number }[]
}

interface DbOrderItem {
  id: string
  item_name: string
  item_price: number
  qty: number
  status: 'pending' | 'sent' | 'cooking' | 'ready' | 'void'
  note?: string | null
}

// ── Page ──────────────────────────────────────────────────────
function OrderPage() {
  const { table } = useParams<{ table: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const { symbol: cur, formatPrice } = useDefaultCurrency()

  const guests = parseInt(searchParams.get('guests') ?? '0')

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [orderId, setOrderId]           = useState<string | null>(null)
  const [dbItems, setDbItems]           = useState<DbOrderItem[]>([])

  const [categories, setCategories]     = useState<DbCategory[]>([])
  const [menuItems, setMenuItems]       = useState<DbMenuItem[]>([])
  const [kitchenNotes, setKitchenNotes] = useState<KitchenNote[]>([])
  // category_id → kds station_id (from kds_station_categories)
  const [catStationMap, setCatStationMap] = useState<Map<string, string>>(new Map())

  // draft: menuItemId → DraftEntry
  const [draft, setDraft] = useState<Map<string, DraftEntry>>(new Map())

  const [activeCategory, setActiveCategory] = useState<string>('')
  const [activeTab, setActiveTab]           = useState<'ordering' | 'ordered'>('ordering')
  const [sending, setSending]               = useState(false)
  const [sendError, setSendError]           = useState<string | null>(null)
  const [showPayment, setShowPayment]       = useState(false)
  const [initError, setInitError]           = useState<string | null>(null)
  const [loading, setLoading]               = useState(true)

  // which draft item is open in the customize modal
  const [editingId, setEditingId] = useState<string | null>(null)
  // which sent item is open in the action modal
  const [actionItem, setActionItem] = useState<DbOrderItem | null>(null)

  // ── Init ──────────────────────────────────────────────────
  const init = useCallback(async () => {
    setLoading(true); setInitError(null)

    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setInitError('Restaurant not found.'); setLoading(false); return }
    setRestaurantId(rest.id)

    const [catsRes, itemsRes, notesRes, existingRes, stationCatRes] = await Promise.all([
      supabase.from('menu_categories').select('id,name,color').eq('restaurant_id', rest.id).eq('active', true).order('sort_order'),
      supabase.from('menu_items').select('id,name,price,category_id,image_url').eq('restaurant_id', rest.id).eq('available', true).order('sort_order'),
      supabase.from('kitchen_notes').select('id,text').eq('restaurant_id', rest.id).eq('active', true).order('sort_order'),
      supabase.from('orders').select('id').eq('restaurant_id', rest.id).eq('table_number', parseInt(table)).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('kds_station_categories').select('station_id,category_id'),
    ])

    const cats  = (catsRes.data  ?? []) as DbCategory[]
    const items = (itemsRes.data ?? []) as DbMenuItem[]
    const notes = (notesRes.data ?? []) as KitchenNote[]
    setCategories(cats)
    setMenuItems(items)
    setKitchenNotes(notes)
    if (cats.length > 0) setActiveCategory(c => c || cats[0].id)

    // Build category → station map
    const csMap = new Map<string, string>()
    for (const a of (stationCatRes.data ?? [])) csMap.set(a.category_id, a.station_id)
    setCatStationMap(csMap)

    // Only load existing order — do NOT create one yet.
    // The order (and Occupied status) is created when the first items are sent.
    const oid = existingRes.data?.id ?? null
    setOrderId(oid)

    if (oid) {
      const { data: orderItems } = await supabase
        .from('order_items').select('id,item_name,item_price,qty,status,note')
        .eq('order_id', oid).neq('status', 'void').order('created_at')
      const loaded = (orderItems ?? []) as DbOrderItem[]
      setDbItems(loaded)
      if (loaded.length > 0) setActiveTab('ordered')
    }
    setLoading(false)
  }, [table, guests]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { init() }, [init])

  // ── Realtime: update item status when KDS changes it ─────────
  useEffect(() => {
    if (!orderId) return
    const channel = supabase
      .channel(`order-items-${orderId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}` },
        (payload) => {
          const updated = payload.new as { id: string; status: string }
          setDbItems(prev => prev.map(i =>
            i.id === updated.id ? { ...i, status: updated.status as DbOrderItem['status'] } : i
          ))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draft helpers ─────────────────────────────────────────
  const draftAdd = (item: DbMenuItem) => {
    setDraft(prev => {
      const m = new Map(prev)
      const ex = m.get(item.id)
      m.set(item.id, ex ? { ...ex, qty: ex.qty + 1 } : { qty: 1, selectedNoteIds: [], customNote: '', selectedOptions: [] })
      return m
    })
    setActiveTab('ordering')
  }

  const draftChange = (itemId: string, delta: number) => {
    setDraft(prev => {
      const m = new Map(prev)
      const ex = m.get(itemId)
      if (!ex) return m
      const next = ex.qty + delta
      next <= 0 ? m.delete(itemId) : m.set(itemId, { ...ex, qty: next })
      return m
    })
  }

  const draftSet = (itemId: string, entry: DraftEntry) => {
    setDraft(prev => { const m = new Map(prev); m.set(itemId, entry); return m })
  }

  // ── Create order on first send (deferred — keeps table Available until items ordered) ──
  const createOrderIfNeeded = async (): Promise<string | null> => {
    if (orderId) return orderId
    if (!restaurantId) return null
    const { data: newOrder, error } = await supabase
      .from('orders')
      .insert({ restaurant_id: restaurantId, table_number: parseInt(table), guests, status: 'active', total: 0 })
      .select('id').single()
    if (error || !newOrder) { setSendError(error?.message ?? 'Failed to open table'); return null }
    await assignOrderNumber(supabase, restaurantId, newOrder.id)
    setOrderId(newOrder.id)
    return newOrder.id
  }

  // ── Send to kitchen ───────────────────────────────────────
  const handleSend = async () => {
    if (draft.size === 0) return
    setSending(true); setSendError(null)

    const oid = await createOrderIfNeeded()
    if (!oid) { setSending(false); return }

    const rows = Array.from(draft.entries()).map(([menuId, entry]) => {
      const item = menuItems.find(m => m.id === menuId)!
      const modNames  = entry.selectedOptions.map(o => o.option_name)
      const noteTexts = entry.selectedNoteIds
        .map(id => kitchenNotes.find(n => n.id === id)?.text)
        .filter(Boolean) as string[]
      if (entry.customNote.trim()) noteTexts.push(entry.customNote.trim())
      const modPrice = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
      const allParts = [...modNames, ...noteTexts]
      return {
        order_id:   oid,
        item_name:  item.name,
        item_price: Number(item.price) + modPrice,
        qty:        entry.qty,
        status:     'sent',
        sent_at:    new Date().toISOString(),
        note:       allParts.length > 0 ? allParts.join(' · ') : null,
        station_id: item.category_id ? (catStationMap.get(item.category_id) ?? null) : null,
      }
    })

    const { data: inserted, error } = await supabase
      .from('order_items').insert(rows).select('id,item_name,item_price,qty,status,note')

    if (error) {
      setSendError(error.message)
    } else if (inserted) {
      const newItems = inserted as DbOrderItem[]
      setDbItems(prev => {
        const merged = [...prev]
        newItems.forEach(ni => {
          const ex = merged.find(m => m.item_name === ni.item_name && m.item_price === ni.item_price && m.status === 'sent' && !ni.note && !m.note)
          ex ? (ex.qty += ni.qty) : merged.push(ni)
        })
        return merged
      })
      const allItems = [...dbItems, ...newItems]
      const total = allItems.reduce((s, i) => s + i.item_price * i.qty, 0)
      await supabase.from('orders').update({ total, updated_at: new Date().toISOString() }).eq('id', oid)
      setDraft(new Map())
      setActiveTab('ordered')
    }
    setSending(false)
  }

  // ── Void ──────────────────────────────────────────────────
  const voidItem = async (itemId: string, reason: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const voidedBy = user?.user_metadata?.full_name ?? user?.email ?? 'Staff'
    await supabase.from('order_items').update({ status: 'void', void_reason: reason, voided_by: voidedBy }).eq('id', itemId)
    setDbItems(prev => prev.filter(i => i.id !== itemId))
  }

  // ── Derived ───────────────────────────────────────────────
  const visible      = menuItems.filter(m => !activeCategory || m.category_id === activeCategory)
  const sentItems    = dbItems.filter(i => i.status === 'sent' || i.status === 'cooking' || i.status === 'ready')
  const draftEntries = Array.from(draft.entries())
    .map(([id, entry]) => ({ item: menuItems.find(m => m.id === id)!, entry }))
    .filter(o => o.item)

  const draftTotal = draftEntries.reduce((s, o) => {
    const modPrice = o.entry.selectedOptions.reduce((m, opt) => m + opt.price, 0)
    return s + (Number(o.item.price) + modPrice) * o.entry.qty
  }, 0)
  const sentTotal  = sentItems.reduce((s, i) => s + i.item_price * i.qty, 0)
  const grandTotal = draftTotal + sentTotal
  const draftQty   = (id: string) => draft.get(id)?.qty ?? 0

  // ── Loading / error ───────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#060810]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        <p className="text-sm text-white/40">Opening table {table}…</p>
      </div>
    </div>
  )

  if (initError) return (
    <div className="flex items-center justify-center h-screen bg-[#060810] p-6">
      <div className="max-w-sm w-full p-5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400" />
        <p className="text-sm text-rose-400 font-semibold">Failed to open order</p>
        <p className="text-xs text-white/40">{initError}</p>
        <button onClick={init} className="mt-1 px-4 py-2 rounded-xl bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-[#060810] overflow-hidden">

      {/* ── Top bar ── */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#060810]/80 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all touch-manipulation">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Table {table}</span>
              {guests > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/8 border border-white/12">
                  <Users className="w-3 h-3 text-white/40" />
                  <span className="text-xs text-white/50">{guests}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-white/25 mt-0.5">Dine In · #{orderId?.slice(-6).toUpperCase()}</p>
          </div>
        </div>
        {grandTotal > 0 && (
          <div className="px-4 py-2 rounded-xl bg-amber-500/12 border border-amber-500/20">
            <span className="text-sm font-bold text-amber-400 tabular-nums">{formatPrice(grandTotal)}</span>
          </div>
        )}
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Order panel ── */}
        <div className="w-80 xl:w-96 shrink-0 flex flex-col border-r border-white/8 bg-white/[0.01]">

          {/* Tabs */}
          <div className="shrink-0 flex border-b border-white/8">
            {(['ordering', 'ordered'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn('flex-1 py-3.5 text-xs font-bold uppercase tracking-wider transition-all relative touch-manipulation',
                  activeTab === tab ? 'text-amber-400' : 'text-white/25 hover:text-white/45')}>
                <span className="flex items-center justify-center gap-1.5">
                  {tab === 'ordering' ? 'Ordering' : 'Ordered'}
                  {tab === 'ordering' && draft.size > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold tabular-nums">
                      {draftEntries.reduce((s, o) => s + o.entry.qty, 0)}
                    </span>
                  )}
                  {tab === 'ordered' && sentItems.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold tabular-nums">
                      {sentItems.reduce((s, i) => s + i.qty, 0)}
                    </span>
                  )}
                </span>
                {activeTab === tab && <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-amber-500 rounded-full" />}
              </button>
            ))}
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'ordering' ? (
              draftEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 pb-10">
                  <div className="w-16 h-16 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                    <ShoppingBag className="w-7 h-7 text-white/15" />
                  </div>
                  <p className="text-sm text-white/25">No items yet</p>
                  <p className="text-xs text-white/15">Tap items from the menu</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {draftEntries.map(({ item, entry }) => (
                    <DraftRow
                      key={item.id}
                      item={item}
                      entry={entry}
                      onQty={d => draftChange(item.id, d)}
                      onRemove={() => draftChange(item.id, -entry.qty)}
                      onEdit={() => setEditingId(item.id)}
                      formatPrice={formatPrice}
                    />
                  ))}
                </div>
              )
            ) : (
              sentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 pb-10">
                  <div className="w-16 h-16 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                    <ChefHat className="w-7 h-7 text-white/15" />
                  </div>
                  <p className="text-sm text-white/25">Nothing sent to kitchen</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {sentItems.map(i => <SentRow key={i.id} item={i} onAction={() => setActionItem(i)} formatPrice={formatPrice} />)}
                </div>
              )
            )}
          </div>

          {/* Subtotal strip */}
          {activeTab === 'ordering' && draftEntries.length > 0 && (
            <div className="shrink-0 px-4 py-3 border-t border-white/8 flex items-center justify-between">
              <span className="text-xs text-white/30">{draftEntries.reduce((s, o) => s + o.entry.qty, 0)} items</span>
              <span className="text-sm font-bold text-white/60 tabular-nums">{formatPrice(draftTotal)}</span>
            </div>
          )}
          {activeTab === 'ordered' && sentItems.length > 0 && (
            <div className="shrink-0 px-4 py-3 border-t border-white/8 flex items-center justify-between">
              <span className="text-xs text-white/30">
                {sentItems.filter(i => i.status === 'ready').length > 0
                  ? `${sentItems.filter(i => i.status === 'ready').length} ready · `
                  : ''}
                {sentItems.filter(i => i.status === 'cooking').length > 0
                  ? `${sentItems.filter(i => i.status === 'cooking').length} cooking · `
                  : ''}
                {sentItems.filter(i => i.status === 'sent').length} in queue
              </span>
              <span className="text-sm font-bold text-white/60 tabular-nums">{formatPrice(sentTotal)}</span>
            </div>
          )}
        </div>

        {/* ── Right: Menu panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Category scroll */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-white/8" style={{ scrollbarWidth: 'none' }}>
            {categories.length === 0
              ? <p className="text-xs text-white/25 italic">No categories — add in Settings → Menu → Category</p>
              : categories.map(cat => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                  className={cn('shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 touch-manipulation whitespace-nowrap',
                    activeCategory === cat.id ? 'text-white shadow-lg' : 'bg-white/5 border border-white/8 text-white/45 hover:bg-white/10 hover:text-white/70')}
                  style={activeCategory === cat.id ? { backgroundColor: cat.color, boxShadow: `0 4px 14px ${cat.color}40` } : {}}>
                  {cat.name}
                </button>
              ))
            }
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <p className="text-sm text-white/25">No items in this category</p>
                <p className="text-xs text-white/15">Add items in Settings → Menu → Item</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
                {visible.map(item => {
                  const qty = draftQty(item.id)
                  return (
                    <button key={item.id} onClick={() => draftAdd(item)}
                      className={cn(
                        'relative rounded-2xl border overflow-hidden text-left',
                        'transition-all duration-150 active:scale-95 touch-manipulation',
                        qty > 0
                          ? 'border-amber-500/50 shadow-xl shadow-amber-500/15 ring-1 ring-amber-500/25'
                          : 'border-white/8 hover:border-white/20 hover:shadow-lg hover:shadow-black/30'
                      )}
                      style={{ aspectRatio: '3/2' }}>

                      {/* Background: image or gradient placeholder */}
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-white/3 to-transparent flex items-center justify-center">
                          <span className="text-5xl opacity-15 select-none">🍽</span>
                        </div>
                      )}

                      {/* Dark overlay for text readability */}
                      <div className="absolute inset-0 bg-black/45" />

                      {/* Amber tint when selected */}
                      {qty > 0 && <div className="absolute inset-0 bg-amber-500/10" />}

                      {/* Qty badge */}
                      {qty > 0 && (
                        <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center shadow-lg shadow-amber-500/50 tabular-nums z-10">
                          {qty}
                        </span>
                      )}

                      {/* Center label */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-3 z-10">
                        <p className={cn('text-3xl font-bold leading-tight line-clamp-2 text-center drop-shadow-lg', qty > 0 ? 'text-white' : 'text-white/90')}>
                          {item.name}
                        </p>
                        <p className={cn('text-3xl font-extrabold tabular-nums mt-1 drop-shadow-lg', qty > 0 ? 'text-amber-400' : 'text-amber-300/80')}>
                          {formatPrice(Number(item.price))}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="shrink-0 border-t border-white/8 bg-[#060810]/90 backdrop-blur-2xl px-4 py-3">
        {sendError && (
          <p className="text-xs text-rose-400 font-mono mb-2 px-1 break-all">Send failed: {sendError}</p>
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-white/25">Table {table}{guests > 0 ? ` · ${guests} guests` : ''}</p>
            <p className="text-base font-bold text-white tabular-nums">
              Total&nbsp;<span className={grandTotal > 0 ? 'text-amber-400' : 'text-white/30'}>{formatPrice(grandTotal)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            {grandTotal > 0 && (
              <button onClick={() => setShowPayment(true)}
                className="flex items-center gap-2 px-5 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-sm font-semibold active:scale-95 transition-all touch-manipulation">
                <CreditCard className="w-4 h-4" />Pay
              </button>
            )}
            <button onClick={handleSend} disabled={draft.size === 0 || sending}
              className={cn('flex items-center gap-2 px-6 h-12 rounded-xl text-sm font-bold transition-all active:scale-95 touch-manipulation',
                draft.size > 0 && !sending ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30' : 'bg-white/5 border border-white/8 text-white/20 cursor-not-allowed')}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send to Kitchen'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Ordered item action modal ── */}
      {actionItem && (
        <OrderedItemModal
          item={actionItem}
          restaurantId={restaurantId!}
          currentTable={table}
          supabase={supabase}
          formatPrice={formatPrice}
          onVoid={(reason: string) => { voidItem(actionItem.id, reason); setActionItem(null) }}
          onPriceChange={(newPrice: number) => {
            supabase.from('order_items').update({ item_price: newPrice, updated_at: new Date().toISOString() }).eq('id', actionItem.id).then(() => {
              setDbItems(prev => prev.map(i => i.id === actionItem.id ? { ...i, item_price: newPrice } : i))
              setActionItem(null)
            })
          }}
          onDiscount={(discountedPrice: number) => {
            supabase.from('order_items').update({ item_price: discountedPrice, updated_at: new Date().toISOString() }).eq('id', actionItem.id).then(() => {
              setDbItems(prev => prev.map(i => i.id === actionItem.id ? { ...i, item_price: discountedPrice } : i))
              setActionItem(null)
            })
          }}
          onTransferred={() => { setDbItems(prev => prev.filter(i => i.id !== actionItem.id)); setActionItem(null) }}
          onClose={() => setActionItem(null)}
        />
      )}

      {/* ── Item customize modal ── */}
      {editingId && (() => {
        const item  = menuItems.find(m => m.id === editingId)
        const entry = draft.get(editingId)
        if (!item || !entry) return null
        const capturedId = editingId
        return (
          <ItemModal
            item={item}
            entry={entry}
            kitchenNotes={kitchenNotes}
            supabase={supabase}
            formatPrice={formatPrice}
            sending={sending}
            onConfirm={e => { draftSet(capturedId, e); setEditingId(null) }}
            onConfirmAndSend={async (e) => {
              setSending(true); setSendError(null)
              const oid = await createOrderIfNeeded()
              if (!oid) { setSending(false); return }
              const modNames  = e.selectedOptions.map(o => o.option_name)
              const noteTexts = e.selectedNoteIds
                .map(id => kitchenNotes.find(n => n.id === id)?.text)
                .filter(Boolean) as string[]
              if (e.customNote.trim()) noteTexts.push(e.customNote.trim())
              const modPrice  = e.selectedOptions.reduce((s, o) => s + o.price, 0)
              const allParts  = [...modNames, ...noteTexts]
              const row = {
                order_id:   oid,
                item_name:  item.name,
                item_price: Number(item.price) + modPrice,
                qty:        e.qty,
                status:     'sent',
                sent_at:    new Date().toISOString(),
                note:       allParts.length > 0 ? allParts.join(' · ') : null,
                station_id: item.category_id ? (catStationMap.get(item.category_id) ?? null) : null,
              }
              const { data: inserted, error } = await supabase
                .from('order_items').insert([row]).select('id,item_name,item_price,qty,status,note')
              if (error) {
                setSendError(error.message)
              } else if (inserted) {
                const newItems = inserted as DbOrderItem[]
                setDbItems(prev => [...prev, ...newItems])
                const allItems = [...dbItems, ...newItems]
                const total = allItems.reduce((s, i) => s + i.item_price * i.qty, 0)
                await supabase.from('orders').update({ total, updated_at: new Date().toISOString() }).eq('id', oid)
                setDraft(prev => { const m = new Map(prev); m.delete(capturedId); return m })
                setActiveTab('ordered')
              }
              setSending(false)
              setEditingId(null)
            }}
            onClose={() => setEditingId(null)}
          />
        )
      })()}

      {showPayment && orderId && restaurantId && (
        <PaymentScreen
          orderId={orderId}
          restaurantId={restaurantId}
          tableNum={table}
          guests={guests}
          items={sentItems.map(i => ({ name: i.item_name, price: i.item_price, qty: i.qty }))}
          total={grandTotal}
          onClose={() => setShowPayment(false)}
          onPaid={() => { window.location.href = '/dashboard' }}
        />
      )}
    </div>
  )
}

// ── Draft row ─────────────────────────────────────────────────
function DraftRow({ item, entry, onQty, onRemove, onEdit, formatPrice }: {
  item: DbMenuItem
  entry: DraftEntry
  onQty: (d: number) => void
  onRemove: () => void
  onEdit: () => void
  formatPrice: (n: number) => string
}) {
  const modPrice = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
  const lineTotal = (Number(item.price) + modPrice) * entry.qty
  const hasExtras = entry.selectedOptions.length > 0 || entry.customNote || entry.selectedNoteIds.length > 0

  return (
    <div className="rounded-xl border bg-white/4 border-white/8 overflow-hidden">
      {/* Top row: name + qty controls */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Whole name/price area → opens customize modal */}
        <button onClick={onEdit} className="flex-1 min-w-0 text-left touch-manipulation group">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-white/85 truncate leading-tight">{item.name}</p>
            <Pencil className="w-3 h-3 text-white/20 group-hover:text-amber-400/60 transition-colors shrink-0" />
          </div>
          <p className="text-xs text-amber-400/80 tabular-nums mt-0.5">
            {formatPrice(lineTotal)}
            {modPrice > 0 && <span className="text-white/30 ml-1">(+{formatPrice(modPrice * entry.qty)} mods)</span>}
          </p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onRemove} className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400/60 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <X className="w-3 h-3" />
          </button>
          <button onClick={() => onQty(-1)} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/45 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center text-sm font-bold text-white tabular-nums">{entry.qty}</span>
          <button onClick={() => onQty(1)} className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center active:scale-90 transition-all touch-manipulation">
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Extras strip */}
      {hasExtras ? (
        <button onClick={onEdit} className="w-full px-3 pb-2.5 space-y-1.5 text-left touch-manipulation">
          {entry.selectedOptions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.selectedOptions.map(o => (
                <span key={o.option_id} className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/15 text-amber-400/70">
                  {o.option_name}{o.price > 0 ? ` +${formatPrice(o.price)}` : ''}
                </span>
              ))}
            </div>
          )}
          {(entry.selectedNoteIds.length > 0 || entry.customNote) && (
            <p className="text-[11px] text-cyan-400/60 italic leading-tight">
              📝 {[...entry.selectedNoteIds.map(() => '•'), entry.customNote].filter(Boolean).join(' ')}
            </p>
          )}
        </button>
      ) : (
        <button onClick={onEdit} className="w-full px-3 pb-2 text-left touch-manipulation">
          <p className="text-[10px] text-white/20 hover:text-amber-400/50 transition-colors">Tap to add notes & modifiers…</p>
        </button>
      )}
    </div>
  )
}

// ── Sent row ──────────────────────────────────────────────────
function SentRow({ item, onAction, formatPrice }: { item: DbOrderItem; onAction: () => void; formatPrice: (n: number) => string }) {
  const statusCfg = item.status === 'ready'
    ? { bg: 'bg-emerald-500/8',  border: 'border-emerald-500/25', badge: 'bg-emerald-500/20 text-emerald-400', label: 'Ready' }
    : item.status === 'cooking'
    ? { bg: 'bg-blue-500/8',     border: 'border-blue-500/20',    badge: 'bg-blue-500/20 text-blue-400', label: 'Cooking' }
    : { bg: 'bg-white/4',        border: 'border-white/8',        badge: 'bg-white/8 text-white/35',     label: 'Sent' }

  return (
    <button onClick={onAction} className={cn('w-full rounded-xl border overflow-hidden text-left transition-all active:scale-[0.99] touch-manipulation', statusCfg.bg, statusCfg.border)}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/85 truncate leading-tight">{item.item_name}</p>
          <p className="text-xs text-white/40 tabular-nums mt-0.5">{formatPrice(item.item_price * item.qty)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-white/40 tabular-nums">×{item.qty}</span>
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md', statusCfg.badge)}>{statusCfg.label}</span>
          <ChevronRight className="w-3.5 h-3.5 text-white/20" />
        </div>
      </div>
      {item.note && (
        <p className="px-3 pb-2 text-[11px] text-cyan-400/60 italic leading-tight">📝 {item.note}</p>
      )}
    </button>
  )
}

// ── Ordered item action modal ─────────────────────────────────
function OrderedItemModal({ item, restaurantId, currentTable, supabase, formatPrice, onVoid, onPriceChange, onDiscount, onTransferred, onClose }: {
  item: DbOrderItem
  restaurantId: string
  currentTable: string
  supabase: ReturnType<typeof createClient>
  formatPrice: (n: number) => string
  onVoid: (reason: string) => void
  onPriceChange: (p: number) => void
  onDiscount: (p: number) => void
  onTransferred: () => void
  onClose: () => void
}) {
  type View = 'menu' | 'void' | 'discount' | 'transfer' | 'price'
  const [view, setView]               = useState<View>('menu')
  const [discountType, setDiscountType] = useState<'pct' | 'fixed'>('pct')
  const [discountVal, setDiscountVal] = useState('')
  const [newPrice, setNewPrice]       = useState(String(item.item_price))
  const [targetTable, setTargetTable] = useState('')
  const [working, setWorking]         = useState(false)
  const [err, setErr]                 = useState<string | null>(null)

  // void reason state
  const [voidReasons, setVoidReasons]       = useState<{ id: string; text: string }[]>([])
  const [loadingReasons, setLoadingReasons] = useState(false)
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null)
  const [customReason, setCustomReason]     = useState('')

  useEffect(() => {
    if (view !== 'void') return
    setLoadingReasons(true)
    supabase.from('void_reasons').select('id,text').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order')
      .then(({ data }) => { setVoidReasons((data ?? []) as { id: string; text: string }[]); setLoadingReasons(false) })
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  const voidReasonText = selectedReasonId
    ? (voidReasons.find(r => r.id === selectedReasonId)?.text ?? '')
    : customReason.trim()
  const canVoid = voidReasonText.length > 0

  const originalTotal = item.item_price * item.qty

  const discountedPrice = (() => {
    const v = parseFloat(discountVal) || 0
    if (discountType === 'pct') return Math.max(0, item.item_price - item.item_price * (v / 100))
    return Math.max(0, item.item_price - v / item.qty)
  })()

  const handleTransfer = async () => {
    const tbl = parseInt(targetTable)
    if (!tbl || tbl === parseInt(currentTable)) { setErr('Enter a different table number'); return }
    setWorking(true); setErr(null)
    // Find or create active order for target table
    const { data: existing } = await supabase
      .from('orders').select('id').eq('restaurant_id', restaurantId).eq('table_number', tbl).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    let targetOrderId = existing?.id
    if (!targetOrderId) {
      const { data: newOrder, error } = await supabase
        .from('orders').insert({ restaurant_id: restaurantId, table_number: tbl, status: 'active', total: 0 }).select('id').single()
      if (error) { setErr(error.message); setWorking(false); return }
      targetOrderId = newOrder.id
    }
    // Move the item
    const { error } = await supabase.from('order_items').update({ order_id: targetOrderId }).eq('id', item.id)
    if (error) { setErr(error.message); setWorking(false); return }

    // Get the source order id for this table
    const { data: srcOrder } = await supabase
      .from('orders').select('id').eq('restaurant_id', restaurantId).eq('table_number', parseInt(currentTable)).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (srcOrder?.id) {
      // Check remaining non-voided items on source order
      const { count } = await supabase
        .from('order_items').select('id', { count: 'exact', head: true })
        .eq('order_id', srcOrder.id).neq('status', 'void')
      // If no items left, close the source order so table becomes Available
      if ((count ?? 0) === 0) {
        await supabase.from('orders').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', srcOrder.id)
      }
    }

    setWorking(false)
    onTransferred()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#0d1220]/98 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/8">
          <div>
            <p className="text-base font-semibold text-white leading-tight">{item.item_name}</p>
            <p className="text-xs text-white/40 mt-0.5">×{item.qty} · <span className="text-emerald-400">{formatPrice(originalTotal)}</span></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {/* ── Main menu ── */}
          {view === 'menu' && (
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: 'void',     icon: <Trash2 className="w-6 h-6" />,         label: 'Void',     sub: 'Remove item',          color: 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/18' },
                { id: 'discount', icon: <Tag className="w-6 h-6" />,             label: 'Discount', sub: 'Apply item discount',   color: 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/18' },
                { id: 'transfer', icon: <ArrowRightLeft className="w-6 h-6" />,  label: 'Transfer', sub: 'Move to another table', color: 'border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/18' },
                { id: 'price',    icon: <DollarSign className="w-6 h-6" />,      label: 'Price',    sub: 'Change item price',     color: 'border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/18' },
              ] as const).map(a => (
                <button key={a.id} onClick={() => setView(a.id)}
                  className={cn('flex flex-col items-center justify-center gap-2 py-5 rounded-2xl border transition-all active:scale-95', a.color)}>
                  {a.icon}
                  <div className="text-center">
                    <p className="text-sm font-semibold">{a.label}</p>
                    <p className="text-[10px] opacity-60 mt-0.5">{a.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Void ── */}
          {view === 'void' && (
            <div className="space-y-4">
              <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">Select void reason <span className="text-rose-400">*</span></p>
              {loadingReasons ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-white/30 animate-spin" /></div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {voidReasons.map(r => (
                    <button key={r.id} onClick={() => { setSelectedReasonId(r.id); setCustomReason('') }}
                      className={cn('px-3 py-1.5 rounded-xl text-xs font-medium border transition-all active:scale-95',
                        selectedReasonId === r.id
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                          : 'bg-white/5 border-white/10 text-white/45 hover:bg-white/8 hover:text-white/70')}>
                      {r.text}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Or write custom reason</label>
                <input value={customReason} onChange={e => { setCustomReason(e.target.value); setSelectedReasonId(null) }}
                  placeholder="Custom reason…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/50 transition-colors" />
              </div>
              {!canVoid && <p className="text-xs text-rose-400/70">A void reason is required.</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('menu')} className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Back</button>
                <button onClick={() => canVoid && onVoid(voidReasonText)} disabled={!canVoid}
                  className="py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-400 text-sm font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                  Void Item
                </button>
              </div>
            </div>
          )}

          {/* ── Discount ── */}
          {view === 'discount' && (
            <div className="space-y-4">
              <div className="flex rounded-xl bg-white/5 p-1 gap-1">
                {(['pct', 'fixed'] as const).map(t => (
                  <button key={t} onClick={() => setDiscountType(t)}
                    className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all', discountType === t ? 'bg-amber-500 text-white' : 'text-white/40 hover:text-white/70')}>
                    {t === 'pct' ? 'Percentage %' : 'Fixed $'}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">{discountType === 'pct' ? 'Discount %' : 'Discount amount ($)'}</label>
                <input type="number" min="0" value={discountVal} onChange={e => setDiscountVal(e.target.value)} placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>
              {discountVal && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                  <span className="text-xs text-white/40">New price per item</span>
                  <span className="text-sm font-bold text-amber-400">{formatPrice(discountedPrice)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('menu')} className="py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium transition-all active:scale-95">Back</button>
                <button onClick={() => onDiscount(discountedPrice)} disabled={!discountVal}
                  className="py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition-all active:scale-95">Apply</button>
              </div>
            </div>
          )}

          {/* ── Transfer ── */}
          {view === 'transfer' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Target table number</label>
                <input type="number" min="1" value={targetTable} onChange={e => { setTargetTable(e.target.value); setErr(null) }} placeholder="e.g. 5"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              {err && <p className="text-xs text-rose-400">{err}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('menu')} className="py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium transition-all active:scale-95">Back</button>
                <button onClick={handleTransfer} disabled={!targetTable || working}
                  className="py-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2">
                  {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  Transfer
                </button>
              </div>
            </div>
          )}

          {/* ── Price ── */}
          {view === 'price' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">New price per item ($)</label>
                <input type="number" min="0" step="0.5" value={newPrice} onChange={e => setNewPrice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors" />
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                <span className="text-xs text-white/40">New line total</span>
                <span className="text-sm font-bold text-violet-400">{formatPrice((parseFloat(newPrice) || 0) * item.qty)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('menu')} className="py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium transition-all active:scale-95">Back</button>
                <button onClick={() => onPriceChange(parseFloat(newPrice) || 0)} disabled={!newPrice}
                  className="py-3 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-400 text-sm font-semibold transition-all active:scale-95">Save Price</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Item customize modal ──────────────────────────────────────
function ItemModal({ item, entry, kitchenNotes, supabase, formatPrice, sending, onConfirm, onConfirmAndSend, onClose }: {
  item: DbMenuItem
  entry: DraftEntry
  kitchenNotes: KitchenNote[]
  supabase: ReturnType<typeof createClient>
  formatPrice: (n: number) => string
  sending: boolean
  onConfirm: (e: DraftEntry) => void
  onConfirmAndSend: (e: DraftEntry) => void
  onClose: () => void
}) {
  const [local, setLocal]         = useState<DraftEntry>({ ...entry, selectedOptions: [...entry.selectedOptions] })
  const [modGroups, setModGroups] = useState<ModifierGroup[]>([])
  const [loadingMods, setLoadingMods] = useState(true)

  useEffect(() => {
    supabase
      .from('menu_item_modifiers')
      .select('menu_modifiers(id,name,required,min_select,max_select,modifier_options(id,name,price,sort_order))')
      .eq('item_id', item.id)
      .then(({ data }) => {
        if (data) {
          const groups: ModifierGroup[] = (data as any[])
            .map(row => row.menu_modifiers)
            .filter(Boolean)
            .map((mod: any) => ({
              id: mod.id,
              name: mod.name,
              required: mod.required,
              min_select: mod.min_select,
              max_select: mod.max_select,
              options: [...(mod.modifier_options ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order),
            }))
          setModGroups(groups)
        }
        setLoadingMods(false)
      })
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleNote = (id: string) =>
    setLocal(e => ({
      ...e,
      selectedNoteIds: e.selectedNoteIds.includes(id)
        ? e.selectedNoteIds.filter(n => n !== id)
        : [...e.selectedNoteIds, id],
    }))

  const toggleOption = (group: ModifierGroup, opt: { id: string; name: string; price: number }) =>
    setLocal(e => {
      const already = e.selectedOptions.find(o => o.option_id === opt.id)
      if (already) return { ...e, selectedOptions: e.selectedOptions.filter(o => o.option_id !== opt.id) }
      // radio-style if max_select === 1
      const filtered = group.max_select === 1
        ? e.selectedOptions.filter(o => o.modifier_id !== group.id)
        : [...e.selectedOptions]
      return {
        ...e,
        selectedOptions: [...filtered, { modifier_id: group.id, modifier_name: group.name, option_id: opt.id, option_name: opt.name, price: opt.price }],
      }
    })

  const modPrice     = local.selectedOptions.reduce((s, o) => s + o.price, 0)
  const effectivePrice = Number(item.price) + modPrice

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d1220]/98 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">

        {/* Hero image header */}
        {item.image_url ? (
          <div className="shrink-0 relative h-44 overflow-hidden">
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1220]/90 via-[#0d1220]/30 to-transparent" />
            <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all active:scale-95">
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-3 left-5">
              <h2 className="text-lg font-bold text-white drop-shadow-lg">{item.name}</h2>
              <p className="text-sm font-semibold text-amber-400 tabular-nums mt-0.5">{formatPrice(effectivePrice)} each</p>
            </div>
          </div>
        ) : (
          <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
            <div>
              <h2 className="text-base font-semibold text-white">{item.name}</h2>
              <p className="text-sm text-amber-400 tabular-nums mt-0.5">{formatPrice(effectivePrice)} each</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Qty */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60 font-medium">Quantity</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setLocal(e => ({ ...e, qty: Math.max(1, e.qty - 1) }))}
                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/50 flex items-center justify-center active:scale-90 transition-all">
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-base font-bold text-white tabular-nums">{local.qty}</span>
              <button onClick={() => setLocal(e => ({ ...e, qty: e.qty + 1 }))}
                className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center active:scale-90 transition-all">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Kitchen Notes */}
          {kitchenNotes.length > 0 && (
            <div>
              <p className="text-xs text-white/40 font-semibold mb-2.5 uppercase tracking-wider">Kitchen Notes</p>
              <div className="flex flex-wrap gap-2">
                {kitchenNotes.map(note => (
                  <button key={note.id} onClick={() => toggleNote(note.id)}
                    className={cn('px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 border',
                      local.selectedNoteIds.includes(note.id)
                        ? 'bg-cyan-500/20 border-cyan-500/35 text-cyan-300'
                        : 'bg-white/5 border-white/10 text-white/45 hover:bg-white/8')}>
                    {note.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom note */}
          <div>
            <p className="text-xs text-white/40 font-semibold mb-2 uppercase tracking-wider">Custom Note</p>
            <input
              value={local.customNote}
              onChange={e => setLocal(en => ({ ...en, customNote: e.target.value }))}
              placeholder="e.g. No onions, well done…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          {/* Modifiers */}
          {loadingMods ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
          ) : modGroups.map(group => (
            <div key={group.id}>
              <div className="flex items-center gap-2 mb-2.5">
                <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">{group.name}</p>
                {group.required && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/20">Required</span>}
                <span className="text-[10px] text-white/25">{group.max_select === 1 ? 'Pick 1' : `Up to ${group.max_select}`}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.options.map(opt => {
                  const selected = local.selectedOptions.some(o => o.option_id === opt.id)
                  return (
                    <button key={opt.id} onClick={() => toggleOption(group, opt)}
                      className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all active:scale-95',
                        selected ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/8')}>
                      <span className="font-medium truncate">{opt.name}</span>
                      {opt.price > 0 && (
                        <span className={cn('text-xs tabular-nums shrink-0 ml-2', selected ? 'text-amber-400' : 'text-white/30')}>
                          +{formatPrice(Number(opt.price))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 pb-5 pt-4 border-t border-white/8 space-y-2">
          <button
            onClick={() => onConfirmAndSend(local)}
            disabled={sending}
            className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send to Kitchen · {formatPrice(effectivePrice * local.qty)}
          </button>
          <button
            onClick={() => onConfirm(local)}
            className="w-full py-2.5 rounded-2xl bg-white/6 hover:bg-white/10 border border-white/10 text-white/60 text-sm font-medium transition-all active:scale-95"
          >
            Save for Later
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrderPageWrapper() { return <Suspense><OrderPage /></Suspense> }
