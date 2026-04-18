'use client'
import { useState, useEffect, useCallback } from 'react'
import { GlassCard, GlassCardBody } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import {
  Search, Plus, Store, MoreVertical, Eye, Ban, Trash2,
  Edit, CheckCircle, Filter, Download, Loader2, X, EyeOff,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RestaurantStatus } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { MODULES, MODULE_CATEGORIES } from '@/lib/modules'

interface Restaurant {
  id: string
  name: string
  email: string | null
  phone: string | null
  plan: string
  status: RestaurantStatus
  created_at: string
  settings: Record<string, unknown>
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
}

const emptyForm = {
  name: '',
  ownerName: '',
  email: '',
  phone: '',
  plan: 'professional',
  password: '',
}

export default function RestaurantsPage() {
  const supabase = createClient()

  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null)
  const [editTab, setEditTab]         = useState<'details' | 'modules'>('details')
  const [editModules, setEditModules] = useState<Record<string, boolean>>({})
  const [activeMenu, setActiveMenu]   = useState<string | null>(null)
  const [form, setForm]               = useState(emptyForm)
  const [editForm, setEditForm]       = useState(emptyForm)
  const [saving, setSaving]           = useState(false)
  const [editSaving, setEditSaving]   = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [editError, setEditError]     = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('restaurants')
      .select('id, name, email, phone, plan, status, created_at, settings')
      .order('created_at', { ascending: false })
    setRestaurants((data ?? []) as Restaurant[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = restaurants.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleAdd = async () => {
    if (!form.name.trim()) return
    if (form.password.length > 0 && form.password.length < 8) {
      setSaveError('Password must be at least 8 characters.')
      return
    }
    setSaving(true)
    setSaveError(null)
    const settings: Record<string, unknown> = {}
    if (form.ownerName.trim()) settings.owner_name = form.ownerName.trim()
    if (form.password.trim()) settings.password = form.password.trim()
    const { error } = await supabase.from('restaurants').insert({
      name:     form.name.trim(),
      email:    form.email.trim() || null,
      phone:    form.phone.trim() || null,
      plan:     form.plan,
      status:   'trial',
      settings,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setShowAddModal(false)
    setForm(emptyForm)
    setShowPassword(false)
    load()
  }

  const openEdit = (r: Restaurant) => {
    const s = r.settings as Record<string, unknown>
    const ownerName = (s?.owner_name as string) ?? ''
    const modules   = (s?.modules as Record<string, boolean>) ?? {}
    setEditForm({ name: r.name, ownerName, email: r.email ?? '', phone: r.phone ?? '', plan: r.plan, password: '' })
    setEditModules(modules)
    setEditTab('details')
    setEditError(null)
    setShowEditPassword(false)
    setEditingRestaurant(r)
    setActiveMenu(null)
  }

  const isModuleOn = (key: string) => editModules[key] !== false
  const toggleModule = (key: string) =>
    setEditModules(prev => ({ ...prev, [key]: !isModuleOn(key) }))

  const handleEdit = async () => {
    if (!editingRestaurant || !editForm.name.trim()) return
    if (editForm.password.length > 0 && editForm.password.length < 8) {
      setEditError('Password must be at least 8 characters.')
      return
    }
    setEditSaving(true)
    setEditError(null)
    const settings: Record<string, unknown> = { ...(editingRestaurant.settings ?? {}) }
    if (editForm.ownerName.trim()) settings.owner_name = editForm.ownerName.trim()
    if (editForm.password.trim()) settings.password = editForm.password.trim()
    settings.modules = editModules
    const { error } = await supabase.from('restaurants').update({
      name:  editForm.name.trim(),
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      plan:  editForm.plan,
      settings,
    }).eq('id', editingRestaurant.id)
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setEditingRestaurant(null)
    load()
  }

  const handleStatusToggle = async (r: Restaurant) => {
    const next = r.status === 'active' ? 'suspended' : 'active'
    await supabase.from('restaurants').update({ status: next }).eq('id', r.id)
    setRestaurants(prev => prev.map(x => x.id === r.id ? { ...x, status: next as RestaurantStatus } : x))
    setActiveMenu(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this restaurant? This cannot be undone.')) return
    await supabase.from('restaurants').delete().eq('id', id)
    setRestaurants(prev => prev.filter(x => x.id !== id))
    setActiveMenu(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Restaurants</h1>
          <p className="text-white/40 mt-1">Manage all restaurant clients and their access</p>
        </div>
        <button
          onClick={() => { setShowAddModal(true); setSaveError(null) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-500/25"
        >
          <Plus className="w-4 h-4" />
          Add Restaurant
        </button>
      </div>

      {/* Filters */}
      <GlassCard>
        <GlassCardBody className="py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search restaurants..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-white/30" />
              {['all', 'active', 'trial', 'suspended', 'expired'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                    statusFilter === s
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-white/30">{filtered.length} restaurants</span>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </div>
          </div>
        </GlassCardBody>
      </GlassCard>

      {/* Table */}
      <GlassCard>
        <div className="overflow-visible">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Store className="w-10 h-10 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 text-sm">No restaurants found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Restaurant', 'Contact', 'Plan', 'Status', 'Created', ''].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const ownerName = (r.settings as Record<string, unknown>)?.owner_name as string | undefined
                  return (
                    <tr
                      key={r.id}
                      className={cn('hover:bg-white/3 transition-colors', i !== filtered.length - 1 && 'border-b border-white/5')}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-600/20 border border-white/10 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {r.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{r.name}</p>
                            {ownerName && <p className="text-xs text-white/35">{ownerName}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-white/60">{r.email ?? '—'}</p>
                        {r.phone && <p className="text-xs text-white/30">{r.phone}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          'text-xs font-medium px-2.5 py-1 rounded-lg',
                          r.plan === 'enterprise'    ? 'bg-amber-500/15 text-amber-400' :
                          r.plan === 'professional'  ? 'bg-indigo-500/15 text-indigo-400' :
                          'bg-slate-500/15 text-slate-400'
                        )}>
                          {PLAN_LABELS[r.plan] ?? r.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={r.status}>{r.status}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-white/40">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
                          <button
                            onClick={() => setActiveMenu(activeMenu === r.id ? null : r.id)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-all"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {activeMenu === r.id && (
                            <div className="absolute right-0 top-8 z-50 w-44 rounded-xl border border-white/10 bg-[#0f1629]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                              {[
                                { icon: Eye, label: 'View Details', color: 'text-white/70', action: () => setActiveMenu(null) },
                                { icon: Edit, label: 'Edit', color: 'text-white/70', action: () => openEdit(r) },
                                {
                                  icon: r.status === 'active' ? Ban : CheckCircle,
                                  label: r.status === 'active' ? 'Suspend' : 'Activate',
                                  color: r.status === 'active' ? 'text-amber-400' : 'text-emerald-400',
                                  action: () => handleStatusToggle(r),
                                },
                                { icon: Trash2, label: 'Delete', color: 'text-rose-400', action: () => handleDelete(r.id) },
                              ].map(a => (
                                <button
                                  key={a.label}
                                  onClick={a.action}
                                  className={cn('flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-white/5 transition-colors', a.color)}
                                >
                                  <a.icon className="w-4 h-4" />
                                  {a.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>

      {/* Edit Restaurant Modal */}
      {editingRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditingRestaurant(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0d1526]/95 backdrop-blur-2xl shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">Edit Restaurant</h2>
                <p className="text-sm text-white/40 mt-0.5">{editingRestaurant.name}</p>
              </div>
              <button onClick={() => setEditingRestaurant(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-4 shrink-0 flex gap-1 p-1">
              {([['details', 'Details', Edit], ['modules', 'Module Access', Layers]] as const).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  onClick={() => setEditTab(tab)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    editTab === tab
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {editTab === 'details' ? (
                <>
                  {[
                    { label: 'Restaurant Name *', key: 'name', placeholder: 'e.g. Spice Garden', type: 'text' },
                    { label: 'Owner Full Name', key: 'ownerName', placeholder: 'e.g. Ahmad Karimi', type: 'text' },
                    { label: 'Owner Email', key: 'email', placeholder: 'owner@restaurant.com', type: 'email' },
                    { label: 'Phone Number', key: 'phone', placeholder: '+964 XXX XXX XXXX', type: 'tel' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">{f.label}</label>
                      <input
                        type={f.type}
                        placeholder={f.placeholder}
                        value={editForm[f.key as keyof typeof editForm]}
                        onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
                      />
                    </div>
                  ))}

                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">
                      New Password <span className="text-white/25">(leave blank to keep current)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showEditPassword ? 'text' : 'password'}
                        placeholder="Min. 8 characters"
                        value={editForm.password}
                        onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                        className="w-full px-4 py-2.5 pr-11 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                      >
                        {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Subscription Plan</label>
                    <select
                      value={editForm.plan}
                      onChange={e => setEditForm(p => ({ ...p, plan: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none"
                    >
                      <option value="starter"      className="bg-[#0d1526]">Starter — $49/mo</option>
                      <option value="professional" className="bg-[#0d1526]">Professional — $149/mo</option>
                      <option value="enterprise"   className="bg-[#0d1526]">Enterprise — $299/mo</option>
                    </select>
                  </div>
                </>
              ) : (
                /* Modules tab */
                <div className="space-y-5">
                  <p className="text-xs text-white/40 leading-relaxed">
                    Toggle which modules this restaurant can access. Disabled modules show an upgrade wall to the restaurant owner.
                  </p>
                  {MODULE_CATEGORIES.map(cat => {
                    const catModules = MODULES.filter(m => m.category === cat)
                    return (
                      <div key={cat}>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">{cat}</p>
                        <div className="space-y-1">
                          {catModules.map(mod => {
                            const on = isModuleOn(mod.key)
                            return (
                              <div
                                key={mod.key}
                                className={cn(
                                  'flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
                                  on
                                    ? 'bg-white/4 border-white/8'
                                    : 'bg-white/2 border-white/5 opacity-60'
                                )}
                              >
                                <div className="min-w-0 mr-3">
                                  <p className="text-sm font-medium text-white">{mod.label}</p>
                                  <p className="text-xs text-white/35 mt-0.5">{mod.description}</p>
                                </div>
                                <button
                                  onClick={() => toggleModule(mod.key)}
                                  className={cn(
                                    'relative shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none',
                                    on ? 'bg-indigo-500' : 'bg-white/15'
                                  )}
                                >
                                  <span className={cn(
                                    'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                                    on ? 'left-[22px]' : 'left-0.5'
                                  )} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {editError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{editError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 flex gap-3 shrink-0">
              <button
                onClick={() => setEditingRestaurant(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={!editForm.name.trim() || editSaving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
              >
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit className="w-4 h-4" />}
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Restaurant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0d1526]/95 backdrop-blur-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Add New Restaurant</h2>
                <p className="text-sm text-white/40 mt-1">Create a new restaurant account</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {[
                { label: 'Restaurant Name *', key: 'name', placeholder: 'e.g. Spice Garden', type: 'text' },
                { label: 'Owner Full Name', key: 'ownerName', placeholder: 'e.g. Ahmad Karimi', type: 'text' },
                { label: 'Owner Email', key: 'email', placeholder: 'owner@restaurant.com', type: 'email' },
                { label: 'Phone Number', key: 'phone', placeholder: '+964 XXX XXX XXXX', type: 'tel' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full px-4 py-2.5 pr-11 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Subscription Plan</label>
                <select
                  value={form.plan}
                  onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none"
                >
                  <option value="starter"      className="bg-[#0d1526]">Starter — $49/mo</option>
                  <option value="professional" className="bg-[#0d1526]">Professional — $149/mo</option>
                  <option value="enterprise"   className="bg-[#0d1526]">Enterprise — $299/mo</option>
                </select>
              </div>

              {saveError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{saveError}</p>
              )}
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!form.name.trim() || saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                {saving ? 'Creating…' : 'Create Restaurant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
