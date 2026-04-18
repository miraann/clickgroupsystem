'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Star, Plus, Pencil, Trash2, Loader2, AlertCircle, X,
  Search, ToggleLeft, ToggleRight, Phone, Mail, Gift, Award,
  Users, ChevronUp, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface Member {
  id: string
  name: string
  phone: string | null
  email: string | null
  points: number
  tier: string
  birthday: string | null
  notes: string | null
  status: 'active' | 'inactive'
  created_at: string
}

const TIERS = ['Standard', 'Silver', 'Gold', 'Platinum']
const TIER_COLORS: Record<string, string> = {
  Standard: 'bg-white/10 text-white/60',
  Silver:   'bg-slate-400/15 text-slate-300',
  Gold:     'bg-amber-400/15 text-amber-400',
  Platinum: 'bg-violet-400/15 text-violet-400',
}

const EMPTY_FORM = {
  name: '', phone: '', email: '', points: 0,
  tier: 'Standard', birthday: '', notes: '', status: 'active' as 'active' | 'inactive',
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

  const [modal, setModal]       = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Points adjustment modal
  const [pointsModal, setPointsModal]   = useState<Member | null>(null)
  const [pointsAdj, setPointsAdj]       = useState('')
  const [pointsNote, setPointsNote]     = useState('')
  const [savingPoints, setSavingPoints] = useState(false)

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

  const openAdd = () => {
    setEditId(null); setForm(EMPTY_FORM); setSaveError(null); setModal(true)
  }
  const openEdit = (m: Member) => {
    setEditId(m.id)
    setForm({ name: m.name, phone: m.phone ?? '', email: m.email ?? '', points: m.points, tier: m.tier, birthday: m.birthday ?? '', notes: m.notes ?? '', status: m.status })
    setSaveError(null); setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true); setSaveError(null)
    const payload = {
      name:     form.name.trim(),
      phone:    form.phone.trim() || null,
      email:    form.email.trim() || null,
      points:   form.points,
      tier:     form.tier,
      birthday: form.birthday || null,
      notes:    form.notes.trim() || null,
      status:   form.status,
      updated_at: new Date().toISOString(),
    }
    if (editId) {
      const { error: e } = await supabase.from('members').update(payload).eq('id', editId)
      if (e) { setSaveError(e.message); setSaving(false); return }
      setMembers(ms => ms.map(m => m.id === editId ? { ...m, ...payload } : m))
    } else {
      const { data, error: e } = await supabase.from('members')
        .insert({ restaurant_id: restaurantId, ...payload }).select().single()
      if (e) { setSaveError(e.message); setSaving(false); return }
      setMembers(ms => [data as Member, ...ms])
    }
    setSaving(false); setModal(false)
  }

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

  const handleAdjustPoints = async () => {
    if (!pointsModal) return
    const adj = parseInt(pointsAdj)
    if (isNaN(adj)) return
    setSavingPoints(true)
    const newPoints = Math.max(0, pointsModal.points + adj)
    const { error: e } = await supabase.from('members')
      .update({ points: newPoints, updated_at: new Date().toISOString() }).eq('id', pointsModal.id)
    if (!e) {
      setMembers(ms => ms.map(m => m.id === pointsModal.id ? { ...m, points: newPoints } : m))
      setPointsModal(null); setPointsAdj(''); setPointsNote('')
    }
    setSavingPoints(false)
  }

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  // Filter + sort
  const filtered = members
    .filter(m => {
      const q = search.toLowerCase()
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.phone?.includes(q) || m.email?.toLowerCase().includes(q)
      const matchTier = tierFilter === 'all' || m.tier === tierFilter
      return matchSearch && matchTier
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name')       cmp = a.name.localeCompare(b.name)
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
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
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
          {(['all', ...TIERS] as string[]).map(t => (
            <button key={t} onClick={() => setTierFilter(t)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium transition-all',
                tierFilter === t ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-white/40 hover:text-white/70')}>
              {t === 'all' ? 'All' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/25 text-sm">
          {members.length === 0 ? t.mem_no_data : t.mem_no_data}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          {/* Table header */}
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

                {/* Name + contact */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {m.phone && <span className="flex items-center gap-1 text-[11px] text-white/35"><Phone className="w-2.5 h-2.5" />{m.phone}</span>}
                    {m.email && <span className="flex items-center gap-1 text-[11px] text-white/35"><Mail className="w-2.5 h-2.5" />{m.email}</span>}
                  </div>
                </div>

                {/* Tier */}
                <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold mx-4', TIER_COLORS[m.tier] ?? TIER_COLORS.Standard)}>
                  {m.tier}
                </span>

                {/* Points */}
                <button onClick={() => { setPointsModal(m); setPointsAdj(''); setPointsNote('') }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-bold transition-all active:scale-95 mx-2">
                  <Star className="w-3 h-3" />{m.points.toLocaleString()}
                </button>

                {/* Status toggle */}
                <button onClick={() => toggleStatus(m)} className={cn('mx-2 transition-all active:scale-95', m.status === 'active' ? 'text-emerald-400' : 'text-white/25')}>
                  {m.status === 'active' ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>

                {/* Edit */}
                <button onClick={() => openEdit(m)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95">
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* Delete */}
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

      {/* ── Add/Edit Modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? t.edit : t.mem_add}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_name} *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Member name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_phone}</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07xx xxx xxxx"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_email}</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_tier}</label>
                  <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}
                    className="w-full bg-[#0d1220] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors">
                    {TIERS.map(t => <option key={t} value={t} className="bg-[#0d1220]">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.mem_points}</label>
                  <input type="number" min="0" value={form.points} onChange={e => setForm(f => ({ ...f, points: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Birthday</label>
                <input type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors resize-none" />
              </div>

              <button onClick={() => setForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} className="flex items-center gap-2 text-sm">
                {form.status === 'active' ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                <span className={form.status === 'active' ? 'text-white' : 'text-white/40'}>Active</span>
              </button>
            </div>

            {saveError && (
              <div className="mt-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-xs text-rose-400 font-mono break-all">{saveError}</p>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
              <button onClick={handleSave} disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? t.save_changes : t.mem_add}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Points Adjustment Modal ── */}
      {pointsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-[#0d1220]/95 border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Adjust Points</h2>
                <p className="text-xs text-white/40 mt-0.5">{pointsModal.name}</p>
              </div>
              <button onClick={() => setPointsModal(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 py-4 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <Star className="w-5 h-5 text-amber-400" />
              <span className="text-2xl font-bold text-amber-400">{pointsModal.points.toLocaleString()}</span>
              <span className="text-sm text-white/40">pts</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Adjustment (+ to add, − to deduct)</label>
                <input type="number" value={pointsAdj} onChange={e => setPointsAdj(e.target.value)} placeholder="e.g. +100 or -50"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
                {pointsAdj && !isNaN(parseInt(pointsAdj)) && (
                  <p className="text-xs text-white/40 mt-1">
                    New total: <span className="text-amber-400 font-bold">{Math.max(0, pointsModal.points + parseInt(pointsAdj)).toLocaleString()} pts</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Reason (optional)</label>
                <input value={pointsNote} onChange={e => setPointsNote(e.target.value)} placeholder="e.g. Birthday bonus"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setPointsModal(null)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
              <button onClick={handleAdjustPoints} disabled={!pointsAdj || isNaN(parseInt(pointsAdj)) || savingPoints}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {savingPoints && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
