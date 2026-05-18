'use client'
import { useState, useEffect, useCallback } from 'react'
import { Users, ArrowLeft, TrendingUp, Clock, Calendar, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import { getStaffHome } from '@/lib/permissions/staffHome'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

type Period = 'today' | 'week' | 'month' | 'year'

interface OrderRow { guests: number; created_at: string }
interface Bucket   { label: string; guests: number; orders: number }

const PERIOD_TABS: { id: Period; label: string; icon: React.ElementType }[] = [
  { id: 'today', label: 'Today',      icon: Clock       },
  { id: 'week',  label: 'This Week',  icon: CalendarDays },
  { id: 'month', label: 'This Month', icon: Calendar    },
  { id: 'year',  label: 'This Year',  icon: TrendingUp  },
]

const HOURS   = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12
  return `${h}${i < 12 ? 'am' : 'pm'}`
})
const DAYS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function buildBuckets(period: Period, rows: OrderRow[]): Bucket[] {
  const now = new Date()

  if (period === 'today') {
    const buckets: Bucket[] = HOURS.map(label => ({ label, guests: 0, orders: 0 }))
    rows.forEach(r => {
      const d = new Date(r.created_at)
      if (d.toDateString() === now.toDateString()) {
        buckets[d.getHours()].guests += r.guests ?? 0
        buckets[d.getHours()].orders += 1
      }
    })
    return buckets
  }

  if (period === 'week') {
    const startOfWeek = new Date(now)
    const day = now.getDay()
    startOfWeek.setDate(now.getDate() - ((day + 6) % 7))
    startOfWeek.setHours(0, 0, 0, 0)

    const buckets: Bucket[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      return { label: `${DAYS[d.getDay()]} ${d.getDate()}`, guests: 0, orders: 0 }
    })
    rows.forEach(r => {
      const d = new Date(r.created_at)
      const diff = Math.floor((d.getTime() - startOfWeek.getTime()) / 86400000)
      if (diff >= 0 && diff < 7) {
        buckets[diff].guests += r.guests ?? 0
        buckets[diff].orders += 1
      }
    })
    return buckets
  }

  if (period === 'month') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const buckets: Bucket[] = Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      guests: 0,
      orders: 0,
    }))
    rows.forEach(r => {
      const d = new Date(r.created_at)
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        const idx = d.getDate() - 1
        buckets[idx].guests += r.guests ?? 0
        buckets[idx].orders += 1
      }
    })
    return buckets
  }

  const buckets: Bucket[] = MONTHS.map(label => ({ label, guests: 0, orders: 0 }))
  rows.forEach(r => {
    const d = new Date(r.created_at)
    if (d.getFullYear() === now.getFullYear()) {
      buckets[d.getMonth()].guests += r.guests ?? 0
      buckets[d.getMonth()].orders += 1
    }
  })
  return buckets
}

function dateRangeFor(period: Period): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (period === 'today') {
    return { from: `${fmt(now)}T00:00:00`, to: `${fmt(now)}T23:59:59` }
  }
  if (period === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return { from: `${fmt(start)}T00:00:00`, to: `${fmt(end)}T23:59:59` }
  }
  if (period === 'month') {
    return {
      from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01T00:00:00`,
      to:   `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}T23:59:59`,
    }
  }
  return { from: `${now.getFullYear()}-01-01T00:00:00`, to: `${now.getFullYear()}-12-31T23:59:59` }
}

// ── Animation variants ─────────────────────────────────────────
const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'circOut' as const } },
}
const STAGGER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
}
const ITEM: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'circOut' as const } },
}
const CARD_GRID: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
}
const CARD: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  show:   { opacity: 1, scale: 1, y: 0, transition: { duration: 0.26, ease: 'circOut' as const } },
}

// ── Skeleton helpers ───────────────────────────────────────────
function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-white/8', className)} />
}

export default function GuestsPage() {
  const supabase = createClient()
  const router = useRouter()
  const { can, isOwner, permissions, loading: permsLoading } = usePermissions()

  useEffect(() => {
    if (permsLoading || isOwner) return
    if (!can('guests')) router.replace(getStaffHome(permissions))
  }, [permsLoading, isOwner, permissions, can, router])

  const [period, setPeriod] = useState<Period>('today')
  const [rows, setRows]     = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
    if (!rest) { setLoading(false); return }

    const yearStart = `${new Date().getFullYear()}-01-01T00:00:00`
    const yearEnd   = `${new Date().getFullYear()}-12-31T23:59:59`

    const { data } = await supabase
      .from('orders')
      .select('guests, created_at')
      .eq('restaurant_id', rest.id)
      .in('status', ['paid', 'active'])
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd)
      .order('created_at')

    setRows((data ?? []) as OrderRow[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const buckets = buildBuckets(period, rows)
  const maxGuests = Math.max(...buckets.map(b => b.guests), 1)

  const totalGuests  = buckets.reduce((s, b) => s + b.guests, 0)
  const totalOrders  = buckets.reduce((s, b) => s + b.orders, 0)
  const avgPerOrder  = totalOrders > 0 ? (totalGuests / totalOrders).toFixed(1) : '0'
  const peakBucket   = buckets.reduce((a, b) => b.guests > a.guests ? b : a, buckets[0])

  const showAll   = period === 'today' || period === 'week'

  const SUMMARY_CARDS = [
    { label: 'Total Guests',  value: totalGuests.toLocaleString(), color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
    { label: 'Total Orders',  value: totalOrders.toLocaleString(), color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20'  },
    { label: 'Avg / Order',   value: avgPerOrder,                  color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20'  },
    {
      label: 'Peak',
      value: peakBucket?.guests > 0 ? `${peakBucket.label} · ${peakBucket.guests}` : '—',
      color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20',
    },
  ]

  return (
    <motion.div
      className="min-h-screen text-white"
      style={{ background: 'var(--app-bg, #022658)' }}
      variants={PAGE}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-4 border-b border-white/8 backdrop-blur-xl" style={{ background: 'var(--app-anchor-90, rgba(2,38,88,0.9))' }}>
        <Link href="/dashboard" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-all active:scale-95">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
          <Users className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white">Guest Tracking</h1>
          <p className="text-xs text-white/35">Guest count analytics</p>
        </div>
      </div>

      <motion.div
        className="p-5 space-y-5 max-w-4xl mx-auto"
        variants={STAGGER}
        initial="hidden"
        animate="show"
      >

        {/* Period tabs */}
        <motion.div variants={ITEM} className="flex gap-2">
          {PERIOD_TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setPeriod(t.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all active:scale-95',
                  period === t.id
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/8 hover:text-white/70'
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </motion.div>

        {/* Summary cards */}
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.div
              key="skel-cards"
              variants={ITEM}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {[0, 1, 2, 3].map(i => (
                <Skel key={i} className="h-[72px] rounded-2xl" />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="real-cards"
              variants={CARD_GRID}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {SUMMARY_CARDS.map(c => (
                <motion.div key={c.label} variants={CARD} className={cn('p-4 rounded-2xl border', c.bg, c.border)}>
                  <p className="text-xs text-white/40 mb-1">{c.label}</p>
                  <p className={cn('text-xl font-bold tabular-nums', c.color)}>{c.value}</p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bar chart */}
        <motion.div variants={ITEM} className="bg-white/4 border border-white/8 rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-5">
            {period === 'today' ? 'Guests by Hour' : period === 'week' ? 'Guests by Day' : period === 'month' ? 'Guests by Day of Month' : 'Guests by Month'}
          </p>

          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div
                key="chart-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-end gap-1"
                style={{ height: '80px' }}
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex-1 rounded-t-md bg-white/5 animate-pulse" style={{ height: `${20 + Math.random() * 50}px` }} />
                ))}
              </motion.div>
            ) : totalGuests === 0 ? (
              <motion.div
                key="chart-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-center h-[80px] text-white/20 text-sm"
              >
                No guest data for this period
              </motion.div>
            ) : (
              <motion.div
                key={`chart-${period}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className={cn(
                  'flex items-end gap-1',
                  period === 'today' ? 'overflow-x-auto pb-2' : 'flex-wrap'
                )}
              >
                {buckets.map((b, i) => {
                  const pct = b.guests / maxGuests
                  const isActive = b.guests > 0
                  return (
                    <div
                      key={i}
                      className={cn('flex flex-col items-center gap-1 group', period === 'today' ? 'min-w-[32px]' : 'flex-1 min-w-[28px]')}
                    >
                      <div className={cn('text-[10px] font-semibold tabular-nums transition-all', isActive ? 'text-amber-400' : 'text-white/10')}>
                        {b.guests > 0 ? b.guests : ''}
                      </div>
                      <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                        <motion.div
                          className={cn('w-full rounded-t-md', isActive ? 'bg-amber-500/70 group-hover:bg-amber-400' : 'bg-white/5')}
                          style={{ height: `${Math.max(pct * 80, isActive ? 4 : 2)}px` }}
                          initial={{ scaleY: 0, originY: '100%' }}
                          animate={{ scaleY: 1 }}
                          transition={{ duration: 0.4, ease: 'circOut', delay: i * 0.012 }}
                        />
                      </div>
                      <span className={cn('text-[9px] font-medium', isActive ? 'text-white/50' : 'text-white/15')}>
                        {b.label}
                      </span>
                    </div>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Breakdown table */}
        <AnimatePresence>
          {!loading && totalGuests > 0 && (
            <motion.div
              variants={ITEM}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
              className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-white/8">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Breakdown</p>
              </div>
              <div className="divide-y divide-white/5">
                {buckets
                  .filter(b => b.guests > 0)
                  .sort((a, b) => b.guests - a.guests)
                  .map((b, i) => (
                    <motion.div
                      key={b.label}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.22, delay: i * 0.04, ease: 'circOut' }}
                      className="flex items-center gap-4 px-5 py-3"
                    >
                      <span className="text-xs text-white/30 w-6 tabular-nums">{i + 1}</span>
                      <span className="flex-1 text-sm text-white/70">{b.label}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <motion.div
                            className="h-full bg-amber-500/60 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(b.guests / maxGuests) * 100}%` }}
                            transition={{ duration: 0.5, ease: 'circOut', delay: i * 0.04 }}
                          />
                        </div>
                        <span className="text-sm font-bold text-amber-400 tabular-nums w-10 text-right">{b.guests}</span>
                        <span className="text-xs text-white/30 tabular-nums w-16 text-right">{b.orders} order{b.orders !== 1 ? 's' : ''}</span>
                      </div>
                    </motion.div>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </motion.div>
  )
}
