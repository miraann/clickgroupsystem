'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ActivitySquare, Search, Clock, Flame, CheckCheck, Loader2, ChevronDown, ChevronUp, X, Eye, User, QrCode, Calendar, Hash, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SkeletonList } from '@/components/ui/SkeletonList'

interface KdsItemRecord {
  id: string
  item_name: string
  qty: number
  note: string | null
  status: string
  created_at: string
  sent_at: string | null
  cooking_started_at: string | null
  ready_at: string | null
}

interface KdsOrderRecord {
  order_id: string
  order_num: string | null
  table_label: string
  source: string | null
  date: string
  items: KdsItemRecord[]
}

function secsBetween(a: string, b: string) {
  return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000))
}

function fmtSecs(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={cn('rounded-2xl border p-4', color)}>
      <p className="text-xs font-semibold text-white/40 mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-white">{value}</p>
      {sub && <p className="text-xs text-white/35 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Order Detail Modal ────────────────────────────────────────
function OrderDetailModal({ record, onClose }: { record: KdsOrderRecord; onClose: () => void }) {
  const date = new Date(record.date)
  const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })

  const isGuest = record.source === 'guest'

  const totalWait = record.items
    .filter(i => i.sent_at && i.cooking_started_at)
    .map(i => secsBetween(i.sent_at!, i.cooking_started_at!))
  const totalCook = record.items
    .filter(i => i.cooking_started_at && i.ready_at)
    .map(i => secsBetween(i.cooking_started_at!, i.ready_at!))
  const avgWait = totalWait.length ? Math.round(totalWait.reduce((a,b)=>a+b,0)/totalWait.length) : null
  const avgCook = totalCook.length ? Math.round(totalCook.reduce((a,b)=>a+b,0)/totalCook.length) : null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0e1018] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 bg-white/3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{record.order_num ?? 'Order Details'}</p>
              <p className="text-xs text-white/35">Table {record.table_label}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info grid */}
        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          {/* Order # */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/3 border border-white/6">
            <Hash className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Order Number</p>
              <p className="text-sm font-bold text-amber-400 font-mono mt-0.5">{record.order_num ?? '—'}</p>
            </div>
          </div>

          {/* Ordered by */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/3 border border-white/6">
            {isGuest
              ? <QrCode className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              : <User className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            }
            <div>
              <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Ordered By</p>
              <p className={cn('text-sm font-bold mt-0.5', isGuest ? 'text-blue-400' : 'text-emerald-400')}>
                {isGuest ? 'Guest (QR)' : 'Staff'}
              </p>
            </div>
          </div>

          {/* Date */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/3 border border-white/6">
            <Calendar className="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Date</p>
              <p className="text-sm font-semibold text-white/70 mt-0.5">{dateStr}</p>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/3 border border-white/6">
            <Clock className="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Time</p>
              <p className="text-sm font-semibold text-white/70 mt-0.5">{timeStr}</p>
            </div>
          </div>

          {/* Avg wait */}
          {avgWait !== null && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Avg Queue Wait</p>
                <p className="text-sm font-bold text-amber-400 mt-0.5">{fmtSecs(avgWait)}</p>
              </div>
            </div>
          )}

          {/* Avg cook */}
          {avgCook !== null && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
              <Flame className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Avg Cook Time</p>
                <p className="text-sm font-bold text-blue-400 mt-0.5">{fmtSecs(avgCook)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="px-5 pb-5">
          <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-2">
            Food Details · {record.items.length} item{record.items.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {record.items.map(item => {
              const waitSecs = item.sent_at && item.cooking_started_at ? secsBetween(item.sent_at, item.cooking_started_at) : null
              const cookSecs = item.cooking_started_at && item.ready_at ? secsBetween(item.cooking_started_at, item.ready_at) : null
              const statusCfg = item.status === 'ready'
                ? { dot: 'bg-emerald-400', label: 'Ready',   text: 'text-emerald-400' }
                : item.status === 'cooking'
                ? { dot: 'bg-blue-400',    label: 'Cooking', text: 'text-blue-400' }
                : { dot: 'bg-amber-400',   label: 'Sent',    text: 'text-amber-400' }

              return (
                <div key={item.id} className="rounded-xl bg-white/3 border border-white/6 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', statusCfg.dot)} />
                      <p className="text-sm font-semibold text-white truncate">{item.item_name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-white/40">×{item.qty}</span>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/6', statusCfg.text)}>{statusCfg.label}</span>
                    </div>
                  </div>
                  {item.note && <p className="text-xs text-amber-300/60 italic mt-1 pl-4">"{item.note}"</p>}
                  <div className="flex items-center gap-3 mt-1.5 pl-4">
                    {waitSecs !== null && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400/70">
                        <Clock className="w-2.5 h-2.5" /> Wait {fmtSecs(waitSecs)}
                      </span>
                    )}
                    {cookSecs !== null && (
                      <span className="flex items-center gap-1 text-[10px] text-blue-400/70">
                        <Flame className="w-2.5 h-2.5" /> Cook {fmtSecs(cookSecs)}
                      </span>
                    )}
                    {item.sent_at && (
                      <span className="text-[10px] text-white/20">
                        {new Date(item.sent_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Order Row ─────────────────────────────────────────────────
function OrderRow({ record }: { record: KdsOrderRecord }) {
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const { t } = useLanguage()

  const pendingSecs  = record.items.filter(i => i.sent_at && i.cooking_started_at).map(i => secsBetween(i.sent_at!, i.cooking_started_at!))
  const cookingSecs  = record.items.filter(i => i.cooking_started_at && i.ready_at)
    .map(i => secsBetween(i.cooking_started_at!, i.ready_at!))

  const avgPending = pendingSecs.length ? Math.round(pendingSecs.reduce((a, b) => a + b, 0) / pendingSecs.length) : null
  const avgCooking = cookingSecs.length ? Math.round(cookingSecs.reduce((a, b) => a + b, 0) / cookingSecs.length) : null

  const date = new Date(record.date)
  const dateLabel = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeLabel = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
      {/* Summary row */}
      <div
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/4 transition-all text-left cursor-pointer"
      >
        {/* Order number */}
        <div className="w-24 shrink-0">
          <span className="text-xs font-bold text-amber-400 font-mono">
            {record.order_num ?? <span className="text-white/20 font-normal">No order #</span>}
          </span>
        </div>

        {/* Table */}
        <div className="w-16 shrink-0">
          <span className="text-xs font-semibold text-white/70">T{record.table_label}</span>
        </div>

        {/* Date/time */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/40">{dateLabel} · {timeLabel}</p>
        </div>

        {/* Items count */}
        <div className="shrink-0 text-xs text-white/35">
          {record.items.length} item{record.items.length !== 1 ? 's' : ''}
        </div>

        {/* Avg pending */}
        {avgPending !== null && (
          <div className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400">
            <Clock className="w-3 h-3" />
            {fmtSecs(avgPending)}
          </div>
        )}

        {/* Avg cooking */}
        {avgCooking !== null && (
          <div className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400">
            <Flame className="w-3 h-3" />
            {fmtSecs(avgCooking)}
          </div>
        )}

        {/* View button */}
        <button
          onClick={e => { e.stopPropagation(); setShowModal(true) }}
          className="shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/6 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-all active:scale-95"
        >
          <Eye className="w-3 h-3" />
          View
        </button>

        <div className="shrink-0 text-white/30">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {showModal && <OrderDetailModal record={record} onClose={() => setShowModal(false)} />}

      {/* Expanded items */}
      {open && (
        <div className="border-t border-white/6 px-4 py-3 space-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-white/25 uppercase tracking-wider pb-1 border-b border-white/6">
            <div className="col-span-4">{t.vi_item}</div>
            <div className="col-span-1 text-center">{t.vi_qty}</div>
            <div className="col-span-3 text-center">{t.kds_pending}</div>
            <div className="col-span-3 text-center">{t.kds_cooking}</div>
            <div className="col-span-1 text-center">{t.kds_done}</div>
          </div>
          {record.items.map(item => {
            const waitSecs = item.sent_at && item.cooking_started_at ? secsBetween(item.sent_at, item.cooking_started_at) : null
            const cookSecs = item.cooking_started_at && item.ready_at
              ? secsBetween(item.cooking_started_at, item.ready_at)
              : null

            return (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center text-xs py-1">
                <div className="col-span-4">
                  <p className="font-semibold text-white/80 truncate">{item.item_name}</p>
                  {item.note && <p className="text-[10px] text-amber-300/60 italic truncate">"{item.note}"</p>}
                </div>
                <div className="col-span-1 text-center text-white/50 font-bold">×{item.qty}</div>
                <div className="col-span-3 text-center">
                  {waitSecs !== null ? (
                    <span className={cn(
                      'inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md',
                      waitSecs > 300 ? 'bg-rose-500/10 text-rose-400' :
                      waitSecs > 120 ? 'bg-amber-500/10 text-amber-400' :
                      'bg-emerald-500/10 text-emerald-400'
                    )}>
                      <Clock className="w-2.5 h-2.5" />
                      {fmtSecs(waitSecs)}
                    </span>
                  ) : <span className="text-white/20">—</span>}
                </div>
                <div className="col-span-3 text-center">
                  {cookSecs !== null ? (
                    <span className={cn(
                      'inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md',
                      cookSecs > 1200 ? 'bg-rose-500/10 text-rose-400' :
                      cookSecs > 600  ? 'bg-amber-500/10 text-amber-400' :
                      'bg-blue-500/10 text-blue-400'
                    )}>
                      <Flame className="w-2.5 h-2.5" />
                      {fmtSecs(cookSecs)}
                    </span>
                  ) : <span className="text-white/20">—</span>}
                </div>
                <div className="col-span-1 text-center">
                  {item.status === 'ready' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                  ) : item.status === 'cooking' ? (
                    <Flame className="w-3.5 h-3.5 text-blue-400 mx-auto" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-amber-400 mx-auto" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function KdsMonitorPage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const [records, setRecords]   = useState<KdsOrderRecord[]>([])
  const [filtered, setFiltered] = useState<KdsOrderRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  // Aggregate stats
  const allItems = records.flatMap(r => r.items)
  const pendingTimes = allItems.filter(i => i.sent_at && i.cooking_started_at).map(i => secsBetween(i.sent_at!, i.cooking_started_at!))
  const cookTimes    = allItems.filter(i => i.cooking_started_at && i.ready_at)
    .map(i => secsBetween(i.cooking_started_at!, i.ready_at!))
  const avgPending = pendingTimes.length ? Math.round(pendingTimes.reduce((a, b) => a + b, 0) / pendingTimes.length) : null
  const avgCook    = cookTimes.length    ? Math.round(cookTimes.reduce((a, b) => a + b, 0) / cookTimes.length)    : null
  const maxPending = pendingTimes.length ? Math.max(...pendingTimes) : null
  const maxCook    = cookTimes.length    ? Math.max(...cookTimes)    : null

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
    if (!rest) { setLoading(false); return }

    const [{ data: items }, { data: tablesData }] = await Promise.all([
      supabase
        .from('order_items')
        .select('id, item_name, qty, note, status, created_at, sent_at, cooking_started_at, ready_at, order_id, orders!inner(id, table_number, restaurant_id, order_num, source)')
        .eq('orders.restaurant_id', rest.id)
        .in('status', ['sent', 'cooking', 'ready'])
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('tables')
        .select('seq, table_number')
        .eq('restaurant_id', rest.id),
    ])

    const labelMap = new Map<number, string>()
    for (const t of (tablesData ?? [])) labelMap.set(t.seq, t.table_number ?? String(t.seq))

    // Group by order_id
    const map = new Map<string, KdsOrderRecord>()
    for (const row of (items ?? []) as any[]) {
      const ord = row.orders as { id: string; table_number: number; order_num: string | null; source: string | null }
      if (!map.has(ord.id)) {
        map.set(ord.id, {
          order_id:    ord.id,
          order_num:   ord.order_num ?? null,
          table_label: labelMap.get(ord.table_number) ?? String(ord.table_number),
          source:      ord.source ?? 'staff',
          date:        row.created_at,
          items:       [],
        })
      }
      const g = map.get(ord.id)!
      g.items.push({
        id:                 row.id,
        item_name:          row.item_name,
        qty:                row.qty,
        note:               row.note,
        status:             row.status,
        created_at:         row.created_at,
        sent_at:            row.sent_at,
        cooking_started_at: row.cooking_started_at,
        ready_at:           row.ready_at,
      })
      // keep oldest item date as order date
      if (row.created_at < g.date) g.date = row.created_at
    }

    const result = [...map.values()]
    setRecords(result)
    setFiltered(result)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Filter
  useEffect(() => {
    const q = search.trim().toLowerCase()
    if (!q) { setFiltered(records); return }
    setFiltered(records.filter(r =>
      (r.order_num?.toLowerCase().includes(q)) ||
      r.table_label.toLowerCase().includes(q) ||
      r.items.some(i => i.item_name.toLowerCase().includes(q))
    ))
  }, [search, records])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
          <ActivitySquare className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">{t.kds_title}</h1>
          <p className="text-xs text-white/35">{t.kds_subtitle}</p>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={5} rowHeight="h-[80px]" />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={t.kds_pending}
              value={avgPending !== null ? fmtSecs(avgPending) : '—'}
              sub="Sent to kitchen → chef started"
              color="border-amber-500/20 bg-amber-500/5"
            />
            <StatCard
              label={t.kds_cooking}
              value={avgCook !== null ? fmtSecs(avgCook) : '—'}
              sub="Start cooking → ready"
              color="border-blue-500/20 bg-blue-500/5"
            />
            <StatCard
              label="Max Wait (Pending)"
              value={maxPending !== null ? fmtSecs(maxPending) : '—'}
              sub="Longest queue wait"
              color="border-rose-500/20 bg-rose-500/5"
            />
            <StatCard
              label="Max Cook Time"
              value={maxCook !== null ? fmtSecs(maxCook) : '—'}
              sub="Slowest dish"
              color="border-purple-500/20 bg-purple-500/5"
            />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`${t.search}…`}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 focus:bg-white/7"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/30">
            <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-amber-400" /> Wait time = sent to kitchen → chef started cooking</div>
            <div className="flex items-center gap-1.5"><Flame className="w-3 h-3 text-blue-400" /> Cook time = start cooking → ready</div>
            <div className="ml-auto">{filtered.length} order{filtered.length !== 1 ? 's' : ''} · {allItems.length} items</div>
          </div>

          {/* Records */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <ActivitySquare className="w-10 h-10 text-white/10" />
              <p className="text-white/30 text-sm">{search ? 'No results found' : t.kds_no_orders}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 px-4 text-[10px] font-bold text-white/20 uppercase tracking-wider">
                <div className="col-span-1">{t.kds_order}</div>
                <div className="col-span-1">{t.kds_table}</div>
                <div className="col-span-3">{t.kds_time}</div>
                <div className="col-span-2">{t.kds_items}</div>
                <div className="col-span-2 text-center">{t.kds_pending}</div>
                <div className="col-span-2 text-center">{t.kds_cooking}</div>
                <div className="col-span-1" />
              </div>
              {filtered.map(record => (
                <OrderRow key={record.order_id} record={record} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
