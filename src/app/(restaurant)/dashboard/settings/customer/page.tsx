'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  UserCircle, Plus, Pencil, Trash2, AlertCircle,
  Search, ToggleLeft, ToggleRight, Ban,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Customer } from './types'
import { CustomerModal } from './CustomerModal'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
}
const ITEM: Variants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'circOut' as const } },
}
function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-white/8', className)} />
}

export default function CustomerPage() {
  const { t } = useLanguage()
  const supabase = createClient()

  const [restaurantId, setRestaurantId]     = useState<string | null>(null)
  const [customers, setCustomers]           = useState<Customer[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [search, setSearch]                 = useState('')
  const [filterTag, setFilterTag]           = useState('all')
  const [showBlacklisted, setShowBlacklisted] = useState(false)
  const [sortBy, setSortBy]                 = useState<'name' | 'visit_count' | 'total_spent' | 'created_at'>('created_at')
  const [sortDir, setSortDir]               = useState<'asc' | 'desc'>('desc')

  const [editCustomer, setEditCustomer]     = useState<Customer | null>(null)
  const [showModal, setShowModal]           = useState(false)
  const [deleteId, setDeleteId]             = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const storedRid = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
    const rest = storedRid ? { id: storedRid } : null
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)
    const { data, error: e } = await supabase
      .from('customers').select('*').eq('restaurant_id', rest.id).order('created_at', { ascending: false })
    if (e) { setError(e.message); setLoading(false); return }
    setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const toggleStatus = async (c: Customer) => {
    const next = c.status === 'active' ? 'inactive' : 'active'
    setCustomers(cs => cs.map(x => x.id === c.id ? { ...x, status: next } : x))
    await supabase.from('customers').update({ status: next, updated_at: new Date().toISOString() }).eq('id', c.id)
  }

  const toggleBlacklist = async (c: Customer) => {
    const next = !c.blacklisted
    setCustomers(cs => cs.map(x => x.id === c.id ? { ...x, blacklisted: next } : x))
    await supabase.from('customers').update({ blacklisted: next, updated_at: new Date().toISOString() }).eq('id', c.id)
  }

  const handleDelete = async (id: string) => {
    if (deleteId !== id) { setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return }
    await supabase.from('customers').delete().eq('id', id)
    setCustomers(cs => cs.filter(c => c.id !== id)); setDeleteId(null)
  }

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const allTags = Array.from(new Set(customers.flatMap(c => c.tags ?? [])))

  const filtered = customers
    .filter(c => {
      if (!showBlacklisted && c.blacklisted) return false
      const q = search.toLowerCase()
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
      const matchTag = filterTag === 'all' || (c.tags ?? []).includes(filterTag)
      return matchSearch && matchTag
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name')             cmp = a.name.localeCompare(b.name)
      else if (sortBy === 'visit_count') cmp = a.visit_count - b.visit_count
      else if (sortBy === 'total_spent') cmp = a.total_spent - b.total_spent
      else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null

  const blacklistedCount = customers.filter(c => c.blacklisted).length

  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Make sure you have run the customers SQL migration.</p>
        <button onClick={load} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.42, ease: 'circOut' }}
        className="flex items-center gap-3 mb-5"
      >
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
          <UserCircle className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.cust_title}</h1>
          <p className="text-xs text-white/40">{t.cust_subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{customers.length}</span>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={CONTAINER} initial="hidden" animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5"
      >
        <motion.div variants={ITEM} className="p-3 rounded-2xl bg-blue-500/70 border border-white/10">
          <p className="text-xs text-white/70">Total</p>
          <p className="text-xl font-bold text-white mt-0.5">{customers.length}</p>
        </motion.div>
        <motion.div variants={ITEM} className="p-3 rounded-2xl bg-emerald-500/70 border border-white/10">
          <p className="text-xs text-white/70">Active</p>
          <p className="text-xl font-bold text-white mt-0.5">{customers.filter(c => c.status === 'active').length}</p>
        </motion.div>
        <motion.div variants={ITEM} className="p-3 rounded-2xl bg-violet-500/70 border border-white/10">
          <p className="text-xs text-white/70">Total Visits</p>
          <p className="text-xl font-bold text-white mt-0.5">{customers.reduce((s, c) => s + c.visit_count, 0)}</p>
        </motion.div>
        <motion.div variants={ITEM} className="p-3 rounded-2xl bg-rose-500/70 border border-white/10">
          <p className="text-xs text-white/70">Blacklisted</p>
          <p className="text-xl font-bold text-white mt-0.5">{blacklistedCount}</p>
        </motion.div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.21, duration: 0.42, ease: 'circOut' }}
        className="flex flex-wrap gap-2 mb-4"
      >
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setFilterTag('all')}
            className={cn('px-3 py-2 rounded-xl text-xs font-medium transition-all', filterTag === 'all' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-white/40 hover:text-white/70')}>
            All
          </button>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setFilterTag(filterTag === tag ? 'all' : tag)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium transition-all', filterTag === tag ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-white/40 hover:text-white/70')}>
              {tag}
            </button>
          ))}
          {blacklistedCount > 0 && (
            <button onClick={() => setShowBlacklisted(v => !v)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1 transition-all', showBlacklisted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-white/5 text-white/40 hover:text-white/70')}>
              <Ban className="w-3 h-3" /> Blacklisted ({blacklistedCount})
            </button>
          )}
        </div>
      </motion.div>

      {/* List */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-2"
          >
            {Array.from({ length: 5 }).map((_, i) => <Skel key={i} className="h-14" />)}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] text-white/30">Sort:</span>
              <button onClick={() => toggleSort('name')}
                className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                  sortBy === 'name' ? 'bg-violet-500/15 text-violet-400' : 'bg-white/5 text-white/40 hover:text-white/70')}>
                {t.cust_name} <SortIcon col="name" />
              </button>
              <button onClick={() => toggleSort('visit_count')}
                className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                  sortBy === 'visit_count' ? 'bg-violet-500/15 text-violet-400' : 'bg-white/5 text-white/40 hover:text-white/70')}>
                {t.cust_total_orders} <SortIcon col="visit_count" />
              </button>
            </div>

            <motion.div variants={CONTAINER} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Add-new card */}
              <button onClick={() => { setEditCustomer(null); setShowModal(true) }}
                className="min-h-[180px] rounded-2xl border-2 border-dashed border-white/15 hover:border-violet-500/40 hover:bg-violet-500/[0.04] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-violet-400 transition-all active:scale-95">
                <span className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center"><Plus className="w-4 h-4" /></span>
                <span className="text-[11px] font-semibold">{t.cust_add}</span>
              </button>
              {filtered.map(c => {
                const armed = deleteId === c.id
                return (
                  <motion.div key={c.id} variants={ITEM} className={cn('flex flex-col items-center rounded-2xl border px-3 py-3 text-center transition-colors',
                    c.blacklisted ? 'bg-rose-500/5 border-rose-500/20'
                      : c.status === 'active' ? 'bg-white/5 border-white/10 hover:border-white/20'
                      : 'bg-white/5 border-white/5 opacity-55')}>
                    <div className="w-11 h-11 rounded-xl bg-violet-500/15 text-violet-300 flex items-center justify-center text-base font-bold shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 max-w-full">
                      <p className="text-sm font-bold text-white line-clamp-1">{c.name}</p>
                      {c.blacklisted && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-semibold shrink-0">Blocked</span>}
                    </div>
                    {(c.phone || c.email) && <p className="text-[10px] text-white/35 line-clamp-1 w-full">{c.phone || c.email}</p>}
                    {(c.tags ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap justify-center gap-1">
                        {(c.tags ?? []).map(tag => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium">{tag}</span>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-white/40"><span className="font-bold text-white/70">{c.visit_count}</span> visits</p>

                    <span className="my-2 h-px w-full bg-white/8" />

                    <div className="flex items-start justify-center gap-1.5">
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => handleDelete(c.id)}
                          className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                            armed ? 'bg-rose-500/90 text-white' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className={cn('text-[9px] font-medium', armed ? 'text-rose-400' : 'text-white/40')}>
                          {armed ? t.confirm_delete : t.delete}
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => toggleBlacklist(c)}
                          className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                            c.blacklisted ? 'bg-rose-500/25 text-rose-400' : 'bg-white/5 text-white/30 hover:bg-rose-500/15 hover:text-rose-400')}>
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[9px] font-medium text-white/40">Block</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => toggleStatus(c)}
                          className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                            c.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/5 text-white/30 hover:bg-white/10')}>
                          {c.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <span className="text-[9px] font-medium text-white/40">{t.active}</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => { setEditCustomer(c); setShowModal(true) }}
                          className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 flex items-center justify-center transition-all active:scale-95">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[9px] font-medium text-white/40">{t.edit}</span>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-12 text-white/25 text-sm">{t.cust_no_data}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {showModal && restaurantId && (
        <CustomerModal
          customer={editCustomer}
          restaurantId={restaurantId}
          onClose={() => setShowModal(false)}
          onSaved={saved => {
            setCustomers(cs => editCustomer
              ? cs.map(c => c.id === saved.id ? saved : c)
              : [saved, ...cs])
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}
