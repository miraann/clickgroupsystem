'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Star, Plus, Pencil, Trash2, AlertCircle,
  Search, ToggleLeft, ToggleRight,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Member } from './types'
import { TIERS, TIER_COLORS } from './types'
import { MemberModal }  from './MemberModal'
import { PointsModal }  from './PointsModal'
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

export default function MemberPage() {
  const { t } = useLanguage()
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [members, setMembers]           = useState<Member[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [tierFilter, setTierFilter]     = useState<string>('all')
  const [sortBy, setSortBy]             = useState<'name' | 'points' | 'created_at'>('created_at')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc')

  const [editMember, setEditMember]     = useState<Member | 'add' | null>(null)
  const [showModal, setShowModal]       = useState(false)
  const [pointsMember, setPointsMember] = useState<Member | null>(null)
  const [deleteId, setDeleteId]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const storedRid = typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
    const rest = storedRid ? { id: storedRid } : null
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)
    const { data, error: e } = await supabase
      .from('members').select('*').eq('restaurant_id', rest.id).order('created_at', { ascending: false })
    if (e) { setError(e.message); setLoading(false); return }
    setMembers((data ?? []) as Member[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const toggleStatus = async (m: Member) => {
    const next = m.status === 'active' ? 'inactive' : 'active'
    setMembers(ms => ms.map(x => x.id === m.id ? { ...x, status: next } : x))
    await supabase.from('members').update({ status: next, updated_at: new Date().toISOString() }).eq('id', m.id)
  }

  const handleDelete = async (id: string) => {
    if (deleteId !== id) { setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return }
    await supabase.from('members').delete().eq('id', id)
    setMembers(ms => ms.filter(m => m.id !== id)); setDeleteId(null)
  }

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const filtered = members
    .filter(m => {
      const q = search.toLowerCase()
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.phone?.includes(q) || m.email?.toLowerCase().includes(q)
      const matchTier = tierFilter === 'all' || m.tier === tierFilter
      return matchSearch && matchTier
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name')        cmp = a.name.localeCompare(b.name)
      else if (sortBy === 'points') cmp = a.points - b.points
      else                          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      : null

  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Make sure you have run the members SQL migration.</p>
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
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <Star className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.mem_title}</h1>
          <p className="text-xs text-white/40">{t.mem_subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{members.length}</span>
      </motion.div>

      {/* Stats row */}
      <motion.div
        variants={CONTAINER} initial="hidden" animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5"
      >
        {TIERS.map(tier => {
          const count = members.filter(m => m.tier === tier).length
          return (
            <motion.div key={tier} variants={ITEM} className="p-3 rounded-2xl bg-white/4 border border-white/8">
              <p className="text-xs text-white/40">{tier}</p>
              <p className="text-xl font-bold text-white mt-0.5">{count}</p>
            </motion.div>
          )
        })}
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
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            { key: 'all',      label: 'All',      base: 'bg-white/20',       active: 'bg-white/40 shadow-lg'                          },
            { key: 'Standard', label: 'Standard', base: 'bg-slate-500/70',   active: 'bg-slate-500 shadow-lg shadow-slate-500/30'   },
            { key: 'Silver',   label: 'Silver',   base: 'bg-slate-400/70',   active: 'bg-slate-400 shadow-lg shadow-slate-400/30'   },
            { key: 'Gold',     label: 'Gold',     base: 'bg-amber-500/70',   active: 'bg-amber-500 shadow-lg shadow-amber-500/30'   },
            { key: 'Platinum', label: 'Platinum', base: 'bg-violet-500/70',  active: 'bg-violet-500 shadow-lg shadow-violet-500/30' },
          ]).map(({ key, label, base, active }) => (
            <button key={key} onClick={() => setTierFilter(key)}
              className={cn('px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 text-white',
                tierFilter === key ? active : base)}>
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Table */}
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
                  sortBy === 'name' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-white/40 hover:text-white/70')}>
                {t.mem_name} <SortIcon col="name" />
              </button>
              <button onClick={() => toggleSort('points')}
                className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                  sortBy === 'points' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-white/40 hover:text-white/70')}>
                {t.mem_points} <SortIcon col="points" />
              </button>
            </div>

            <motion.div variants={CONTAINER} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Add-new card */}
              <button onClick={() => { setEditMember(null); setShowModal(true) }}
                className="min-h-[180px] rounded-2xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-amber-400 transition-all active:scale-95">
                <span className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center"><Plus className="w-4 h-4" /></span>
                <span className="text-[11px] font-semibold">{t.mem_add}</span>
              </button>
              {filtered.map(m => {
                const armed = deleteId === m.id
                return (
                  <motion.div key={m.id} variants={ITEM} className={cn('flex flex-col items-center rounded-2xl border bg-white/5 px-3 py-3 text-center transition-colors',
                    m.status === 'active' ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-55')}>
                    <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold shrink-0', TIER_COLORS[m.tier] ?? TIER_COLORS.Standard)}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="mt-1.5 w-full text-sm font-bold text-white line-clamp-1">{m.name}</p>
                    {(m.phone || m.email) && (
                      <p className="text-[10px] text-white/35 line-clamp-1 w-full">{m.phone || m.email}</p>
                    )}
                    <span className={cn('mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', TIER_COLORS[m.tier] ?? TIER_COLORS.Standard)}>{m.tier}</span>
                    <button onClick={() => setPointsMember(m)}
                      className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold transition-all active:scale-95">
                      <Star className="w-3 h-3" />{m.points.toLocaleString()}
                    </button>

                    <span className="my-2 h-px w-full bg-white/8" />

                    <div className="flex items-start justify-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => handleDelete(m.id)}
                          className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                            armed ? 'bg-rose-500/90 text-white' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className={cn('text-[9px] font-medium', armed ? 'text-rose-400' : 'text-white/40')}>
                          {armed ? t.confirm_delete : t.delete}
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => toggleStatus(m)}
                          className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95',
                            m.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/5 text-white/30 hover:bg-white/10')}>
                          {m.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <span className="text-[9px] font-medium text-white/40">{t.active}</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => { setEditMember(m); setShowModal(true) }}
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
              <div className="col-span-full text-center py-12 text-white/25 text-sm">{t.mem_no_data}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {showModal && restaurantId && (
        <MemberModal
          member={editMember === 'add' ? null : editMember}
          restaurantId={restaurantId}
          onClose={() => setShowModal(false)}
          onSaved={saved => {
            setMembers(ms => editMember
              ? ms.map(m => m.id === saved.id ? saved : m)
              : [saved, ...ms])
            setShowModal(false)
          }}
        />
      )}

      {pointsMember && (
        <PointsModal
          member={pointsMember}
          onClose={() => setPointsMember(null)}
          onSaved={(id, newPoints) => {
            setMembers(ms => ms.map(m => m.id === id ? { ...m, points: newPoints } : m))
            setPointsMember(null)
          }}
        />
      )}
    </div>
  )
}
