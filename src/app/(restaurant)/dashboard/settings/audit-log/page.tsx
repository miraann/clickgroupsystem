'use client'
import { useState, useEffect, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  ActivitySquare, Search, Filter, Download,
  RefreshCw, Loader2, ChevronDown, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'

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

// ── Action config — uses labelKey instead of hardcoded label ──────
const ACTION_CFG: Record<string, { emoji: string; labelKey: string; color: string }> = {
  send_to_kitchen:    { emoji: '🍽️', labelKey: 'al_act_sent_kitchen',  color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  payment:            { emoji: '💰', labelKey: 'al_act_payment',        color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  pay_later:          { emoji: '🗒️', labelKey: 'al_act_pay_later',      color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  void_item:          { emoji: '❌', labelKey: 'al_act_void_item',      color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  edit_price:         { emoji: '✏️', labelKey: 'al_act_edit_price',     color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  apply_discount:     { emoji: '🏷️', labelKey: 'al_act_discount',       color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  add:                { emoji: '📦', labelKey: 'al_act_add',            color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  edit:               { emoji: '✏️', labelKey: 'al_act_edit',           color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  delete:             { emoji: '🗑️', labelKey: 'al_act_delete',         color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  toggle:             { emoji: '🔄', labelKey: 'al_act_toggle',         color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  update_settings:    { emoji: '⚙️', labelKey: 'al_act_settings',       color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  print:              { emoji: '🖨️', labelKey: 'al_act_print',          color: 'bg-slate-400/20 text-slate-300 border-slate-400/25' },
  print_bill:         { emoji: '🧾', labelKey: 'al_act_print_bill',     color: 'bg-slate-400/20 text-slate-300 border-slate-400/25' },
  transfer_item:      { emoji: '🔀', labelKey: 'al_act_transfer',       color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  kds_cooking:        { emoji: '🔥', labelKey: 'al_act_kds_cooking',    color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  kds_ready:          { emoji: '✅', labelKey: 'al_act_kds_ready',      color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  delivery_confirmed: { emoji: '📦', labelKey: 'al_act_del_confirmed',  color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  delivery_out:       { emoji: '🚚', labelKey: 'al_act_del_out',        color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  delivery_delivered: { emoji: '🎉', labelKey: 'al_act_delivered',      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  delivery_cancelled: { emoji: '🚫', labelKey: 'al_act_del_cancelled',  color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  pending_approved:   { emoji: '✅', labelKey: 'al_act_approved',       color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  pending_declined:   { emoji: '❌', labelKey: 'al_act_declined',       color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  guest_order:        { emoji: '📱', labelKey: 'al_act_guest_order',    color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  waiter_call:        { emoji: '🔔', labelKey: 'al_act_waiter_call',    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  delivery_order:     { emoji: '🛵', labelKey: 'al_act_del_order',      color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
}

function getActionCfg(action: string) {
  return ACTION_CFG[action] ?? {
    emoji: '📋',
    labelKey: null as null,
    color: 'bg-white/8 text-white/50 border-white/10',
    _raw: action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
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

// ── Detail text (accepts translations for template words) ─────────
type TWords = {
  al_table: string; al_reason: string; al_via: string; al_added: string
  al_updated: string; al_deleted: string; al_toggled: string; al_printed: string
  al_items_count: string; al_waiter_req: string; al_customer: string
  al_item_word: string; al_settings_word: string; al_record_word: string
}
function buildDetail(action: string, meta: Record<string, unknown>, tw: TWords): string {
  const m = meta as Record<string, string | number | unknown>
  switch (action) {
    case 'send_to_kitchen':
      if (Array.isArray(m.items) && m.items.length)
        return `${tw.al_table} ${m.table ?? '?'} — ${(m.items as {name:string;qty:number}[]).slice(0,3).map(i=>`${i.qty}× ${i.name}`).join(', ')}`
      return `${tw.al_table} ${m.table ?? '?'}${m.item_name ? ` — ${m.item_name}` : ''}`
    case 'payment':
      return `${tw.al_table} ${m.table ?? '?'}${m.method ? ` ${tw.al_via} ${m.method}` : ''}${m.total ? ` — ${m.total}` : ''}`
    case 'void_item':
      return `${m.item_name ?? tw.al_item_word}${m.reason ? ` — ${tw.al_reason}: ${m.reason}` : ''}`
    case 'edit_price':
      return `${m.item_name ?? tw.al_item_word}${m.new_price !== undefined ? ` → ${m.new_price}` : ''}`
    case 'apply_discount':
      return `${m.item_name ?? tw.al_item_word}${m.discounted_price !== undefined ? ` → ${m.discounted_price}` : ''}`
    case 'add':
      return `${tw.al_added} ${m.entity ?? tw.al_record_word}${m.name ? `: ${m.name}` : ''}`
    case 'edit':
      return `${tw.al_updated} ${m.entity ?? tw.al_record_word}${m.name ? `: ${m.name}` : ''}`
    case 'delete':
      return `${tw.al_deleted} ${m.entity ?? tw.al_record_word}${m.name ? `: ${m.name}` : ''}`
    case 'toggle':
      return `${tw.al_toggled} ${m.entity ?? m.field ?? tw.al_settings_word}${m.value !== undefined ? ` → ${m.value}` : ''}`
    case 'update_settings':
      return `${tw.al_updated} ${m.section ?? tw.al_settings_word}${m.field ? `: ${m.field}` : ''}`
    case 'print': case 'print_bill':
      return `${tw.al_printed} ${m.type ?? 'bill'}${m.table ? ` — ${tw.al_table} ${m.table}` : ''}`
    case 'transfer_item':
      return `${m.item_name ?? tw.al_item_word} → ${tw.al_table} ${m.to_table ?? '?'}`
    case 'pay_later':
      return `${m.customer ?? tw.al_customer}${m.table ? ` — ${tw.al_table} ${m.table}` : ''}${m.amount ? ` — ${m.amount}` : ''}`
    case 'kds_cooking': case 'kds_ready':
      return `${tw.al_table} ${m.table ?? '?'}${m.item_name ? ` — ${m.item_name}` : (m.items_count ? ` — ${m.items_count} ${tw.al_items_count}` : '')}`
    case 'delivery_confirmed': case 'delivery_out': case 'delivery_delivered': case 'delivery_cancelled':
      return `${m.customer ?? tw.al_customer}${m.order_num ? ` #${m.order_num}` : ''}`
    case 'pending_approved': case 'pending_declined':
      return `${tw.al_table} ${m.table ?? '?'}${m.item_name ? ` — ${m.item_name}` : (m.items_count ? ` — ${m.items_count} ${tw.al_items_count}` : '')}`
    case 'guest_order':
      return `${tw.al_table} ${m.table ?? '?'}${m.table_name ? ` (${m.table_name})` : ''}${m.items ? ` — ${m.items}` : (m.items_count ? ` — ${m.items_count} ${tw.al_items_count}` : '')}`
    case 'waiter_call':
      return `${tw.al_table} ${m.table ?? '?'}${m.table_name ? ` (${m.table_name})` : ''} — ${tw.al_waiter_req}`
    case 'delivery_order':
      return `${m.customer ?? tw.al_customer}${m.phone ? ` · ${m.phone}` : ''}${m.items ? ` — ${m.items}` : (m.items_count ? ` — ${m.items_count} ${tw.al_items_count}` : '')}${m.address ? ` · ${m.address}` : ''}`
    default: {
      const parts: string[] = []
      if (m.table)     parts.push(`${tw.al_table} ${m.table}`)
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
  const { t } = useLanguage()

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

  const tw: TWords = {
    al_table: t.al_table, al_reason: t.al_reason, al_via: t.al_via,
    al_added: t.al_added, al_updated: t.al_updated, al_deleted: t.al_deleted,
    al_toggled: t.al_toggled, al_printed: t.al_printed,
    al_items_count: t.al_items_count, al_waiter_req: t.al_waiter_req,
    al_customer: t.al_customer, al_item_word: t.al_item_word,
    al_settings_word: t.al_settings_word, al_record_word: t.al_record_word,
  }

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
          || buildDetail(e.action, e.metadata, tw).toLowerCase().includes(q)
      })
    : entries

  const getLabel = (action: string) => {
    const cfg = getActionCfg(action)
    if (cfg.labelKey) return t[cfg.labelKey as keyof typeof t] as string
    return (cfg as { _raw?: string })._raw ?? action
  }

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
      `"${getLabel(r.action)}"`,
      `"${r.staff_name ?? ''}"`,
      `"${r.staff_role ?? ''}"`,
      `"${buildDetail(r.action, r.metadata as Record<string,unknown>, tw)}"`,
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
          <h1 className="text-2xl font-bold text-white">{t.aud_title}</h1>
          <p className="text-sm text-white/40 mt-1">{t.al_subtitle}</p>
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
            placeholder={t.al_search}
            className="bg-transparent text-sm text-white placeholder-white/25 outline-none flex-1"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="pl-7 pr-7 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 outline-none appearance-none cursor-pointer hover:bg-white/8 transition-colors">
            <option value="all">{t.aud_all_actions}</option>
            {allActions.map(a => <option key={a} value={a}>{getLabel(a)}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        <div className="relative">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
            className="pl-7 pr-7 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 outline-none appearance-none cursor-pointer hover:bg-white/8 transition-colors">
            <option value="all">{t.al_all_staff}</option>
            {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        <button onClick={() => fetchEntries(true)} disabled={loading}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/45 hover:bg-white/8 hover:text-white/70 transition-all disabled:opacity-50" title={t.aud_title}>
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>

        <button onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium hover:bg-sky-500/20 transition-all">
          <Download className="w-3.5 h-3.5" /> {t.al_export_csv}
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
                  ⏰ {t.al_col_time}
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 whitespace-nowrap w-[180px]">
                  👤 {t.al_col_user}
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 whitespace-nowrap w-[170px]">
                  🎯 {t.al_col_action}
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
                  ℹ️ {t.al_col_details}
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
                      <span className="text-sm">{t.al_loading}</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-white/25">
                      <ActivitySquare className="w-10 h-10 opacity-30" />
                      <p className="text-sm">{t.al_no_entries}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((entry, idx) => {
                  const cfg    = getActionCfg(entry.action)
                  const detail = buildDetail(entry.action, entry.metadata, tw)
                  const { time, date } = formatTimeParts(entry.created_at)
                  const label  = getLabel(entry.action)

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
                          {label}
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
              {loadingMore ? t.loading : t.aud_load_more}
            </button>
          </div>
        )}
      </motion.div>

      {!loading && filtered.length > 0 && (
        <motion.p variants={ITEM} className="text-center text-xs text-white/20">
          {filtered.length} {t.al_entries}{hasMore ? '+' : ''}
        </motion.p>
      )}

    </motion.div>
  )
}
