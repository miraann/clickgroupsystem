'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  UserCircle, Plus, Pencil, Trash2, Loader2, AlertCircle, X,
  Search, ToggleLeft, ToggleRight, Phone, Mail, Tag,
  ShoppingBag, Ban, ChevronUp, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  birthday: string | null
  tags: string[]
  notes: string | null
  blacklisted: boolean
  visit_count: number
  total_spent: number
  status: 'active' | 'inactive'
  created_at: string
}

const PRESET_TAGS = ['VIP', 'Regular', 'New', 'Corporate', 'Online', 'Delivery']

const EMPTY_FORM = {
  name: '', phone: '', email: '', birthday: '',
  tags: [] as string[], notes: '', blacklisted: false, status: 'active' as 'active' | 'inactive',
}

export default function CustomerPage() {
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [customers, setCustomers]       = useState<Customer[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [filterTag, setFilterTag]       = useState('all')
  const [showBlacklisted, setShowBlacklisted] = useState(false)
  const [sortBy, setSortBy]             = useState<'name' | 'visit_count' | 'total_spent' | 'created_at'>('created_at')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc')

  const [modal, setModal]       = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)
    const { data, error: e } = await supabase
      .from('customers').select('*').eq('restaurant_id', rest.id).order('created_at', { ascending: false })
    if (e) { setError(e.message); setLoading(false); return }
    setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setEditId(null); setForm(EMPTY_FORM); setTagInput(''); setSaveError(null); setModal(true)
  }
  const openEdit = (c: Customer) => {
    setEditId(c.id)
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', birthday: c.birthday ?? '', tags: c.tags ?? [], notes: c.notes ?? '', blacklisted: c.blacklisted, status: c.status })
    setTagInput(''); setSaveError(null); setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true); setSaveError(null)
    const payload = {
      name:        form.name.trim(),
      phone:       form.phone.trim() || null,
      email:       form.email.trim() || null,
      birthday:    form.birthday || null,
      tags:        form.tags,
      notes:       form.notes.trim() || null,
      blacklisted: form.blacklisted,
      status:      form.status,
      updated_at:  new Date().toISOString(),
    }
    if (editId) {
      const { error: e } = await supabase.from('customers').update(payload).eq('id', editId)
      if (e) { setSaveError(e.message); setSaving(false); return }
      setCustomers(cs => cs.map(c => c.id === editId ? { ...c, ...payload } : c))
    } else {
      const { data, error: e } = await supabase.from('customers')
        .insert({ restaurant_id: restaurantId, ...payload }).select().single()
      if (e) { setSaveError(e.message); setSaving(false); return }
      setCustomers(cs => [data as Customer, ...cs])
    }
    setSaving(false); setModal(false)
  }

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

  const addTag = (tag: string) => {
    const t = tag.trim()
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }))
    setTagInput('')
  }
  const removeTag = (tag: string) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  // All tags used across customers
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
      if (sortBy === 'name')         cmp = a.name.localeCompare(b.name)
      else if (sortBy === 'visit_count') cmp = a.visit_count - b.visit_count
      else if (sortBy === 'total_spent') cmp = a.total_spent - b.total_spent
      else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null

  const blacklistedCount = customers.filter(c => c.blacklisted).length

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>

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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <UserCircle className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Customers</h1>
            <p className="text-xs text-white/40">Customer profiles and history</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{customers.length}</span>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-2xl bg-white/4 border border-white/8">
          <p className="text-xs text-white/40">Total</p>
          <p className="text-xl font-bold text-white mt-0.5">{customers.length}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white/4 border border-white/8">
          <p className="text-xs text-white/40">Active</p>
          <p className="text-xl font-bold text-emerald-400 mt-0.5">{customers.filter(c => c.status === 'active').length}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white/4 border border-white/8">
          <p className="text-xs text-white/40">Total Visits</p>
          <p className="text-xl font-bold text-white mt-0.5">{customers.reduce((s, c) => s + c.visit_count, 0)}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white/4 border border-white/8">
          <p className="text-xs text-white/40">Blacklisted</p>
          <p className="text-xl font-bold text-rose-400 mt-0.5">{blacklistedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email…"
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setFilterTag('all')}
            className={cn('px-3 py-2 rounded-xl text-xs font-medium transition-all', filterTag === 'all' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-white/40 hover:text-white/70')}>
            All
          </button>
          {allTags.map(t => (
            <button key={t} onClick={() => setFilterTag(filterTag === t ? 'all' : t)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium transition-all', filterTag === t ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-white/40 hover:text-white/70')}>
              {t}
            </button>
          ))}
          {blacklistedCount > 0 && (
            <button onClick={() => setShowBlacklisted(v => !v)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1 transition-all', showBlacklisted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-white/5 text-white/40 hover:text-white/70')}>
              <Ban className="w-3 h-3" /> Blacklisted ({blacklistedCount})
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/25 text-sm">
          {customers.length === 0 ? 'No customers yet. Add your first customer.' : 'No customers match your search.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-px bg-white/5 px-4 py-2.5 text-[11px] font-semibold text-white/30 uppercase tracking-wider">
            <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-white/60 transition-colors text-left">
              Name <SortIcon col="name" />
            </button>
            <span className="text-center px-3">Tags</span>
            <button onClick={() => toggleSort('visit_count')} className="flex items-center gap-1 justify-end hover:text-white/60 transition-colors px-3">
              Visits <SortIcon col="visit_count" />
            </button>
            <span className="text-center px-2">Block</span>
            <span className="text-center px-2">Status</span>
            <span></span>
            <span></span>
          </div>

          <div className="divide-y divide-white/5">
            {filtered.map(c => (
              <div key={c.id} className={cn('grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-px items-center px-4 py-3 hover:bg-white/5 transition-colors', c.blacklisted ? 'bg-rose-500/5' : 'bg-white/[0.02]')}>

                {/* Name + contact */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                    {c.blacklisted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-semibold shrink-0">Blocked</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {c.phone && <span className="flex items-center gap-1 text-[11px] text-white/35"><Phone className="w-2.5 h-2.5" />{c.phone}</span>}
                    {c.email && <span className="flex items-center gap-1 text-[11px] text-white/35"><Mail className="w-2.5 h-2.5" />{c.email}</span>}
                  </div>
                </div>

                {/* Tags */}
                <div className="flex gap-1 flex-wrap mx-3 max-w-[140px]">
                  {(c.tags ?? []).map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium">{t}</span>
                  ))}
                </div>

                {/* Visits */}
                <div className="text-center mx-3">
                  <p className="text-sm font-bold text-white">{c.visit_count}</p>
                  <p className="text-[10px] text-white/30">visits</p>
                </div>

                {/* Blacklist toggle */}
                <button onClick={() => toggleBlacklist(c)} title={c.blacklisted ? 'Remove from blacklist' : 'Add to blacklist'}
                  className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 mx-1', c.blacklisted ? 'bg-rose-500/20 text-rose-400' : 'bg-white/5 hover:bg-rose-500/10 text-white/30 hover:text-rose-400')}>
                  <Ban className="w-3.5 h-3.5" />
                </button>

                {/* Status toggle */}
                <button onClick={() => toggleStatus(c)} className={cn('mx-1 transition-all active:scale-95', c.status === 'active' ? 'text-emerald-400' : 'text-white/25')}>
                  {c.status === 'active' ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>

                {/* Edit */}
                <button onClick={() => openEdit(c)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95">
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* Delete */}
                <button onClick={() => handleDelete(c.id)}
                  className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium',
                    deleteId === c.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                  {deleteId === c.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
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
              <h2 className="text-base font-semibold text-white">{editId ? 'Edit Customer' : 'Add Customer'}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Full Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07xx xxx xxxx"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Email</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
                </div>
              </div>

              {/* Birthday */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Birthday</label>
                <input type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors" />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map(t => (
                    <span key={t} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      {t}
                      <button onClick={() => removeTag(t)} className="text-violet-400/60 hover:text-violet-300"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                {/* Preset tags */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_TAGS.filter(t => !form.tags.includes(t)).map(t => (
                    <button key={t} onClick={() => addTag(t)}
                      className="text-xs px-2 py-1 rounded-lg bg-white/5 text-white/40 hover:bg-violet-500/15 hover:text-violet-400 border border-white/8 transition-all">
                      + {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
                    placeholder="Custom tag…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
                  <button onClick={() => addTag(tagInput)} className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-sm transition-all active:scale-95">Add</button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors resize-none" />
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6">
                <button onClick={() => setForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} className="flex items-center gap-2 text-sm">
                  {form.status === 'active' ? <ToggleRight className="w-6 h-6 text-violet-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                  <span className={form.status === 'active' ? 'text-white' : 'text-white/40'}>Active</span>
                </button>
                <button onClick={() => setForm(f => ({ ...f, blacklisted: !f.blacklisted }))} className="flex items-center gap-2 text-sm">
                  {form.blacklisted ? <ToggleRight className="w-6 h-6 text-rose-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                  <span className={form.blacklisted ? 'text-rose-400' : 'text-white/40'}>Blacklisted</span>
                </button>
              </div>
            </div>

            {saveError && (
              <div className="mt-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-xs text-rose-400 font-mono break-all">{saveError}</p>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
              <button onClick={handleSave} disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Save Changes' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
