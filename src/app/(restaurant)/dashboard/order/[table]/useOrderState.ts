'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { assignOrderNumber } from '@/lib/orderNumber'
import { printKitchenTicket } from '@/lib/printKitchenTicket'
import { logAudit } from '@/lib/logAudit'
import { sendPush } from '@/lib/push'
import { enqueueOrder, getQueueCount, syncAllQueued } from '@/lib/offlineQueue'
import type {
  DbCategory, DbMenuItem, KitchenNote, DraftEntry, DbOrderItem,
} from './types'

export function useOrderState(table: string, guestCount: number) {
  const supabase = createClient()

  // ── Restaurant / order identity ──────────────────────────────
  const [restaurantId, setRestaurantId]     = useState<string | null>(null)
  const [restaurantName, setRestaurantName] = useState<string>('')
  const [orderId, setOrderId]               = useState<string | null>(null)
  const [orderNum, setOrderNum]             = useState<string | null>(null)

  // ── Menu data ────────────────────────────────────────────────
  const [dbItems, setDbItems]             = useState<DbOrderItem[]>([])
  const [categories, setCategories]       = useState<DbCategory[]>([])
  const [menuItems, setMenuItems]         = useState<DbMenuItem[]>([])
  const [kitchenNotes, setKitchenNotes]   = useState<KitchenNote[]>([])
  const [catStationMap, setCatStationMap] = useState<Map<string, string>>(new Map())

  // ── Draft (items not yet sent) ───────────────────────────────
  const [draft, setDraft] = useState<Map<string, DraftEntry>>(new Map())

  // ── UI state owned by the hook ───────────────────────────────
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [activeTab, setActiveTab]           = useState<'ordering' | 'ordered'>('ordering')
  const [sending, setSending]               = useState(false)
  const [sendError, setSendError]           = useState<string | null>(null)
  const [loading, setLoading]               = useState(true)
  const [initError, setInitError]           = useState<string | null>(null)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [actionItem, setActionItem]         = useState<DbOrderItem | null>(null)
  const [showPayment, setShowPayment]       = useState(false)

  // ── Offline queue state ──────────────────────────────────────
  const [isOnline,    setIsOnline]    = useState(true)
  const [queueCount,  setQueueCount]  = useState(0)
  const [syncing,     setSyncing]     = useState(false)

  // Refs for use inside event handlers registered once at mount
  const showPaymentRef  = useRef(false)
  const restaurantIdRef = useRef<string | null>(null)
  const initRef         = useRef<() => Promise<void>>(() => Promise.resolve())
  useEffect(() => { showPaymentRef.current  = showPayment },  [showPayment])
  useEffect(() => { restaurantIdRef.current = restaurantId }, [restaurantId])

  // Browser back while payment modal open → close + broadcast idle
  useEffect(() => {
    const handler = () => {
      if (!showPaymentRef.current) return
      setShowPayment(false)
      const rid = restaurantIdRef.current
      if (rid) {
        supabase.channel(`cfd-sync-${rid}`)
          .send({ type: 'broadcast', event: 'table_change', payload: { table: 'idle' } })
          .catch(() => {})
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Online / offline detection + auto-sync ──────────────────
  useEffect(() => {
    setIsOnline(navigator.onLine)
    setQueueCount(getQueueCount())

    const onOnline = async () => {
      setIsOnline(true)
      const count = getQueueCount()
      if (count === 0) return
      setSyncing(true)
      await syncAllQueued(supabase)
      setQueueCount(getQueueCount())
      setSyncing(false)
      initRef.current()
    }
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Init ─────────────────────────────────────────────────────
  const init = useCallback(async () => {
    setLoading(true); setInitError(null)

    const rid = typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : ''
    if (!rid) { setInitError('Restaurant not found.'); setLoading(false); return }

    // All 6 queries fire in one parallel batch — no serial round-trips
    const [restRes, catsRes, itemsRes, notesRes, existingRes, stationCatRes] = await Promise.all([
      supabase.from('restaurants').select('id,name').eq('id', rid).maybeSingle(),
      supabase.from('menu_categories').select('id,name,color').eq('restaurant_id', rid).eq('active', true).order('sort_order'),
      supabase.from('menu_items').select('id,name,price,category_id,image_url').eq('restaurant_id', rid).eq('available', true).order('sort_order'),
      supabase.from('kitchen_notes').select('id,text').eq('restaurant_id', rid).eq('active', true).order('sort_order'),
      supabase.from('orders').select('id,order_num').eq('restaurant_id', rid).eq('table_number', parseInt(table)).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('kds_station_categories').select('station_id,category_id'),
    ])

    const rest = restRes.data
    if (!rest) { setInitError('Restaurant not found.'); setLoading(false); return }
    setRestaurantId(rest.id)
    setRestaurantName(rest.name ?? '')

    const cats  = (catsRes.data  ?? []) as DbCategory[]
    const items = (itemsRes.data ?? []) as DbMenuItem[]
    const notes = (notesRes.data ?? []) as KitchenNote[]
    setCategories(cats)
    setMenuItems(items)
    setKitchenNotes(notes)
    if (cats.length > 0) setActiveCategory(c => c || cats[0].id)

    const csMap = new Map<string, string>()
    for (const a of (stationCatRes.data ?? [])) csMap.set(a.category_id, a.station_id)
    setCatStationMap(csMap)

    const oid = existingRes.data?.id ?? null
    setOrderId(oid)
    setOrderNum((existingRes.data as { id: string; order_num?: string | null } | null)?.order_num ?? null)

    if (oid) {
      const { data: orderItems } = await supabase
        .from('order_items').select('id,item_name,item_price,qty,status,note')
        .eq('order_id', oid).neq('status', 'void').order('created_at')
      const loaded = (orderItems ?? []) as DbOrderItem[]
      setDbItems(loaded)
      if (loaded.length > 0) setActiveTab('ordered')
    }
    setLoading(false)
  }, [table, guestCount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { initRef.current = init }, [init])
  useEffect(() => { init() }, [init])

  // ── Realtime: KDS status updates ─────────────────────────────
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

  // ── Draft helpers ─────────────────────────────────────────────
  const draftAdd = (item: DbMenuItem) => {
    setDraft(prev => {
      const m  = new Map(prev)
      const ex = m.get(item.id)
      m.set(item.id, ex ? { ...ex, qty: ex.qty + 1 } : { qty: 1, selectedNoteIds: [], customNote: '', selectedOptions: [] })
      return m
    })
    setActiveTab('ordering')
  }

  const draftChange = (itemId: string, delta: number) => {
    setDraft(prev => {
      const m  = new Map(prev)
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

  // ── Create order on first send ────────────────────────────────
  const createOrderIfNeeded = async (): Promise<string | null> => {
    if (orderId) return orderId
    if (!restaurantId) return null
    const { data: newOrder, error } = await supabase
      .from('orders')
      .insert({ restaurant_id: restaurantId, table_number: parseInt(table), guests: guestCount, status: 'active', total: 0 })
      .select('id').single()
    if (error || !newOrder) { setSendError(error?.message ?? 'Failed to open table'); return null }
    const ordNum = await assignOrderNumber(supabase, restaurantId, newOrder.id)
    setOrderNum(ordNum)
    setOrderId(newOrder.id)
    return newOrder.id
  }

  // ── Update guest count in DB ──────────────────────────────────
  const updateGuestInDb = async (count: number) => {
    if (orderId) {
      await supabase.from('orders').update({ guests: count }).eq('id', orderId)
    }
  }

  // ── Manual queue sync ─────────────────────────────────────────
  const syncQueuedOrders = useCallback(async () => {
    if (!navigator.onLine || syncing) return
    setSyncing(true)
    await syncAllQueued(supabase)
    setQueueCount(getQueueCount())
    setSyncing(false)
    init()
  }, [syncing]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send all draft items to kitchen ──────────────────────────
  const handleSend = async () => {
    if (draft.size === 0) return
    setSending(true); setSendError(null)
    if (!restaurantId) { setSending(false); return }

    const now = new Date().toISOString()
    const baseRows = Array.from(draft.entries()).map(([menuId, entry]) => {
      const item      = menuItems.find(m => m.id === menuId)!
      const modNames  = entry.selectedOptions.map(o => o.option_name)
      const noteTexts = entry.selectedNoteIds
        .map(id => kitchenNotes.find(n => n.id === id)?.text)
        .filter(Boolean) as string[]
      if (entry.customNote.trim()) noteTexts.push(entry.customNote.trim())
      const modPrice = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
      const allParts = [...modNames, ...noteTexts]
      return {
        menu_item_id: menuId,
        item_name:    item.name,
        item_price:   Number(item.price) + modPrice,
        qty:          entry.qty,
        status:       'sent' as const,
        sent_at:      now,
        note:         allParts.length > 0 ? allParts.join(' · ') : null,
        station_id:   item.category_id ? (catStationMap.get(item.category_id) ?? null) : null,
      }
    })

    // ── Offline: save to queue, show locally ──────────────────
    if (!navigator.onLine) {
      enqueueOrder({
        restaurant_id: restaurantId,
        table_number:  parseInt(table),
        table_label:   table,
        guests:        guestCount,
        items: baseRows.map(r => ({
          menu_item_id: r.menu_item_id,
          item_name:    r.item_name,
          item_price:   r.item_price,
          qty:          r.qty,
          note:         r.note,
          station_id:   r.station_id,
        })),
        staff_id:   typeof window !== 'undefined' ? localStorage.getItem('pos_staff_id') : null,
        staff_name: typeof window !== 'undefined' ? localStorage.getItem('pos_staff_name') : null,
      })
      setDbItems(prev => [...prev, ...baseRows.map((r, i) => ({
        id:         `queued_${Date.now()}_${i}`,
        item_name:  r.item_name,
        item_price: r.item_price,
        qty:        r.qty,
        status:     'queued' as const,
        note:       r.note,
      }))])
      setDraft(new Map())
      setActiveTab('ordered')
      setQueueCount(getQueueCount())
      setSending(false)
      return
    }

    // ── Online: send to Supabase ──────────────────────────────
    const oid = await createOrderIfNeeded()
    if (!oid) { setSending(false); return }

    const rows = baseRows.map(r => ({ ...r, order_id: oid }))
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

      if (restaurantId) {
        logAudit(restaurantId, 'send_to_kitchen', {
          table,
          order_id:   oid,
          item_count: rows.length,
          items:      rows.map(r => ({ name: r.item_name, qty: r.qty })),
        })
        sendPush(restaurantId, 'kds')
        printKitchenTicket({
          restaurantId,
          tableNum: table,
          orderNum,
          items: rows.map(r => ({ name: r.item_name, qty: r.qty, note: r.note })),
        }).catch(() => {})
      }
    }
    setSending(false)
  }

  // ── Send a single item (from ItemModal "Send to Kitchen") ─────
  const sendSingleItem = async (
    menuItem: DbMenuItem,
    entry: DraftEntry,
  ): Promise<boolean> => {
    setSending(true); setSendError(null)
    if (!restaurantId) { setSending(false); return false }

    const modNames  = entry.selectedOptions.map(o => o.option_name)
    const noteTexts = entry.selectedNoteIds
      .map(id => kitchenNotes.find(n => n.id === id)?.text)
      .filter(Boolean) as string[]
    if (entry.customNote.trim()) noteTexts.push(entry.customNote.trim())
    const modPrice = entry.selectedOptions.reduce((s, o) => s + o.price, 0)
    const allParts = [...modNames, ...noteTexts]
    const now = new Date().toISOString()

    const baseRow = {
      menu_item_id: menuItem.id,
      item_name:    menuItem.name,
      item_price:   Number(menuItem.price) + modPrice,
      qty:          entry.qty,
      status:       'sent' as const,
      sent_at:      now,
      note:         allParts.length > 0 ? allParts.join(' · ') : null,
      station_id:   menuItem.category_id ? (catStationMap.get(menuItem.category_id) ?? null) : null,
    }

    // ── Offline: queue single item ────────────────────────────
    if (!navigator.onLine) {
      enqueueOrder({
        restaurant_id: restaurantId,
        table_number:  parseInt(table),
        table_label:   table,
        guests:        guestCount,
        items: [{
          menu_item_id: baseRow.menu_item_id,
          item_name:    baseRow.item_name,
          item_price:   baseRow.item_price,
          qty:          baseRow.qty,
          note:         baseRow.note,
          station_id:   baseRow.station_id,
        }],
        staff_id:   typeof window !== 'undefined' ? localStorage.getItem('pos_staff_id') : null,
        staff_name: typeof window !== 'undefined' ? localStorage.getItem('pos_staff_name') : null,
      })
      setDbItems(prev => [...prev, {
        id:         `queued_${Date.now()}_0`,
        item_name:  baseRow.item_name,
        item_price: baseRow.item_price,
        qty:        baseRow.qty,
        status:     'queued' as const,
        note:       baseRow.note,
      }])
      setDraft(prev => { const m = new Map(prev); m.delete(menuItem.id); return m })
      setActiveTab('ordered')
      setQueueCount(getQueueCount())
      setSending(false)
      return true
    }

    // ── Online: send to Supabase ──────────────────────────────
    const oid = await createOrderIfNeeded()
    if (!oid) { setSending(false); return false }

    const row = { ...baseRow, order_id: oid }
    const { data: inserted, error } = await supabase
      .from('order_items').insert([row]).select('id,item_name,item_price,qty,status,note')

    if (error) {
      setSendError(error.message)
      setSending(false)
      return false
    }
    if (inserted) {
      const newItems = inserted as DbOrderItem[]
      setDbItems(prev => [...prev, ...newItems])
      const allItems = [...dbItems, ...newItems]
      const total = allItems.reduce((s, i) => s + i.item_price * i.qty, 0)
      await supabase.from('orders').update({ total, updated_at: new Date().toISOString() }).eq('id', oid)
      setDraft(prev => { const m = new Map(prev); m.delete(menuItem.id); return m })
      setActiveTab('ordered')
      if (restaurantId) {
        sendPush(restaurantId, 'kds')
        logAudit(restaurantId, 'send_to_kitchen', {
          table,
          order_id:  oid,
          item_name: menuItem.name,
          qty:       entry.qty,
        })
      }
    }
    setSending(false)
    return true
  }

  // ── Void a sent item ─────────────────────────────────────────
  const voidItem = async (itemId: string, reason: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const voidedBy = user?.user_metadata?.full_name ?? user?.email ?? 'Staff'
    await supabase.from('order_items')
      .update({ status: 'void', void_reason: reason, voided_by: voidedBy })
      .eq('id', itemId)
    const remaining = dbItems.filter(i => i.id !== itemId)
    setDbItems(remaining)
    if (orderId && remaining.length === 0) {
      await supabase.from('orders')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', orderId)
    }
  }

  // ── Derived values ───────────────────────────────────────────
  const visible      = menuItems.filter(m => !activeCategory || m.category_id === activeCategory)
  const sentItems    = dbItems.filter(i => i.status === 'sent' || i.status === 'cooking' || i.status === 'ready' || i.status === 'queued')
  const draftEntries = Array.from(draft.entries())
    .map(([id, entry]) => ({ item: menuItems.find(m => m.id === id)!, entry }))
    .filter(o => o.item)
  const draftTotal = draftEntries.reduce((s, o) => {
    const modPrice = o.entry.selectedOptions.reduce((m, opt) => m + opt.price, 0)
    return s + (Number(o.item.price) + modPrice) * o.entry.qty
  }, 0)
  const sentTotal  = sentItems.filter(i => i.status !== 'queued').reduce((s, i) => s + i.item_price * i.qty, 0)
  const grandTotal = draftTotal + sentItems.reduce((s, i) => s + i.item_price * i.qty, 0)
  const draftQty   = (id: string) => draft.get(id)?.qty ?? 0

  return {
    supabase,
    // identity
    restaurantId, restaurantName, orderId, orderNum,
    // data
    dbItems, setDbItems,
    categories, menuItems, kitchenNotes,
    // draft
    draft, setDraft,
    // ui
    activeCategory, setActiveCategory,
    activeTab, setActiveTab,
    sending, setSending,
    sendError, setSendError,
    loading, initError, init,
    editingId, setEditingId,
    actionItem, setActionItem,
    showPayment, setShowPayment,
    // offline
    isOnline, queueCount, syncing, syncQueuedOrders,
    // derived
    visible, sentItems, draftEntries, draftTotal, sentTotal, grandTotal, draftQty,
    // actions
    draftAdd, draftChange, draftSet,
    handleSend, sendSingleItem, voidItem,
    createOrderIfNeeded, updateGuestInDb,
  }
}
