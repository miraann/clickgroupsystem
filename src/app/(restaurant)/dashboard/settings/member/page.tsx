'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Star, Plus, Pencil, Trash2, Loader2, AlertCircle,
  Search, ToggleLeft, ToggleRight, Phone, Mail,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Member } from './types'
import { TIERS, TIER_COLORS } from './types'
import { MemberModal }  from './MemberModal'
import { PointsModal }  from './PointsModal'

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
    const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
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

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>

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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Star className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">{t.mem_title}</h1>
            <p className="text-xs text-white/40">{t.mem_subtitle}</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{members.length}</span>
        </div>
        <button onClick={() => { setEditMember(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
          <Plus className="w-4 h-4" /> {t.mem_add}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {TIERS.map(tier => {
          const count = members.filter(m => m.tier === tier).length
          return (
            <div key={tier} className="p-3 rounded-2xl bg-white/4 border border-white/8">
              <p className="text-xs text-white/40">{tier}</p>
              <p className="text-xl font-bold text-white mt-0.5">{count}</p>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
        </div>
        <div className="flex gap-1">
          {(['all', ...TIERS] as string[]).map(tier => (
            <button key={tier} onClick={() => setTierFilter(tier)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium transition-all',
                tierFilter === tier ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-white/40 hover:text-white/70')}>
              {tier === 'all' ? 'All' : tier}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/25 text-sm">{t.mem_no_data}</div>
      ) : (
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-px bg-white/5 px-4 py-2.5 text-[11px] font-semibold text-white/30 uppercase tracking-wider">
            <button onClick={() => toggleSort('name')} className="flex items-center gap-1 text-left hover:text-white/60 transition-colors">
              {t.mem_name} <SortIcon col="name" />
            </button>
            <span className="text-center">{t.mem_tier}</span>
            <button onClick={() => toggleSort('points')} className="flex items-center gap-1 justify-end hover:text-white/60 transition-colors">
              {t.mem_points} <SortIcon col="points" />
            </button>
            <span className="text-center">Status</span>
            <span></span>
            <span></span>
          </div>

          <div className="divide-y divide-white/5">
            {filtered.map(m => (
              <div key={m.id} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-px items-center px-4 py-3 bg-white/[0.02] hover:bg-white/5 transition-colors">

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {m.phone && <span className="flex items-center gap-1 text-[11px] text-white/35"><Phone className="w-2.5 h-2.5" />{m.phone}</span>}
                    {m.email && <span className="flex items-center gap-1 text-[11px] text-white/35"><Mail className="w-2.5 h-2.5" />{m.email}</span>}
                  </div>
                </div>

                <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold mx-4', TIER_COLORS[m.tier] ?? TIER_COLORS.Standard)}>
                  {m.tier}
                </span>

                <button onClick={() => setPointsMember(m)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-bold transition-all active:scale-95 mx-2">
                  <Star className="w-3 h-3" />{m.points.toLocaleString()}
                </button>

                <button onClick={() => toggleStatus(m)} className={cn('mx-2 transition-all active:scale-95', m.status === 'active' ? 'text-emerald-400' : 'text-white/25')}>
                  {m.status === 'active' ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>

                <button onClick={() => { setEditMember(m); setShowModal(true) }} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95">
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button onClick={() => handleDelete(m.id)}
                  className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium',
                    deleteId === m.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                  {deleteId === m.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
