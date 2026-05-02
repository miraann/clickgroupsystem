'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Filter, RefreshCw, ChevronDown, ChevronUp, Clock, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import { getStaffHome } from '@/lib/permissions/staffHome'
import type { AuditAction } from '@/lib/logAudit'

interface AuditLog {
  id:            string
  staff_id:      string | null
  staff_name:    string | null
  staff_role:    string | null
  action:        AuditAction
  entity_id:     string | null
  metadata:      Record<string, unknown>
  created_at:    string
}

// ── Action config ────────────────────────────────────────────────
const ACTION_CONFIG: Record<AuditAction, { label: string; color: string; bg: string; dot: string }> = {
  // Generic CRUD
  add:              { label: 'Add',             color: 'text-emerald-400', bg: 'bg-emerald-500/12 border-emerald-500/25', dot: 'bg-emerald-400' },
  edit:             { label: 'Edit',            color: 'text-blue-400',    bg: 'bg-blue-500/12 border-blue-500/25',    dot: 'bg-blue-400'    },
  delete:           { label: 'Delete',          color: 'text-rose-400',    bg: 'bg-rose-500/12 border-rose-500/25',    dot: 'bg-rose-400'    },
  toggle:           { label: 'Toggle',          color: 'text-amber-400',   bg: 'bg-amber-500/12 border-amber-500/25',  dot: 'bg-amber-400'   },
  update_settings:  { label: 'Settings',        color: 'text-indigo-400',  bg: 'bg-indigo-500/12 border-indigo-500/25', dot: 'bg-indigo-400' },
  print:            { label: 'Print',           color: 'text-cyan-400',    bg: 'bg-cyan-500/12 border-cyan-500/25',    dot: 'bg-cyan-400'    },
  // Order-specific
  void_item:        { label: 'Void Item',       color: 'text-rose-400',    bg: 'bg-rose-500/12 border-rose-500/25',    dot: 'bg-rose-400'    },
  edit_price:       { label: 'Edit Price',      color: 'text-violet-400',  bg: 'bg-violet-500/12 border-violet-500/25', dot: 'bg-violet-400'  },
  apply_discount:   { label: 'Discount',        color: 'text-amber-400',   bg: 'bg-amber-500/12 border-amber-500/25',  dot: 'bg-amber-400'   },
  transfer_item:    { label: 'Transfer',        color: 'text-blue-400',    bg: 'bg-blue-500/12 border-blue-500/25',    dot: 'bg-blue-400'    },
  send_to_kitchen:  { label: 'Send to Kitchen', color: 'text-emerald-400', bg: 'bg-emerald-500/12 border-emerald-500/25', dot: 'bg-emerald-400' },
  payment:          { label: 'Payment',         color: 'text-green-300',   bg: 'bg-green-500/12 border-green-500/25',  dot: 'bg-green-300'   },
  print_bill:       { label: 'Print Bill',      color: 'text-cyan-400',    bg: 'bg-cyan-500/12 border-cyan-500/25',    dot: 'bg-cyan-400'    },
}

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)   return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

function MetaLine({ log, formatPrice }: { log: AuditLog; formatPrice: (n: number) => string }) {
  const m = log.metadata
  const parts: string[] = []

  if (m.table)        parts.push(`Table ${m.table}`)
  if (m.item_name)    parts.push(String(m.item_name))
  if (m.qty)          parts.push(`×${m.qty}`)
  if (m.reason)       parts.push(`"${m.reason}"`)
  if (m.old_price !== undefined && m.new_price !== undefined)
    parts.push(`${formatPrice(Number(m.old_price))} → ${formatPrice(Number(m.new_price))}`)
  if (m.discounted_price !== undefined && m.original_price !== undefined)
    parts.push(`${formatPrice(Number(m.original_price))} → ${formatPrice(Number(m.discounted_price))}`)
  if (m.from_table && m.to_table)
    parts.push(`T${m.from_table} → T${m.to_table}`)
  if (m.total !== undefined)
    parts.push(formatPrice(Number(m.total)))
  if (m.method)       parts.push(String(m.method))
  if (m.item_count)   parts.push(`${m.item_count} items`)

  return (
    <p className="text-xs text-white/40 mt-0.5 truncate">
      {parts.join(' · ')}
    </p>
  )
}

// ── Log row ───────────────────────────────────────────────────────
function LogRow({ log, formatPrice }: { log: AuditLog; formatPrice: (n: number) => string }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, color: 'text-white/50', bg: 'bg-white/5 border-white/10', dot: 'bg-white/40' }

  return (
    <div
      className={cn(
        'border border-white/8 rounded-2xl transition-all duration-200',
        expanded ? 'bg-white/4' : 'bg-white/[0.02] hover:bg-white/3',
      )}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-4 py-3.5 text-left"
      >
        {/* Staff avatar */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: log.staff_role === 'owner' ? '#b45309' : '#1e3a5f' }}
        >
          {initials(log.staff_name)}
        </div>

        {/* Middle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">
              {log.staff_name ?? 'Unknown'}
            </span>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', cfg.bg, cfg.color)}>
              {cfg.label}
            </span>
          </div>
          <MetaLine log={log} formatPrice={formatPrice} />
        </div>

        {/* Time + chevron */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-[11px] text-white/30">{relativeTime(log.created_at)}</span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-white/25" />
            : <ChevronDown className="w-3.5 h-3.5 text-white/25" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-white/6 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/3 rounded-xl px-3 py-2">
              <p className="text-white/30 mb-0.5">Staff role</p>
              <p className="text-white/70 font-medium capitalize">{log.staff_role ?? '—'}</p>
            </div>
            <div className="bg-white/3 rounded-xl px-3 py-2">
              <p className="text-white/30 mb-0.5">Time</p>
              <p className="text-white/70 font-medium">{new Date(log.created_at).toLocaleTimeString()}</p>
            </div>
          </div>
          <div className="bg-white/3 rounded-xl px-3 py-2.5">
            <p className="text-white/30 text-xs mb-1.5">Full details</p>
            <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all leading-relaxed font-mono">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </div>
          {log.entity_id && (
            <p className="text-[10px] text-white/20 font-mono px-1">ID: {log.entity_id}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
const PAGE_SIZE = 40
const ALL_ACTIONS: AuditAction[] = [
  'add', 'edit', 'delete', 'toggle', 'update_settings', 'print',
  'payment', 'void_item', 'send_to_kitchen', 'print_bill',
  'apply_discount', 'edit_price', 'transfer_item',
]

export default function AuditLogPage() {
  const router = useRouter()
  const { formatPrice } = useDefaultCurrency()
  const { can, isOwner, permissions, loading: permsLoading } = usePermissions()
  const supabase = createClient()

  useEffect(() => {
    if (permsLoading || isOwner) return
    if (!can('settings.audit_log')) router.replace(getStaffHome(permissions))
  }, [permsLoading, isOwner, permissions, can, router])

  const [logs,       setLogs]       = useState<AuditLog[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore,    setHasMore]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all')
  const [dateFilter, setDateFilter] = useState<'today' | '7d' | '30d' | 'all'>('today')
  const [live,       setLive]       = useState(false)
  const offsetRef      = useRef(0)
  const actionFilterRef = useRef<AuditAction | 'all'>('all')
  const dateFilterRef   = useRef<'today' | '7d' | '30d' | 'all'>('today')
  const searchRef       = useRef('')
  const restaurantId = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') ?? '' : ''

  // Keep refs in sync so the realtime callback always sees current filter values
  useEffect(() => { actionFilterRef.current = actionFilter }, [actionFilter])
  useEffect(() => { dateFilterRef.current   = dateFilter   }, [dateFilter])
  useEffect(() => { searchRef.current       = search       }, [search])

  // Supabase Realtime — single channel, filter matching done via refs
  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase
      .channel(`audit_logs:${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs', filter: `restaurant_id=eq.${restaurantId}` },
        payload => {
          const newLog = payload.new as AuditLog
          const matchesAction = actionFilterRef.current === 'all' || newLog.action === actionFilterRef.current
          const matchesSearch = !searchRef.current.trim() ||
            (newLog.staff_name ?? '').toLowerCase().includes(searchRef.current.trim().toLowerCase())
          let matchesDate = true
          const logTime = new Date(newLog.created_at).getTime()
          if (dateFilterRef.current === 'today') {
            const now = new Date()
            matchesDate = logTime >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
          } else if (dateFilterRef.current === '7d') {
            matchesDate = logTime >= Date.now() - 7 * 86400_000
          } else if (dateFilterRef.current === '30d') {
            matchesDate = logTime >= Date.now() - 30 * 86400_000
          }
          if (matchesAction && matchesSearch && matchesDate) {
            setLogs(prev => [newLog, ...prev])
          }
        },
      )
      .subscribe(status => setLive(status === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const buildQuery = useCallback((from: number) => {
    let q = supabase
      .from('audit_logs')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (actionFilter !== 'all') q = q.eq('action', actionFilter)

    const now = new Date()
    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      q = q.gte('created_at', start)
    } else if (dateFilter === '7d') {
      q = q.gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
    } else if (dateFilter === '30d') {
      q = q.gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
    }

    if (search.trim()) q = q.ilike('staff_name', `%${search.trim()}%`)

    return q
  }, [restaurantId, actionFilter, dateFilter, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true)
    offsetRef.current = 0
    const { data } = await buildQuery(0)
    const rows = (data ?? []) as AuditLog[]
    setLogs(rows)
    setHasMore(rows.length === PAGE_SIZE)
    offsetRef.current = rows.length
    setLoading(false)
  }, [buildQuery])

  useEffect(() => { load() }, [load])

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const { data } = await buildQuery(offsetRef.current)
    const rows = (data ?? []) as AuditLog[]
    setLogs(prev => [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
    offsetRef.current += rows.length
    setLoadingMore(false)
  }

  // Group logs by date
  const grouped = logs.reduce<Record<string, AuditLog[]>>((acc, log) => {
    const day = new Date(log.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    ;(acc[day] ??= []).push(log)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[#070e1a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#070e1a]/95 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 leading-none">
                <h1 className="text-sm font-bold text-white">Audit Log</h1>
                {live && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold text-emerald-400 uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/35 mt-0.5">Staff activity tracker</p>
            </div>
          </div>
          <button onClick={load}
            className={cn('w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95', loading && 'animate-spin')}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 pb-3 space-y-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by staff name…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>

          {/* Action + Date filters */}
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {/* Date */}
            {(['today', '7d', '30d', 'all'] as const).map(d => (
              <button key={d} onClick={() => setDateFilter(d)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95',
                  dateFilter === d
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-white/4 border-white/8 text-white/40 hover:text-white/70'
                )}>
                {d === 'today' ? 'Today' : d === '7d' ? '7 days' : d === '30d' ? '30 days' : 'All time'}
              </button>
            ))}

            <div className="w-px shrink-0 bg-white/8 mx-0.5" />

            {/* Action */}
            <button onClick={() => setActionFilter('all')}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95',
                actionFilter === 'all'
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/4 border-white/8 text-white/40 hover:text-white/70'
              )}>
              <Filter className="w-3 h-3" /> All actions
            </button>
            {ALL_ACTIONS.map(a => {
              const cfg = ACTION_CONFIG[a]
              return (
                <button key={a} onClick={() => setActionFilter(a)}
                  className={cn(
                    'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95',
                    actionFilter === a ? cn(cfg.bg, cfg.color) : 'bg-white/4 border-white/8 text-white/40 hover:text-white/70'
                  )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 max-w-3xl mx-auto space-y-6">
        {loading ? (
          <div className="space-y-2.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-white/4 animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
              <Clock className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-sm text-white/30">No activity found</p>
            <p className="text-xs text-white/20">Try changing the filters</p>
          </div>
        ) : (
          Object.entries(grouped).map(([day, dayLogs]) => (
            <div key={day}>
              <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2.5 px-1">{day}</p>
              <div className="space-y-2">
                {dayLogs.map(log => (
                  <LogRow key={log.id} log={log} formatPrice={formatPrice} />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Load more */}
        {!loading && hasMore && (
          <button onClick={loadMore} disabled={loadingMore}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/8 text-sm text-white/40 hover:text-white/70 hover:bg-white/8 transition-all active:scale-95 disabled:opacity-40">
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
