'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ModuleGate } from '@/components/ModuleGate'
import { Check, X, RefreshCw, AlertCircle, ChefHat, Clock, Home } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/logAudit'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import { getStaffHome } from '@/lib/permissions/staffHome'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.55, ease: 'circOut' as const } },
}

const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08 } },
}

const CARD: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  show:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.45, ease: 'circOut' as const } },
  exit:   { opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.28, ease: 'easeIn' as const } },
}

interface PendingItem {
  id: string
  item_name: string
  item_price: number
  qty: number
  note: string | null
  created_at: string
}

interface PendingGroup {
  order_id: string
  table_seq: number
  table_label: string
  group_label: string | null
  items: PendingItem[]
  arrived_at: string
}

function TimeAgo({ dateStr }: { dateStr: string }) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
      if (diff < 60) setLabel(`${diff}s ago`)
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m ago`)
      else setLabel(`${Math.floor(diff / 3600)}h ago`)
    }
    calc()
    const t = setInterval(calc, 5000)
    return () => clearInterval(t)
  }, [dateStr])
  return <span>{label}</span>
}

export default function PendingOrdersPage() {
  const supabase = createClient()
  const router = useRouter()
  const { formatPrice } = useDefaultCurrency()
  const { can, isOwner, permissions, loading: permsLoading } = usePermissions()

  useEffect(() => {
    if (permsLoading || isOwner) return
    if (!can('takeout')) router.replace(getStaffHome(permissions))
  }, [permsLoading, isOwner, permissions, can, router])

  const [groups, setGroups]       = useState<PendingGroup[]>([])
  const [error, setError]         = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const loadRef = useRef<() => void>(() => {})

  const load = useCallback(async () => {
    const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
    if (!rest) { setError('Restaurant not found'); return }

    const [{ data: pendingData, error: pendingErr }, { data: tablesData }, { data: groupsData }] = await Promise.all([
      supabase
        .from('order_items')
        .select('id, item_name, item_price, qty, note, created_at, order_id, orders!inner(table_number, restaurant_id, source)')
        .eq('status', 'pending')
        .eq('orders.restaurant_id', rest.id)
        .neq('orders.source', 'delivery')
        .order('created_at', { ascending: true }),
      supabase
        .from('tables')
        .select('seq, table_number, group_id')
        .eq('restaurant_id', rest.id),
      supabase
        .from('table_groups')
        .select('id, name')
        .eq('restaurant_id', rest.id),
    ])

    if (pendingErr) { setError(pendingErr.message); return }

    // Build seq -> display label map and seq -> group_label map
    const labelMap = new Map<number, string>()
    const groupMap = new Map<number, string>()  // seq -> group name
    const groupNameById = new Map<string, string>()
    for (const g of (groupsData ?? [])) groupNameById.set(g.id, g.name)
    for (const t of (tablesData ?? [])) {
      labelMap.set(t.seq, t.table_number ?? String(t.seq))
      if (t.group_id) groupMap.set(t.seq, groupNameById.get(t.group_id) ?? '')
    }

    // Group by order_id — skip delivery orders
    const map = new Map<string, PendingGroup>()
    for (const row of (pendingData ?? []) as any[]) {
      if (row.orders?.source === 'delivery') continue
      const orderId = row.order_id
      const seq: number = row.orders.table_number
      if (!map.has(orderId)) {
        map.set(orderId, {
          order_id:    orderId,
          table_seq:   seq,
          table_label: labelMap.get(seq) ?? String(seq),
          group_label: groupMap.get(seq) ?? null,
          items:       [],
          arrived_at:  row.created_at,
        })
      }
      map.get(orderId)!.items.push({
        id:         row.id,
        item_name:  row.item_name,
        item_price: row.item_price,
        qty:        row.qty,
        note:       row.note,
        created_at: row.created_at,
      })
    }

    setGroups(Array.from(map.values()))
    setLastRefresh(new Date())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => {
    load()

    // Real-time: re-fetch when order_items are inserted or updated
    const channel = supabase
      .channel('pending-order-items')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' },
        () => loadRef.current())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_items' },
        () => loadRef.current())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rid = () => typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : ''

  const approveGroup = (group: PendingGroup) => {
    setGroups(prev => prev.filter(g => g.order_id !== group.order_id))
    const ids = group.items.map(i => i.id)
    supabase
      .from('order_items')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .in('id', ids)
      .then(({ error }) => {
        if (error) {
          setGroups(prev => [group, ...prev])
          alert('Error approving: ' + error.message)
        } else {
          const r = rid(); if (r) logAudit(r, 'pending_approved', { table: group.table_label, items_count: ids.length })
        }
      })
  }

  const declineGroup = (group: PendingGroup) => {
    setGroups(prev => prev.filter(g => g.order_id !== group.order_id))
    const ids = group.items.map(i => i.id)
    supabase
      .from('order_items')
      .update({ status: 'void', void_reason: 'Declined by staff' })
      .in('id', ids)
      .then(({ error }) => {
        if (error) {
          setGroups(prev => [group, ...prev])
          alert('Error declining: ' + error.message)
        } else {
          const r = rid(); if (r) logAudit(r, 'pending_declined', { table: group.table_label, items_count: ids.length })
        }
      })
  }

  const approveItem = (item: PendingItem, groupOrderId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.order_id !== groupOrderId) return g
      const remaining = g.items.filter(i => i.id !== item.id)
      return remaining.length === 0 ? null : { ...g, items: remaining }
    }).filter(Boolean) as PendingGroup[])

    supabase
      .from('order_items')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', item.id)
      .then(({ error }) => {
        if (error) {
          setGroups(prev => {
            const group = prev.find(g => g.order_id === groupOrderId)
            if (group) return prev.map(g => g.order_id === groupOrderId ? { ...g, items: [...g.items, item] } : g)
            return prev
          })
          alert('Error: ' + error.message)
        } else {
          const group = groups.find(g => g.order_id === groupOrderId)
          const r = rid(); if (r) logAudit(r, 'pending_approved', { table: group?.table_label, item_name: item.item_name, qty: item.qty })
        }
      })
  }

  const declineItem = (item: PendingItem, groupOrderId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.order_id !== groupOrderId) return g
      const remaining = g.items.filter(i => i.id !== item.id)
      return remaining.length === 0 ? null : { ...g, items: remaining }
    }).filter(Boolean) as PendingGroup[])

    supabase
      .from('order_items')
      .update({ status: 'void', void_reason: 'Declined by staff' })
      .eq('id', item.id)
      .then(({ error }) => {
        if (error) {
          setGroups(prev => {
            const group = prev.find(g => g.order_id === groupOrderId)
            if (group) return prev.map(g => g.order_id === groupOrderId ? { ...g, items: [...g.items, item] } : g)
            return prev
          })
          alert('Error: ' + error.message)
        } else {
          const group = groups.find(g => g.order_id === groupOrderId)
          const r = rid(); if (r) logAudit(r, 'pending_declined', { table: group?.table_label, item_name: item.item_name, qty: item.qty })
        }
      })
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--app-bg, #022658)' }}>
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-sm">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
          <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
          <button onClick={load} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 transition-all">Retry</button>
        </div>
      </div>
    </div>
  )

  return (
    <ModuleGate moduleKey="dine_in">
    <motion.div key="pending-orders-page" variants={PAGE} initial="hidden" animate="show" className="min-h-screen flex flex-col" style={{ background: 'var(--app-bg, #022658)' }}>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/8 backdrop-blur-2xl" style={{ background: 'var(--app-anchor-80, rgba(2,38,88,0.8))' }}>
        <div className="flex items-center justify-between px-5 py-4 max-w-2xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
            >
              <ChefHat className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">Pending Orders</h1>
                {groups.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold">
                    {groups.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/35 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Refreshed {lastRefresh.toLocaleTimeString(undefined, { timeStyle: 'short' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/dashboard')}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all">
              <Home className="w-4 h-4" />
            </button>
            <button onClick={() => load()}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-4">

        {groups.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'circOut' as const } }}
            className="flex flex-col items-center justify-center py-24 gap-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white/60">All caught up!</p>
              <p className="text-sm text-white/25 mt-1">No pending guest orders right now</p>
            </div>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
          <motion.div variants={CONTAINER} initial="hidden" animate="show" className="space-y-4">
          {groups.map(group => {
            const groupTotal = group.items.reduce((s, i) => s + i.item_price * i.qty, 0)

            return (
              <motion.div key={group.order_id} variants={CARD} exit="exit" layout className="rounded-2xl border border-amber-500/20 bg-amber-500/4 overflow-hidden">

                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-amber-500/8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                      <span className="text-sm font-bold text-amber-400">{group.table_label}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Table {group.table_label}</p>
                      <p className="text-xs text-white/35 flex items-center gap-1">
                        {group.group_label && (
                          <span className="text-amber-400/60 font-semibold">{group.group_label} · </span>
                        )}
                        <Clock className="w-3 h-3" />
                        <TimeAgo dateStr={group.arrived_at} />
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white/50">{formatPrice(groupTotal)}</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => declineGroup(group)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 text-xs font-semibold hover:bg-rose-500/25 active:scale-95 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                        Decline All
                      </button>
                      <button
                        onClick={() => approveGroup(group)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/30 active:scale-95 transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve All
                      </button>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="divide-y divide-white/5">
                  {group.items.map(item => {
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-amber-400/70 tabular-nums w-5">×{item.qty}</span>
                            <p className="text-sm font-medium text-white truncate">{item.item_name}</p>
                          </div>
                          {item.note && (
                            <p className="text-xs text-white/35 mt-0.5 ml-7 italic">"{item.note}"</p>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-white/60 tabular-nums shrink-0">
                          {formatPrice(item.item_price * item.qty)}
                        </span>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => declineItem(item, group.order_id)}
                            className="w-8 h-8 rounded-lg bg-rose-500/12 border border-rose-500/20 text-rose-400/70 flex items-center justify-center hover:bg-rose-500/20 active:scale-90 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => approveItem(item, group.order_id)}
                            className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/25 active:scale-90 transition-all"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

              </motion.div>
            )
          })}
          </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
    </ModuleGate>
  )
}
