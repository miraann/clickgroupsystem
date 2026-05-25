'use client'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  Settings2, Wifi, WifiOff, Download, Trash2,
  RefreshCw, Check, Loader2, UtensilsCrossed,
  CreditCard, LayoutDashboard, Clock, AlertCircle,
  Upload, Inbox, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { SaveButton } from '@/components/ui/SaveButton'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import {
  getQueue, clearQueue, dequeueOrder, syncAllQueued,
  type QueuedOrder,
} from '@/lib/offlineQueue'

// ── Types ────────────────────────────────────────────────────────
interface AdvancedSettings {
  offline_mode_enabled: boolean
}
const DEFAULTS: AdvancedSettings = {
  offline_mode_enabled: false,
}

interface CacheEntry {
  key:       string
  label:     string
  icon:      React.ReactNode
  color:     string
  countKey:  string
}

const CACHE_ENTRIES: CacheEntry[] = [
  { key: 'offline_menu_categories', label: 'Menu Categories', icon: <UtensilsCrossed className="w-4 h-4" />, color: 'text-amber-400  bg-amber-500/15  border-amber-500/20',  countKey: 'categories' },
  { key: 'offline_menu_items',      label: 'Menu Items',      icon: <UtensilsCrossed className="w-4 h-4" />, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20', countKey: 'items'      },
  { key: 'offline_payment_methods', label: 'Payment Methods', icon: <CreditCard      className="w-4 h-4" />, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/20',  countKey: 'payment'    },
  { key: 'offline_tables',          label: 'Tables',          icon: <LayoutDashboard className="w-4 h-4" />, color: 'text-violet-400 bg-violet-500/15 border-violet-500/20',  countKey: 'tables'     },
]

// ── Animation ────────────────────────────────────────────────────
const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
}
const ITEM: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'circOut' as const } },
}

// ── Helper: read a cached dataset from localStorage ───────────────
function readCache(key: string): { count: number; cachedAt: string | null } {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { count: 0, cachedAt: null }
    const parsed = JSON.parse(raw)
    return { count: Array.isArray(parsed.data) ? parsed.data.length : 0, cachedAt: parsed.cached_at ?? null }
  } catch {
    return { count: 0, cachedAt: null }
  }
}

function formatTime(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Page ─────────────────────────────────────────────────────────
export default function AdvancedPage() {
  const supabase = useMemo(() => createClient(), [])
  const { restaurantId, settings, setSettings, loading, saveState, save } =
    useRestaurantSettings<AdvancedSettings>(DEFAULTS)

  const [isOnline,     setIsOnline]     = useState(true)
  const [caching,      setCaching]      = useState(false)
  const [cacheResult,  setCacheResult]  = useState<string | null>(null)
  const [clearing,     setClearing]     = useState(false)
  const [cacheStats,   setCacheStats]   = useState<Record<string, { count: number; cachedAt: string | null }>>({})
  const [queuedOrders, setQueuedOrders] = useState<QueuedOrder[]>([])
  const [syncingQueue, setSyncingQueue] = useState(false)
  const [syncResult,   setSyncResult]   = useState<string | null>(null)

  const refreshQueue = () => setQueuedOrders(getQueue())

  // Online/offline detection
  useEffect(() => {
    setIsOnline(navigator.onLine)
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Read cache stats from localStorage
  const refreshCacheStats = () => {
    const stats: Record<string, { count: number; cachedAt: string | null }> = {}
    for (const entry of CACHE_ENTRIES) stats[entry.key] = readCache(entry.key)
    setCacheStats(stats)
  }
  useEffect(() => { refreshCacheStats(); refreshQueue() }, [])

  const totalCached = Object.values(cacheStats).reduce((s, v) => s + v.count, 0)
  const lastSync    = Object.values(cacheStats)
    .map(v => v.cachedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null

  // ── Pre-cache data ──────────────────────────────────────────────
  const handlePrecache = async () => {
    if (!restaurantId) return
    setCaching(true)
    setCacheResult(null)

    const now = new Date().toISOString()

    const [cats, items, payments, tables] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('restaurant_id', restaurantId),
      supabase.from('menu_items').select('id,name,price,category_id,description,image_url,active').eq('restaurant_id', restaurantId),
      supabase.from('payment_methods').select('*').eq('restaurant_id', restaurantId),
      supabase.from('tables').select('*').eq('restaurant_id', restaurantId),
    ])

    const saves: [string, unknown[]][] = [
      ['offline_menu_categories', cats.data     ?? []],
      ['offline_menu_items',      items.data    ?? []],
      ['offline_payment_methods', payments.data ?? []],
      ['offline_tables',          tables.data   ?? []],
    ]
    for (const [key, data] of saves) {
      localStorage.setItem(key, JSON.stringify({ data, cached_at: now }))
    }

    // Tell the service worker to cache the shell pages
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const channel = new MessageChannel()
      navigator.serviceWorker.controller.postMessage(
        { type: 'PRECACHE_URLS', urls: ['/dashboard', `/pos/${localStorage.getItem('restaurant_slug') ?? ''}/login`] },
        [channel.port2]
      )
    }

    refreshCacheStats()
    setCaching(false)
    const total = saves.reduce((s, [, d]) => s + d.length, 0)
    setCacheResult(`Cached ${total} records successfully`)
    setTimeout(() => setCacheResult(null), 4000)
  }

  // ── Clear all offline cache ─────────────────────────────────────
  const handleClear = async () => {
    setClearing(true)
    for (const entry of CACHE_ENTRIES) localStorage.removeItem(entry.key)

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const channel = new MessageChannel()
      await new Promise<void>(resolve => {
        channel.port1.onmessage = () => resolve()
        navigator.serviceWorker.controller!.postMessage({ type: 'CLEAR_SHELL_CACHE' }, [channel.port2])
        setTimeout(resolve, 1500)
      })
    }

    refreshCacheStats()
    setClearing(false)
  }

  // ── Queue sync ──────────────────────────────────────────────────
  const handleSyncQueue = async () => {
    if (!isOnline || syncingQueue) return
    setSyncingQueue(true); setSyncResult(null)
    const { synced, failed } = await syncAllQueued(supabase)
    refreshQueue()
    setSyncingQueue(false)
    setSyncResult(synced > 0
      ? `${synced} order${synced > 1 ? 's' : ''} synced${failed > 0 ? `, ${failed} failed` : ''}`
      : failed > 0 ? `${failed} order${failed > 1 ? 's' : ''} failed to sync` : 'Nothing to sync')
    setTimeout(() => setSyncResult(null), 5000)
  }

  const handleDiscardOne = (localId: string) => {
    dequeueOrder(localId)
    refreshQueue()
  }

  const handleDiscardAll = () => {
    clearQueue()
    refreshQueue()
  }

  if (loading) return (
    <div className="max-w-2xl space-y-5 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-white/5" />)}
    </div>
  )

  return (
    <motion.div variants={CONTAINER} initial="hidden" animate="show" className="max-w-2xl space-y-6 pb-10">

      {/* Header */}
      <motion.div variants={ITEM} className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center shrink-0">
          <Settings2 className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Advanced</h1>
          <p className="text-sm text-white/40 mt-1">Offline mode, developer tools, and experimental features.</p>
        </div>
      </motion.div>

      <motion.div variants={ITEM} className="h-px bg-white/8" />

      {/* Connection status banner */}
      <motion.div variants={ITEM}>
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all',
          isOnline
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        )}>
          {isOnline
            ? <><Wifi className="w-4 h-4" /> Online — all features available</>
            : <><WifiOff className="w-4 h-4" /> Offline — using cached data</>}
        </div>
      </motion.div>

      {/* Offline Mode */}
      <motion.div variants={ITEM} className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-rose-400" />
          <p className="text-sm font-semibold text-white">Offline Mode</p>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Enable offline support</p>
              <p className="text-xs text-white/35 mt-0.5">
                Cache menu, tables, and payment methods so the POS works without internet
              </p>
            </div>
            <ToggleSwitch
              on={settings.offline_mode_enabled}
              onChange={v => setSettings(s => ({ ...s, offline_mode_enabled: v }))}
              activeColor="bg-rose-500"
            />
          </div>

          <AnimatePresence>
            {settings.offline_mode_enabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden space-y-4"
              >
                {/* Cache stats grid */}
                <div className="grid grid-cols-2 gap-2">
                  {CACHE_ENTRIES.map(entry => {
                    const stat = cacheStats[entry.key]
                    return (
                      <div key={entry.key} className={cn('rounded-xl border px-3 py-2.5 flex items-center gap-2.5', entry.color)}>
                        {entry.icon}
                        <div>
                          <p className="text-sm font-bold text-white leading-none">{stat?.count ?? 0}</p>
                          <p className="text-[11px] text-white/40 mt-0.5">{entry.label}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Last sync */}
                <div className="flex items-center gap-2 text-xs text-white/35">
                  <Clock className="w-3.5 h-3.5" />
                  Last synced: <span className="text-white/55">{formatTime(lastSync)}</span>
                  {totalCached > 0 && <span className="ml-auto text-white/30">{totalCached.toLocaleString()} records cached</span>}
                </div>

                {/* Offline note */}
                {totalCached === 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-400/80 leading-relaxed">
                      No data cached yet. Click <strong>Sync Now</strong> to download offline data to this device.
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePrecache}
                    disabled={caching || !isOnline}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 text-sm font-medium hover:bg-rose-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {caching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {caching ? 'Syncing…' : 'Sync Now'}
                  </button>

                  {totalCached > 0 && (
                    <button
                      onClick={handleClear}
                      disabled={clearing}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/45 text-sm font-medium hover:bg-white/8 hover:text-white/60 transition-all disabled:opacity-50"
                    >
                      {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {clearing ? 'Clearing…' : 'Clear Cache'}
                    </button>
                  )}

                  <AnimatePresence>
                    {cacheResult && (
                      <motion.p
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" /> {cacheResult}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {!isOnline && (
                  <p className="text-xs text-rose-400/70 flex items-center gap-1.5">
                    <WifiOff className="w-3.5 h-3.5" /> Connect to the internet to sync data
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-end pt-1 border-t border-white/6">
            <SaveButton state={saveState} onClick={save} />
          </div>
        </div>
      </motion.div>

      {/* How it works info box */}
      <AnimatePresence>
        {settings.offline_mode_enabled && (
          <motion.div
            variants={ITEM}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-white/8 bg-white/2 px-5 py-4 space-y-3"
          >
            <p className="text-xs font-semibold text-white/30 uppercase tracking-widest flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> How offline mode works
            </p>
            <ul className="space-y-1.5 text-xs text-white/45 leading-relaxed list-none">
              <li className="flex items-start gap-2"><span className="text-rose-400 mt-0.5">•</span> App pages are cached automatically as you visit them — they load instantly even without internet</li>
              <li className="flex items-start gap-2"><span className="text-rose-400 mt-0.5">•</span> <strong className="text-white/60">Sync Now</strong> downloads your menu, tables, and payment methods to this device</li>
              <li className="flex items-start gap-2"><span className="text-rose-400 mt-0.5">•</span> New orders placed while offline are saved to the <strong className="text-white/60">Order Queue</strong> and synced automatically when internet returns</li>
              <li className="flex items-start gap-2"><span className="text-rose-400 mt-0.5">•</span> Sync regularly (daily) to keep offline data up to date</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Queue */}
      <motion.div variants={ITEM} className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Inbox className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-white">Offline Order Queue</p>
          </div>
          {queuedOrders.length > 0 && (
            <span className="text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
              {queuedOrders.length}
            </span>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {queuedOrders.length === 0 ? (
            <p className="text-sm text-white/25 text-center py-3">No pending orders in queue</p>
          ) : (
            <>
              <div className="space-y-2">
                {queuedOrders.map(order => (
                  <div key={order.local_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/80">
                        Table {order.table_label} &mdash; {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                        {order.staff_name && <span className="text-white/35"> · {order.staff_name}</span>}
                      </p>
                      <p className="text-xs text-white/35 mt-0.5">{formatTime(order.queued_at)}</p>
                    </div>
                    <button
                      onClick={() => handleDiscardOne(order.local_id)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/15 text-white/25 hover:text-rose-400 transition-all"
                      title="Discard"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleSyncQueue}
                  disabled={syncingQueue || !isOnline}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-sm font-medium hover:bg-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncingQueue ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {syncingQueue ? 'Syncing…' : 'Sync All'}
                </button>

                <button
                  onClick={handleDiscardAll}
                  disabled={syncingQueue}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/45 text-sm font-medium hover:bg-white/8 hover:text-rose-400 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Discard All
                </button>

                <AnimatePresence>
                  {syncResult && (
                    <motion.p
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> {syncResult}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {!isOnline && (
                <p className="text-xs text-rose-400/70 flex items-center gap-1.5">
                  <WifiOff className="w-3.5 h-3.5" /> Connect to the internet to sync orders
                </p>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* Coming soon */}
      <motion.div variants={ITEM} className="rounded-2xl border border-white/8 bg-white/2 px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-white/25 uppercase tracking-widest">Coming soon</p>
        <div className="flex flex-wrap gap-2">
          {['API Access Keys', 'Webhooks', 'Third-party Integrations', 'Accounting Export', 'Feature Flags', 'Audit Log Export'].map(f => (
            <span key={f} className="inline-flex items-center px-3 py-1.5 rounded-lg border bg-white/4 border-white/8 text-xs font-medium text-white/35">
              {f}
            </span>
          ))}
        </div>
      </motion.div>

    </motion.div>
  )
}
