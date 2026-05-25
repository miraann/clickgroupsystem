'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  Database, Download, Upload, Trash2, ShieldAlert,
  Clock, HardDrive, FileJson, AlertTriangle, Check,
  Loader2, RefreshCw, Users, ShoppingCart,
  UtensilsCrossed, CalendarDays, UserCheck, Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { SaveButton } from '@/components/ui/SaveButton'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'

// ── Types ────────────────────────────────────────────────────────
interface DbSettings {
  retention_enabled: boolean
  retention_days:    number
}

const DEFAULTS: DbSettings = {
  retention_enabled: false,
  retention_days:    90,
}

const RETENTION_OPTIONS = [
  { value: 30,  label: '30 days'   },
  { value: 60,  label: '60 days'   },
  { value: 90,  label: '90 days'   },
  { value: 180, label: '6 months'  },
  { value: 365, label: '1 year'    },
]

// Tables exported by full backup (all have restaurant_id)
const EXPORT_TABLES = [
  'menu_categories', 'menu_items', 'staff', 'tables', 'table_groups',
  'customers', 'members', 'reservations', 'discounts', 'payment_methods',
  'surcharges', 'void_reasons', 'kitchen_notes', 'customer_feedback',
  'delivery_zones', 'inventory_categories', 'inventory_items',
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

// ── Page ─────────────────────────────────────────────────────────
export default function DatabasePage() {
  const supabase = useMemo(() => createClient(), [])
  const { restaurantId, settings, setSettings, loading, saveState, save } =
    useRestaurantSettings<DbSettings>(DEFAULTS)

  // Storage counts
  const [stats, setStats] = useState<{ label: string; count: number; icon: React.ReactNode; color: string }[]>([])
  const [statsLoading, setStatsLoading] = useState(true)

  // Export
  const [exporting, setExporting] = useState(false)

  // Retention cleanup
  const [cleaning,     setCleaning]     = useState(false)
  const [cleanResult,  setCleanResult]  = useState<string | null>(null)

  // GDPR modal
  const [gdprModal,    setGdprModal]    = useState(false)
  const [gdprConfirm,  setGdprConfirm]  = useState('')
  const [gdprDeleting, setGdprDeleting] = useState(false)
  const [gdprDone,     setGdprDone]     = useState(false)

  // Restore
  const fileRef = useRef<HTMLInputElement>(null)
  type RestoreState = 'idle' | 'parsing' | 'preview' | 'restoring' | 'done' | 'error'
  const [restoreState,   setRestoreState]   = useState<RestoreState>('idle')
  const [restorePreview, setRestorePreview] = useState<Record<string, number>>({})
  const [restoreData,    setRestoreData]    = useState<Record<string, unknown[]> | null>(null)
  const [restoreError,   setRestoreError]   = useState<string | null>(null)

  // ── Load storage counts ─────────────────────────────────────────
  useEffect(() => {
    if (!restaurantId) return
    const load = async () => {
      setStatsLoading(true)
      const [orders, customers, menu, staff, members, reservations] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('menu_items').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('staff').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
      ])
      setStats([
        { label: 'Orders',       count: orders.count       ?? 0, icon: <ShoppingCart  className="w-4 h-4" />, color: 'text-amber-400  bg-amber-500/15  border-amber-500/20'  },
        { label: 'Customers',    count: customers.count    ?? 0, icon: <Users          className="w-4 h-4" />, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/20' },
        { label: 'Menu Items',   count: menu.count         ?? 0, icon: <UtensilsCrossed className="w-4 h-4"/>, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20'},
        { label: 'Staff',        count: staff.count        ?? 0, icon: <UserCheck      className="w-4 h-4" />, color: 'text-violet-400 bg-violet-500/15 border-violet-500/20' },
        { label: 'Members',      count: members.count      ?? 0, icon: <Package        className="w-4 h-4" />, color: 'text-cyan-400   bg-cyan-500/15   border-cyan-500/20'   },
        { label: 'Reservations', count: reservations.count ?? 0, icon: <CalendarDays   className="w-4 h-4" />, color: 'text-rose-400   bg-rose-500/15   border-rose-500/20'   },
      ])
      setStatsLoading(false)
    }
    load()
  }, [restaurantId, supabase])

  // ── Export backup ───────────────────────────────────────────────
  const handleExport = async () => {
    if (!restaurantId) return
    setExporting(true)
    const result: Record<string, unknown[]> = {}

    // Orders with nested items
    const { data: orders } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', restaurantId)
    result.orders = orders ?? []

    // All other tables in parallel
    await Promise.all(
      EXPORT_TABLES.map(async (table) => {
        const { data } = await supabase.from(table).select('*').eq('restaurant_id', restaurantId)
        result[table] = data ?? []
      })
    )

    const blob = new Blob(
      [JSON.stringify({ exported_at: new Date().toISOString(), restaurant_id: restaurantId, tables: result }, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = `backup-${restaurantId}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  // ── Retention cleanup ───────────────────────────────────────────
  const handleCleanup = async () => {
    if (!restaurantId || !settings.retention_enabled) return
    setCleaning(true)
    setCleanResult(null)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - settings.retention_days)
    const { count, error } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .in('status', ['completed', 'cancelled', 'void'])
      .lt('created_at', cutoff.toISOString())
    setCleaning(false)
    setCleanResult(error ? `Error: ${error.message}` : `Removed ${count ?? 0} old order records`)
  }

  // ── GDPR delete ─────────────────────────────────────────────────
  const handleGdprDelete = async () => {
    if (!restaurantId || gdprConfirm.toLowerCase() !== 'delete') return
    setGdprDeleting(true)
    await Promise.all([
      supabase.from('customers').delete().eq('restaurant_id', restaurantId),
      supabase.from('members').delete().eq('restaurant_id', restaurantId),
      supabase.from('reservations').delete().eq('restaurant_id', restaurantId),
      supabase.from('customer_feedback').delete().eq('restaurant_id', restaurantId),
    ])
    setGdprDeleting(false)
    setGdprModal(false)
    setGdprDone(true)
    setTimeout(() => setGdprDone(false), 5000)
  }

  // ── Restore: parse file ─────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRestoreState('parsing')
    setRestoreError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        if (!json.tables || typeof json.tables !== 'object') throw new Error('Invalid backup format')
        const preview: Record<string, number> = {}
        for (const [k, v] of Object.entries(json.tables)) {
          if (Array.isArray(v)) preview[k] = v.length
        }
        setRestorePreview(preview)
        setRestoreData(json.tables as Record<string, unknown[]>)
        setRestoreState('preview')
      } catch (err) {
        setRestoreError(err instanceof Error ? err.message : 'Failed to parse file')
        setRestoreState('error')
      }
    }
    reader.readAsText(file)
  }

  // ── Restore: upsert ─────────────────────────────────────────────
  const handleRestore = async () => {
    if (!restoreData || !restaurantId) return
    setRestoreState('restoring')
    setRestoreError(null)
    try {
      for (const [table, rows] of Object.entries(restoreData)) {
        if (!Array.isArray(rows) || rows.length === 0) continue
        if (table === 'orders') {
          const orderRows = rows.map((r) => {
            const { order_items: _, ...row } = r as Record<string, unknown>
            return row
          })
          const allItems = rows.flatMap((r) => ((r as Record<string, unknown>).order_items ?? []) as unknown[])
          await supabase.from('orders').upsert(orderRows as never[], { onConflict: 'id', ignoreDuplicates: false })
          if (allItems.length > 0)
            await supabase.from('order_items').upsert(allItems as never[], { onConflict: 'id', ignoreDuplicates: false })
        } else {
          await supabase.from(table).upsert(rows as never[], { onConflict: 'id', ignoreDuplicates: false })
        }
      }
      setRestoreState('done')
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed')
      setRestoreState('error')
    }
  }

  const resetRestore = () => {
    setRestoreState('idle')
    setRestoreData(null)
    setRestoreError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Skeleton ────────────────────────────────────────────────────
  if (loading) return (
    <div className="max-w-2xl space-y-5 animate-pulse">
      {[80, 100, 140, 120].map((h, i) => (
        <div key={i} className={`h-${h === 80 ? '12' : h === 100 ? '24' : h === 140 ? '36' : '28'} rounded-2xl bg-white/5`} />
      ))}
    </div>
  )

  return (
    <motion.div variants={CONTAINER} initial="hidden" animate="show" className="max-w-2xl space-y-6 pb-10">

      {/* Header */}
      <motion.div variants={ITEM} className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
          <Database className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Database</h1>
          <p className="text-sm text-white/40 mt-1">Backup, restore, data export, and privacy controls.</p>
        </div>
      </motion.div>

      <motion.div variants={ITEM} className="h-px bg-white/8" />

      {/* Storage Overview */}
      <motion.div variants={ITEM} className="space-y-3">
        <p className="text-xs font-semibold text-white/30 uppercase tracking-widest flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5" /> Storage Overview
        </p>
        <div className="grid grid-cols-3 gap-3">
          {statsLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
              ))
            : stats.map(s => (
                <div key={s.label} className={cn('rounded-xl border px-4 py-3 flex items-center gap-3', s.color)}>
                  {s.icon}
                  <div>
                    <p className="text-lg font-bold text-white leading-none">{s.count.toLocaleString()}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">{s.label}</p>
                  </div>
                </div>
              ))
          }
        </div>
      </motion.div>

      {/* Export & Backup */}
      <motion.div variants={ITEM} className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3">
          <FileJson className="w-4 h-4 text-cyan-400" />
          <p className="text-sm font-semibold text-white">Export &amp; Backup</p>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white/70">Download Full Backup</p>
            <p className="text-xs text-white/35 mt-0.5">
              Exports orders, menu, customers, staff, and more as a JSON file.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 text-sm font-medium hover:bg-cyan-500/25 transition-all disabled:opacity-50 disabled:cursor-wait"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? 'Exporting…' : 'Download'}
          </button>
        </div>
      </motion.div>

      {/* Data Retention */}
      <motion.div variants={ITEM} className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3">
          <Clock className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-semibold text-white">Data Retention</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Auto-cleanup old records</p>
              <p className="text-xs text-white/35 mt-0.5">
                Delete completed/cancelled orders older than the retention window
              </p>
            </div>
            <ToggleSwitch
              on={settings.retention_enabled}
              onChange={v => setSettings(s => ({ ...s, retention_enabled: v }))}
              activeColor="bg-amber-500"
            />
          </div>

          <AnimatePresence>
            {settings.retention_enabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden space-y-4"
              >
                <div>
                  <p className="text-xs text-white/40 font-medium mb-2">Keep records for</p>
                  <div className="flex flex-wrap gap-2">
                    {RETENTION_OPTIONS.map(o => (
                      <button key={o.value}
                        onClick={() => setSettings(s => ({ ...s, retention_days: o.value }))}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                          settings.retention_days === o.value
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70 hover:bg-white/8'
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCleanup}
                    disabled={cleaning}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-wait"
                  >
                    {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {cleaning ? 'Running…' : 'Run Cleanup Now'}
                  </button>

                  <AnimatePresence>
                    {cleanResult && (
                      <motion.p
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-lg border',
                          cleanResult.startsWith('Error')
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        )}
                      >
                        {cleanResult}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-end pt-1 border-t border-white/6">
            <SaveButton state={saveState} onClick={save} />
          </div>
        </div>
      </motion.div>

      {/* GDPR / Customer Data */}
      <motion.div variants={ITEM} className="rounded-2xl border border-rose-500/20 bg-rose-500/5 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-500/15 flex items-center gap-3">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <p className="text-sm font-semibold text-white">GDPR / Customer Data Deletion</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-white/60 leading-relaxed">
            Permanently delete all personal customer data — customer profiles, loyalty members,
            reservations, and feedback.{' '}
            <span className="text-rose-400 font-medium">This cannot be undone.</span>
          </p>
          <p className="text-xs text-white/35">
            Order history is preserved for financial compliance. Customer names attached to orders are not removed.
          </p>

          <AnimatePresence>
            {gdprDone && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-2 rounded-lg flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5" /> Customer data deleted successfully.
              </motion.p>
            )}
          </AnimatePresence>

          <button
            onClick={() => { setGdprModal(true); setGdprConfirm('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 text-sm font-medium hover:bg-rose-500/25 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete All Customer Data
          </button>
        </div>
      </motion.div>

      {/* Restore from Backup */}
      <motion.div variants={ITEM} className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3">
          <Upload className="w-4 h-4 text-violet-400" />
          <p className="text-sm font-semibold text-white">Restore from Backup</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/80 leading-relaxed">
              Records are upserted by ID — existing rows with the same ID will be overwritten.
              Only restore files created by this system.
            </p>
          </div>

          {(restoreState === 'idle' || restoreState === 'error') && (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-8 rounded-xl border-2 border-dashed border-white/12 text-white/35 hover:text-white/55 hover:border-white/22 transition-all flex flex-col items-center gap-2 text-sm"
            >
              <Upload className="w-5 h-5" />
              Click to select backup JSON file
            </button>
          )}

          {restoreState === 'parsing' && (
            <div className="py-8 flex items-center justify-center gap-2 text-white/40 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Parsing file…
            </div>
          )}

          {restoreState === 'preview' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-white/35 uppercase tracking-widest">Found in backup</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(restorePreview).map(([table, count]) => (
                  <div key={table} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/8">
                    <span className="text-xs text-white/55 capitalize">{table.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-medium text-white/80">{count.toLocaleString()} rows</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={resetRestore}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/8 transition-all">
                  Cancel
                </button>
                <button onClick={handleRestore}
                  className="flex-1 py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/30 transition-all flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" /> Restore Now
                </button>
              </div>
            </div>
          )}

          {restoreState === 'restoring' && (
            <div className="py-8 flex items-center justify-center gap-2 text-violet-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Restoring data…
            </div>
          )}

          {restoreState === 'done' && (
            <div className="py-6 flex flex-col items-center gap-3 text-emerald-400 text-sm">
              <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                <Check className="w-5 h-5" />
              </div>
              Restore complete!
              <button onClick={resetRestore} className="text-xs text-white/35 hover:text-white/55 transition-colors">
                Restore another file
              </button>
            </div>
          )}

          {restoreError && (
            <p className="text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-2 rounded-lg">
              {restoreError}
            </p>
          )}
        </div>
      </motion.div>

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

      {/* GDPR Confirmation Modal */}
      <AnimatePresence>
        {gdprModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setGdprModal(false)}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.22 }}
              className="relative w-full max-w-sm rounded-2xl border border-rose-500/25 bg-[#0d1526]/95 backdrop-blur-2xl shadow-2xl p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Delete Customer Data</h2>
                  <p className="text-xs text-white/40">This action is permanent and irreversible.</p>
                </div>
              </div>

              <p className="text-sm text-white/55 leading-relaxed">
                Will delete all records from:{' '}
                <span className="text-white/80">customers, members, reservations, feedback</span>.
              </p>

              <div>
                <label className="text-xs text-white/40 block mb-1.5">
                  Type <span className="text-rose-400 font-mono font-semibold">delete</span> to confirm
                </label>
                <input
                  type="text"
                  value={gdprConfirm}
                  onChange={e => setGdprConfirm(e.target.value)}
                  placeholder="delete"
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/50 transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setGdprModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/8 transition-all">
                  Cancel
                </button>
                <button
                  onClick={handleGdprDelete}
                  disabled={gdprConfirm.toLowerCase() !== 'delete' || gdprDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  {gdprDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {gdprDeleting ? 'Deleting…' : 'Delete All'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  )
}
