'use client'
import { useState, useEffect, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  ActivitySquare, Search, Filter, Download,
  RefreshCw, Loader2, ChevronDown, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────
interface AuditEntry {
  id:         string
  action:     string
  staff_name: string | null
  staff_role: string | null
  metadata:   Record<string, unknown>
  entity_id:  string | null
  created_at: string
}

// ── Animations ────────────────────────────────────────────────────
const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
}
const ITEM: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'circOut' as const } },
}

// ── Action config ─────────────────────────────────────────────────
const ACTION_CFG: Record<string, { emoji: string; label: string; color: string }> = {
  send_to_kitchen:    { emoji: '🍽️', label: 'Sent to Kitchen',    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  payment:            { emoji: '💰', label: 'Payment',            color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  pay_later:          { emoji: '🗒️', label: 'Pay Later',          color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  void_item:          { emoji: '❌', label: 'Void Item',          color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  edit_price:         { emoji: '✏️', label: 'Edit Price',         color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  apply_discount:     { emoji: '🏷️', label: 'Discount Applied',   color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  add:                { emoji: '📦', label: 'Add Item',           color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  edit:               { emoji: '✏️', label: 'Edit',               color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  delete:             { emoji: '🗑️', label: 'Delete',             color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  toggle:             { emoji: '🔄', label: 'Toggle',             color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  update_settings:    { emoji: '⚙️', label: 'Settings Updated',   color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  print:              { emoji: '🖨️', label: 'Print',              color: 'bg-slate-400/20 text-slate-300 border-slate-400/25' },
  print_bill:         { emoji: '🧾', label: 'Print Bill',         color: 'bg-slate-400/20 text-slate-300 border-slate-400/25' },
  transfer_item:      { emoji: '🔀', label: 'Transfer Item',      color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  kds_cooking:        { emoji: '🔥', label: 'KDS Cooking',        color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  kds_ready:          { emoji: '✅', label: 'KDS Ready',          color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  delivery_confirmed: { emoji: '📦', label: 'Delivery Confirmed', color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  delivery_out:       { emoji: '🚚', label: 'Out for Delivery',   color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  delivery_delivered: { emoji: '🎉', label: 'Delivered',          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  delivery_cancelled: { emoji: '🚫', label: 'Delivery Cancelled', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  pending_approved:   { emoji: '✅', label: 'Order Approved',     color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  pending_declined:   { emoji: '❌', label: 'Order Declined',     color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  guest_order:        { emoji: '📱', label: 'Guest QR Order',     color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  waiter_call:        { emoji: '🔔', label: 'Waiter Called',      color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  delivery_order:     { emoji: '🛵', label: 'Delivery Order',     color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
}

function getActionCfg(action: string) {
  return ACTION_CFG[action] ?? {
    emoji: '📋',
    label: action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'bg-white/8 text-white/50 border-white/10',
  }
}

// ── Avatar ────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-cyan-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500',
  'bg-rose-500',  'bg-sky-500',  'bg-orange-500',  'bg-teal-500',
]
function avatarColor(name: string | null) {
  if (!name) return 'bg-white/20'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('')
}

// ── Detail text ───────────────────────────────────────────────────
function buildDetail(action: string, meta: Record<string, unknown>): string {
  const m = meta as Record<string, string | number | unknown>
  switch (action) {
    case 'send_to_kitchen':
      if (Array.isArray(m.items) && m.items.length)
        return `Table ${m.table ?? '?'} — ${(m.items as {name:string;qty:number}[]).slice(0,3).map(i=>`${i.qty}× ${i.name}`).join(', ')}`
      return `Table ${m.table ?? '?'}${m.item_name ? ` — ${m.item_name}` : ''}`
    case 'payment':
      return `Table ${m.table ?? '?'}${m.method ? ` via ${m.method}` : ''}${m.total ? ` — ${m.total}` : ''}`
    case 'void_item':
      return `${m.item_name ?? 'Item'}${m.reason ? ` — Reason: ${m.reason}` : ''}`
    case 'edit_price':
      return `${m.item_name ?? 'Item'}${m.new_price !== undefined ? ` → ${m.new_price}` : ''}`
    case 'apply_discount':
      return `${m.item_name ?? 'Item'}${m.discounted_price !== undefined ? ` → ${m.discounted_price}` : ''}`
    case 'add':
      return `Added new ${m.entity ?? 'record'}${m.name ? `: ${m.name}` : ''}`
    case 'edit':
      return `Updated ${m.entity ?? 'record'}${m.name ? `: ${m.name}` : ''}`
    case 'delete':
      return `Deleted ${m.entity ?? 'record'}${m.name ? `: ${m.name}` : ''}`
    case 'toggle':
      return `Toggled ${m.entity ?? m.field ?? 'setting'}${m.value !== undefined ? ` → ${m.value}` : ''}`
    case 'update_settings':
      return `Updated ${m.section ?? 'settings'}${m.field ? `: ${m.field}` : ''}`
    case 'print': case 'print_bill':
      return `Printed ${m.type ?? 'bill'}${m.table ? ` for Table ${m.table}` : ''}`
    case 'transfer_item':
      return `${m.item_name ?? 'Item'} → Table ${m.to_table ?? '?'}`
    case 'pay_later':
      return `${m.customer ?? 'Customer'}${m.table ? ` — Table ${m.table}` : ''}${m.amount ? ` — ${m.amount}` : ''}`
    case 'kds_cooking': case 'kds_ready':
      return `Table ${m.table ?? '?'}${m.item_name ? ` — ${m.item_name}` : (m.items_count ? ` — ${m.items_count} items` : '')}`
    case 'delivery_confirmed': case 'delivery_out': case 'delivery_delivered': case 'delivery_cancelled':
      return `${m.customer ?? 'Customer'}${m.order_num ? ` #${m.order_num}` : ''}`
    case 'pending_approved': case 'pending_declined':
      return `Table ${m.table ?? '?'}${m.item_name ? ` — ${m.item_name}` : (m.items_count ? ` — ${m.items_count} items` : '')}`
    case 'guest_order':
      return `Table ${m.table ?? '?'}${m.table_name ? ` (${m.table_name})` : ''}${m.items ? ` — ${m.items}` : (m.items_count ? ` — ${m.items_count} items` : '')}`
    case 'waiter_call':
      return `Table ${m.table ?? '?'}${m.table_name ? ` (${m.table_name})` : ''} — Waiter requested`
    case 'delivery_order':
      return `${m.customer ?? 'Customer'}${m.phone ? ` · ${m.phone}` : ''}${m.items ? ` — ${m.items}` : (m.items_count ? ` — ${m.items_count} items` : '')}${m.address ? ` · ${m.address}` : ''}`
    default: {
      const parts: string[] = []
      if (m.table)     parts.push(`Table ${m.table}`)
      if (m.name)      parts.push(String(m.name))
      if (m.item_name) parts.push(String(m.item_name))
      if (m.entity)    parts.push(String(m.entity))
      return parts.join(' — ') || JSON.stringify(meta).slice(0, 80)
    }
  }
}

function formatTimeParts(iso: string) {
  const d = new Date(iso)
  return {
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
  }
}

const PAGE_SIZE = 50

// ── Page ──────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const supabase = useMemo(() => createClient(), [])

  const [entries,      setEntries]      = useState<AuditEntry[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [hasMore,      setHasMore]      = useState(false)
  const [offset,       setOffset]       = useState(0)
  const [search,       setSearch]       = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [staffFilter,  setStaffFilter]  = useState('all')
  const [staffNames,   setStaffNames]   = useState<string[]>([])
  const [allActions,   setAllActions]   = useState<string[]>([])

  const restaurantId = typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : ''

  const fetchEntries = async (reset = false) => {
    if (!restaurantId) return
    const start = reset ? 0 : offset
    reset ? setLoading(true) : setLoadingMore(true)

    let query = supabase
      .from('audit_logs')
      .select('id, action, staff_name, staff_role, metadata, entity_id, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1)

    if (actionFilter !== 'all') query = query.eq('action', actionFilter)
    if (staffFilter  !== 'all') query = query.eq('staff_name', staffFilter)

    const { data } = await query
    const rows = (data ?? []) as AuditEntry[]
    if (reset) { setEntries(rows); setOffset(PAGE_SIZE) }
    else       { setEntries(prev => [...prev, ...rows]); setOffset(start + PAGE_SIZE) }
    setHasMore(rows.length === PAGE_SIZE)
    reset ? setLoading(false) : setLoadingMore(false)
  }

  const fetchMeta = async () => {
    if (!restaurantId) return
    const { data } = await supabase
      .from('audit_logs').select('action, staff_name')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }).limit(500)
    if (!data) return
    setAllActions([...new Set(data.map(r => r.action).filter(Boolean))])
    setStaffNames([...new Set(data.map(r => r.staff_name).filter(Boolean) as string[])])
  }

  useEffect(() => { fetchMeta(); fetchEntries(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchEntries(true) }, [actionFilter, staffFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = search.trim()
    ? entries.filter(e => {
        const q = search.toLowerCase()
        return e.action.toLowerCase().includes(q)
          || (e.staff_name?.toLowerCase().includes(q) ?? false)
          || buildDetail(e.action, e.metadata).toLowerCase().includes(q)
      })
    : entries

  const exportCsv = async () => {
    if (!restaurantId) return
    let query = supabase
      .from('audit_logs')
      .select('id, action, staff_name, staff_role, metadata, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }).limit(5000)
    if (actionFilter !== 'all') query = query.eq('action', actionFilter)
    if (staffFilter  !== 'all') query = query.eq('staff_name', staffFilter)
    const { data } = await query
    if (!data?.length) return
    const header = 'Timestamp,Action,Staff,Role,Details\n'
    const rows = data.map(r => [
      `"${r.created_at}"`,
      `"${getActionCfg(r.action).label}"`,
      `"${r.staff_name ?? ''}"`,
      `"${r.staff_role ?? ''}"`,
      `"${buildDetail(r.action, r.metadata as Record<string,unknown>)}"`,
    ].join(','))
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <motion.div variants={CONTAINER} initial="hidden" animate="show" className="space-y-6 pb-10">

      {/* Header */}
      <motion.div variants={ITEM} className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center shrink-0">
          <ActivitySquare className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-white/40 mt-1">Complete trail of staff actions across your restaurant.</p>
        </div>
      </motion.div>

      <motion.div variants={ITEM} className="h-px bg-white/8" />

      {/* Toolbar */}
      <motion.div variants={ITEM} className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus-within:border-sky-500/40 transition-colors">
          <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search actions, staff, details…"
            className="bg-transparent text-sm text-white placeholder-white/25 outline-none flex-1"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="pl-7 pr-7 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 outline-none appearance-none cursor-pointer hover:bg-white/8 transition-colors">
            <option value="all">All actions</option>
            {allActions.map(a => <option key={a} value={a}>{getActionCfg(a).label}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        <div className="relative">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
            className="pl-7 pr-7 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 outline-none appearance-none cursor-pointer hover:bg-white/8 transition-colors">
            <option value="all">All staff</option>
            {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        <button onClick={() => fetchEntries(true)} disabled={loading}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/45 hover:bg-white/8 hover:text-white/70 transition-all disabled:opacity-50" title="Refresh">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>

        <button onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium hover:bg-sky-500/20 transition-all">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </motion.div>

      {/* Table */}
      <motion.div variants={ITEM} className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 680 }}>
            {/* Head */}
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 whitespace-nowrap w-[130px]">
                  ⏰ Time
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 whitespace-nowrap w-[180px]">
                  👤 User
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 whitespace-nowrap w-[170px]">
                  🎯 Action
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
                  ℹ️ Details
                </th>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="flex items-center justify-center gap-3 text-white/30">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Loading audit log…</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-white/25">
                      <ActivitySquare className="w-10 h-10 opacity-30" />
                      <p className="text-sm">No log entries found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((entry, idx) => {
                  const cfg    = getActionCfg(entry.action)
                  const detail = buildDetail(entry.action, entry.metadata)
                  const { time, date } = formatTimeParts(entry.created_at)

                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        'border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors',
                        idx % 2 === 0 ? '' : 'bg-white/[0.01]'
                      )}
                    >
                      {/* Time */}
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                        <p className="text-sm font-semibold text-white/85 tabular-nums">{time}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">{date}</p>
                      </td>

                      {/* User */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0',
                            avatarColor(entry.staff_name)
                          )}>
                            {initials(entry.staff_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white/85 truncate leading-tight">
                              {entry.staff_name ?? '—'}
                            </p>
                            {entry.staff_role && (
                              <p className="text-[10px] text-white/35 capitalize">{entry.staff_role}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 align-middle">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap',
                          cfg.color
                        )}>
                          <span>{cfg.emoji}</span>
                          {cfg.label}
                        </span>
                      </td>

                      {/* Details */}
                      <td className="px-4 py-3.5 align-middle">
                        <p className="text-sm text-white/55">{detail || '—'}</p>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Load more */}
        {hasMore && !loading && (
          <div className="px-4 py-3 border-t border-white/6 flex justify-center">
            <button
              onClick={() => fetchEntries(false)}
              disabled={loadingMore}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/45 text-sm hover:bg-white/8 hover:text-white/65 transition-all disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </motion.div>

      {!loading && filtered.length > 0 && (
        <motion.p variants={ITEM} className="text-center text-xs text-white/20">
          {filtered.length} entries{hasMore ? '+' : ''}
        </motion.p>
      )}

    </motion.div>
  )
}
