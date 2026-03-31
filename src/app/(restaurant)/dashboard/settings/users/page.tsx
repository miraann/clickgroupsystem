'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight,
  Key, Shield, Search, ChevronDown, Loader2,
} from 'lucide-react'

type Role = 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef'
type Status = 'active' | 'inactive'

interface StaffUser {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  pin: string
  color: string
  status: Status
}

const ROLES: { value: Role; label: string; color: string; bg: string; gradColor: string; permissions: string[] }[] = [
  { value: 'owner',   label: 'Owner',   color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/25',  gradColor: 'from-violet-500 to-purple-600',
    permissions: ['Full access to all features', 'Manage staff & roles', 'View all reports', 'Change settings'] },
  { value: 'manager', label: 'Manager', color: 'text-indigo-400', bg: 'bg-indigo-500/15 border-indigo-500/25',  gradColor: 'from-indigo-500 to-blue-600',
    permissions: ['Manage orders', 'Manage menu', 'View reports', 'Manage tables', 'Apply discounts'] },
  { value: 'cashier', label: 'Cashier', color: 'text-amber-400',  bg: 'bg-amber-500/15 border-amber-500/25',    gradColor: 'from-emerald-500 to-teal-600',
    permissions: ['Process orders', 'Accept payments', 'Apply discounts', 'View daily report'] },
  { value: 'waiter',  label: 'Waiter',  color: 'text-emerald-400',bg: 'bg-emerald-500/15 border-emerald-500/25', gradColor: 'from-amber-500 to-orange-500',
    permissions: ['Create orders', 'Manage tables', 'Send to kitchen'] },
  { value: 'chef',    label: 'Chef',    color: 'text-rose-400',   bg: 'bg-rose-500/15 border-rose-500/25',      gradColor: 'from-rose-500 to-pink-600',
    permissions: ['View kitchen orders', 'Update order status'] },
]

const ROLE_COLORS: Record<Role, string> = {
  owner:   'from-violet-500 to-purple-600',
  manager: 'from-indigo-500 to-blue-600',
  cashier: 'from-emerald-500 to-teal-600',
  waiter:  'from-amber-500 to-orange-500',
  chef:    'from-rose-500 to-pink-600',
}

const EMPTY: Omit<StaffUser, 'id'> = {
  name: '', email: '', phone: '', role: 'waiter', pin: '', color: ROLE_COLORS.waiter, status: 'active',
}

function roleConfig(role: Role) { return ROLES.find(r => r.value === role)! }

export default function UsersPage() {
  const supabase = createClient()
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [users, setUsers]     = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const [modal, setModal]               = useState<'add-edit' | 'permissions' | 'reset-pin' | null>(null)
  const [editId, setEditId]             = useState<string | null>(null)
  const [form, setForm]                 = useState<Omit<StaffUser, 'id'>>(EMPTY)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [filterRole, setFilterRole]     = useState<Role | 'all'>('all')
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null)
  const [newPin, setNewPin]             = useState('')
  const [showPins, setShowPins]         = useState(false)
  const [roleDropdown, setRoleDropdown] = useState(false)

  // Load restaurant + staff from DB
  useEffect(() => {
    const load = async () => {
      const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
      if (!rest) { setLoading(false); return }
      setRestaurantId(rest.id)

      const { data } = await supabase
        .from('staff')
        .select('*')
        .eq('restaurant_id', rest.id)
        .order('created_at')
      setUsers((data ?? []).map(s => ({
        id:     s.id,
        name:   s.name,
        email:  s.email  ?? '',
        phone:  s.phone  ?? '',
        role:   s.role   as Role,
        pin:    s.pin,
        color:  s.color  ?? ROLE_COLORS[s.role as Role],
        status: s.status as Status,
      })))
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  function openAdd() {
    setEditId(null)
    setForm(EMPTY)
    setModal('add-edit')
  }
  function openEdit(u: StaffUser) {
    setEditId(u.id)
    setForm({ name: u.name, email: u.email, phone: u.phone, role: u.role, pin: u.pin, color: u.color, status: u.status })
    setModal('add-edit')
  }
  function openPermissions(u: StaffUser) { setSelectedUser(u); setModal('permissions') }
  function openResetPin(u: StaffUser)    { setSelectedUser(u); setNewPin(''); setModal('reset-pin') }

  async function save() {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)
    const color = ROLE_COLORS[form.role]
    if (editId) {
      const { data } = await supabase
        .from('staff')
        .update({ name: form.name, email: form.email || null, phone: form.phone || null,
                  role: form.role, pin: form.pin, color, status: form.status,
                  updated_at: new Date().toISOString() })
        .eq('id', editId)
        .select()
        .single()
      if (data) setUsers(us => us.map(u => u.id === editId
        ? { ...u, name: data.name, email: data.email ?? '', phone: data.phone ?? '',
            role: data.role as Role, pin: data.pin, color: data.color, status: data.status as Status }
        : u))
    } else {
      const { data } = await supabase
        .from('staff')
        .insert({ restaurant_id: restaurantId, name: form.name, email: form.email || null,
                  phone: form.phone || null, role: form.role, pin: form.pin, color, status: form.status })
        .select()
        .single()
      if (data) setUsers(us => [...us, {
        id: data.id, name: data.name, email: data.email ?? '', phone: data.phone ?? '',
        role: data.role as Role, pin: data.pin, color: data.color, status: data.status as Status,
      }])
    }
    setSaving(false)
    setModal(null)
  }

  async function savePin() {
    if (newPin.length !== 4 || !selectedUser) return
    setSaving(true)
    await supabase.from('staff').update({ pin: newPin, updated_at: new Date().toISOString() }).eq('id', selectedUser.id)
    setUsers(us => us.map(u => u.id === selectedUser.id ? { ...u, pin: newPin } : u))
    setSaving(false)
    setModal(null)
  }

  async function del(id: string) {
    if (deleteConfirm === id) {
      await supabase.from('staff').delete().eq('id', id)
      setUsers(us => us.filter(u => u.id !== id))
      setDeleteConfirm(null)
    } else {
      setDeleteConfirm(id)
      setTimeout(() => setDeleteConfirm(d => d === id ? null : d), 3000)
    }
  }

  async function toggleStatus(u: StaffUser) {
    const next: Status = u.status === 'active' ? 'inactive' : 'active'
    await supabase.from('staff').update({ status: next, updated_at: new Date().toISOString() }).eq('id', u.id)
    setUsers(us => us.map(s => s.id === u.id ? { ...s, status: next } : s))
  }

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = filterRole === 'all' || u.role === filterRole
    return matchSearch && matchRole
  })

  const rc = roleConfig(form.role)

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Users className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Users</h1>
            <p className="text-xs text-white/40">Staff accounts and access control</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{users.length}</span>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 touch-manipulation transition-all shadow-lg shadow-amber-500/20">
          <Plus className="w-4 h-4" />Add User
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..."
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {(['all', ...ROLES.map(r => r.value)] as (Role | 'all')[]).map(r => (
            <button key={r} onClick={() => setFilterRole(r)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap capitalize transition-all active:scale-95',
                filterRole === r ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/60')}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle show PINs */}
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowPins(p => !p)}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
          <Key className="w-3.5 h-3.5" />
          {showPins ? 'Hide PINs' : 'Show PINs'}
        </button>
      </div>

      {/* User list */}
      <div className="space-y-2">
        {filtered.map(u => {
          const rc = roleConfig(u.role)
          return (
            <div key={u.id}
              className={cn('flex items-center gap-3 p-4 bg-white/5 border rounded-2xl transition-all hover:border-white/15',
                u.status === 'active' ? 'border-white/10' : 'border-white/5 opacity-60')}>

              {/* Avatar */}
              <div className="relative shrink-0">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white border', rc.bg)}>
                  {u.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#060810]',
                  u.status === 'active' ? 'bg-emerald-400' : 'bg-white/20')} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium border', rc.bg, rc.color)}>
                    {rc.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {u.email && <span className="text-xs text-white/35 truncate">{u.email}</span>}
                  {showPins && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white/8 text-white/50">
                      PIN: {u.pin}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => openPermissions(u)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-violet-500/15 flex items-center justify-center text-white/30 hover:text-violet-400 transition-all active:scale-95"
                  title="View permissions">
                  <Shield className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => openResetPin(u)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-amber-500/15 flex items-center justify-center text-white/30 hover:text-amber-400 transition-all active:scale-95"
                  title="Reset PIN">
                  <Key className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggleStatus(u)} className="active:scale-95" title={u.status === 'active' ? 'Deactivate' : 'Activate'}>
                  {u.status === 'active'
                    ? <ToggleRight className="w-6 h-6 text-amber-400" />
                    : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
                <button onClick={() => openEdit(u)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all active:scale-95">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => del(u.id)}
                  className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium',
                    deleteConfirm === u.id
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
                      : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/30 hover:text-rose-400')}>
                  {deleteConfirm === u.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && !loading && (
          <div className="text-center py-16 text-white/25 text-sm">No users found.</div>
        )}
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {modal === 'add-edit' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/8">
              <h2 className="text-base font-semibold text-white">{editId ? 'Edit User' : 'Add User'}</h2>
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Full Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Layla Hassan"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Email</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="optional"
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="optional"
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
              </div>

              {/* Role dropdown */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Role</label>
                <div className="relative">
                  <button onClick={() => setRoleDropdown(p => !p)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm transition-all hover:border-white/20">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', { owner: 'bg-violet-400', manager: 'bg-indigo-400', cashier: 'bg-amber-400', waiter: 'bg-emerald-400', chef: 'bg-rose-400' }[form.role])} />
                      <span className={rc.color}>{rc.label}</span>
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-white/30 transition-transform', roleDropdown && 'rotate-180')} />
                  </button>
                  {roleDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-[#0d1220] border border-white/15 rounded-xl overflow-hidden shadow-xl">
                      {ROLES.map(r => (
                        <button key={r.value} onClick={() => { set('role', r.value); setRoleDropdown(false) }}
                          className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors',
                            form.role === r.value ? 'bg-white/5' : '')}>
                          <span className={cn('w-2 h-2 rounded-full shrink-0', { owner: 'bg-violet-400', manager: 'bg-indigo-400', cashier: 'bg-amber-400', waiter: 'bg-emerald-400', chef: 'bg-rose-400' }[r.value])} />
                          <span className={r.color}>{r.label}</span>
                          <span className="text-xs text-white/25 ml-auto">{r.permissions.length} perms</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Permission preview */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rc.permissions.map(p => (
                    <span key={p} className={cn('text-[10px] px-2 py-0.5 rounded-full border', rc.bg, rc.color)}>{p}</span>
                  ))}
                </div>
              </div>

              {/* PIN */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">
                  PIN <span className="text-white/25">(4 digits)</span>
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                  <input type="password" maxLength={4} value={form.pin}
                    onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit PIN"
                    className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 transition-colors font-mono tracking-widest" />
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">Active</span>
                <button onClick={() => set('status', form.status === 'active' ? 'inactive' : 'active')} className="active:scale-95">
                  {form.status === 'active' ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-white/8">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
              <button onClick={save} disabled={!form.name.trim() || !form.pin || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editId ? 'Save Changes' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PERMISSIONS MODAL ── */}
      {modal === 'permissions' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-white/8">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-violet-400" />
                <div>
                  <p className="text-sm font-semibold text-white">{selectedUser.name}</p>
                  <p className={cn('text-xs', roleConfig(selectedUser.role).color)}>{roleConfig(selectedUser.role).label}</p>
                </div>
              </div>
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-xs text-white/40 mb-3 uppercase tracking-widest font-semibold">Access Permissions</p>
              <div className="space-y-2">
                {roleConfig(selectedUser.role).permissions.map(p => (
                  <div key={p} className="flex items-center gap-2.5 py-2 border-b border-white/5 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-sm text-white/70">{p}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/25 mt-4 text-center">To change permissions, update the user&apos;s role</p>
            </div>
            <div className="p-5 pt-0">
              <button onClick={() => { setModal(null); openEdit(selectedUser) }}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Change Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET PIN MODAL ── */}
      {modal === 'reset-pin' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-white/8">
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-white">Reset PIN</p>
                  <p className="text-xs text-white/40">{selectedUser.name}</p>
                </div>
              </div>
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-center gap-4 py-4">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={cn('w-4 h-4 rounded-full border-2 transition-all',
                    i < newPin.length ? 'bg-amber-400 border-amber-400 scale-110' : 'bg-transparent border-white/25')} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                  <button key={i} disabled={!k}
                    onClick={() => {
                      if (k === '⌫') setNewPin(p => p.slice(0, -1))
                      else if (newPin.length < 4) setNewPin(p => p + k)
                    }}
                    className={cn('h-12 rounded-xl text-sm font-semibold transition-all active:scale-95',
                      !k ? 'cursor-default' :
                      k === '⌫' ? 'bg-white/5 border border-white/8 text-white/50 hover:bg-white/10' :
                      'bg-white/8 border border-white/12 text-white hover:bg-white/15')}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/8">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
              <button onClick={savePin} disabled={newPin.length !== 4 || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Set New PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
