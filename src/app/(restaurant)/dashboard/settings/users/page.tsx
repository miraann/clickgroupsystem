'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { isModuleEnabled } from '@/lib/modules'
import { QRCodeSVG } from 'qrcode.react'
import {
  Users, Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight,
  Key, Shield, Search, ChevronDown, Loader2,
  Save, Check, ChevronRight, UserCircle, QrCode, Smartphone,
} from 'lucide-react'

// ─── Staff types ────────────────────────────────────────────
type Role = 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef'
type Status = 'active' | 'inactive'
interface StaffUser { id: string; name: string; email: string; phone: string; role: Role; pin: string; color: string; status: Status }

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
const ROLE_COLORS: Record<Role, string> = { owner: 'from-violet-500 to-purple-600', manager: 'from-indigo-500 to-blue-600', cashier: 'from-emerald-500 to-teal-600', waiter: 'from-amber-500 to-orange-500', chef: 'from-rose-500 to-pink-600' }
const EMPTY_STAFF: Omit<StaffUser, 'id'> = { name: '', email: '', phone: '', role: 'waiter', pin: '', color: ROLE_COLORS.waiter, status: 'active' }
function roleConfig(role: Role) { return ROLES.find(r => r.value === role)! }

// ─── Roles/Permissions types ─────────────────────────────────
interface PermNode { key: string; label: string; children?: PermNode[] }
type Permissions = Record<string, boolean>
interface RoleRecord { id: string; name: string; permissions: Permissions; created_at: string }
interface StaffMember { id: string; name: string; email: string; role: string; role_id: string | null }

const PERMISSION_TREE: PermNode[] = [
  {
    key: 'dashboard', label: 'Dashboard',
    children: [
      { key: 'dashboard.access',        label: 'Access Dashboard Page' },
      { key: 'dashboard.pay',           label: 'Pay' },
      { key: 'dashboard.receipt',       label: 'Print Receipt' },
      { key: 'dashboard.drawer',        label: 'Drawer' },
      { key: 'dashboard.member',        label: 'Member' },
      { key: 'dashboard.customer',      label: 'Customer' },
      { key: 'dashboard.surcharge',     label: 'Surcharge' },
      { key: 'dashboard.gratuity',      label: 'Gratuity' },
      { key: 'dashboard.discount',      label: 'Discount' },
      { key: 'dashboard.note',          label: 'Note' },
      { key: 'dashboard.split_bill',    label: 'Split Bill' },
      { key: 'dashboard.pay_later',     label: 'Pay Later' },
      { key: 'dashboard.void',          label: 'Void Item' },
      { key: 'dashboard.item_discount', label: 'Item Discount' },
      { key: 'dashboard.transfer',      label: 'Transfer Item' },
      { key: 'dashboard.price',         label: 'Change Price' },
      { key: 'dashboard.cfd',           label: 'CFD Display' },
    ],
  },
  { key: 'cfd',         label: 'CFD Screen Access' },
  { key: 'dine_in',     label: 'Dine In' },
  { key: 'delivery',    label: 'Delivery' },
  { key: 'takeout',     label: 'Takeout' },
  { key: 'bar',         label: 'Bar (Coffee Bar)' },
  { key: 'kds',         label: 'KDS Monitor' },
  { key: 'guests',      label: 'Guests' },
  { key: 'drawer',      label: 'Drawer' },
  { key: 'reservation', label: 'Reservation' },
  {
    key: 'manage_delivery', label: 'Manage Delivery',
    children: [
      { key: 'manage_delivery.departure',   label: 'Departure / Finish Orders' },
      { key: 'manage_delivery.view_report', label: 'View Report' },
      { key: 'manage_delivery.be_driver',   label: 'Be Delivery Man' },
    ],
  },
  {
    key: 'finance', label: 'Finance',
    children: [
      { key: 'finance.expense',   label: 'Expense' },
      { key: 'finance.pay_later', label: 'Pay Later' },
      { key: 'finance.receipt',   label: 'Receipt History' },
      { key: 'finance.sales',     label: 'Sales Report' },
      { key: 'finance.report',    label: 'Full Report' },
    ],
  },
  {
    key: 'menu', label: 'Menu Management',
    children: [
      { key: 'menu.table_group',    label: 'Table Group' },
      { key: 'menu.table',          label: 'Table' },
      { key: 'menu.category',       label: 'Category' },
      { key: 'menu.item',           label: 'Item' },
      { key: 'menu.modifier',       label: 'Modifier' },
      { key: 'menu.kitchen_note',   label: 'Kitchen Note' },
      { key: 'menu.void_reason',    label: 'Void Reason' },
      { key: 'menu.event_offer',    label: 'Event & Offer' },
      { key: 'menu.discount',       label: 'Discount' },
      { key: 'menu.surcharge',      label: 'Surcharge' },
      { key: 'menu.payment_method', label: 'Payment Method' },
      { key: 'menu.online_menu',    label: 'Online Menu' },
      { key: 'menu.combo_discount', label: 'Combo Discount' },
      { key: 'menu.order_number',   label: 'Order Number' },
      { key: 'menu.invoice_number', label: 'Invoice Number' },
    ],
  },
  {
    key: 'settings', label: 'Settings Access',
    children: [
      { key: 'settings.restaurant_info', label: 'Restaurant Info' },
      { key: 'settings.device',          label: 'Device' },
      { key: 'settings.dine_in',         label: 'Dine In Settings' },
      { key: 'settings.delivery',        label: 'Delivery Settings' },
      { key: 'settings.users',           label: 'Users' },
      { key: 'settings.member',          label: 'Members' },
      { key: 'settings.customer',        label: 'Customers' },
      { key: 'settings.kds_monitor',     label: 'KDS Monitor Settings' },
      { key: 'settings.inventory',       label: 'Inventory' },
    ],
  },
]

// Maps each permission key to the module that must be enabled for it to show.
// null = always visible regardless of module settings.
const PERM_MODULE_MAP: Record<string, string | null> = {
  dashboard: null,
  'dashboard.access':        null,
  'dashboard.pay':           null,
  'dashboard.receipt':       null,
  'dashboard.drawer':        null,
  'dashboard.member':        'member',
  'dashboard.customer':      'customer',
  'dashboard.surcharge':     null,
  'dashboard.gratuity':      null,
  'dashboard.discount':      null,
  'dashboard.note':          null,
  'dashboard.split_bill':    null,
  'dashboard.pay_later':     'pay_later',
  'dashboard.void':          null,
  'dashboard.item_discount': null,
  'dashboard.transfer':      null,
  'dashboard.price':         null,
  'dashboard.cfd':           null,
  cfd: null,
  dine_in: 'dine_in',
  delivery: 'delivery',
  takeout: 'takeout',
  bar: 'bar',
  kds: 'kds',
  guests: 'dine_in',
  drawer: null,
  reservation: 'reservation',
  manage_delivery: 'delivery',
  finance: null,
  menu: 'menu',
  settings: null,
  'finance.expense': 'expense',
  'finance.pay_later': 'pay_later',
  'finance.receipt': null,
  'finance.sales': 'sales',
  'finance.report': 'report',
  'settings.restaurant_info': null,
  'settings.device': null,
  'settings.dine_in': 'dine_in',
  'settings.delivery': 'delivery',
  'settings.users': null,
  'settings.member': 'member',
  'settings.customer': 'customer',
  'settings.kds_monitor': 'kds',
  'settings.inventory': 'inventory',
}

function filterPermTree(tree: PermNode[], modules: Record<string, boolean>): PermNode[] {
  return tree.flatMap(node => {
    const modKey = PERM_MODULE_MAP[node.key] ?? null
    if (modKey !== null && !isModuleEnabled(modules, modKey)) return []
    if (!node.children) return [node]
    const filteredChildren = filterPermTree(node.children, modules)
    if (filteredChildren.length === 0) return []
    return [{ ...node, children: filteredChildren }]
  })
}

function leafKeys(node: PermNode): string[] {
  if (!node.children) return [node.key]
  return node.children.flatMap(leafKeys)
}
function parentState(node: PermNode, perms: Permissions): boolean | 'mixed' {
  if (!node.children) return !!perms[node.key]
  const leaves = leafKeys(node)
  const on = leaves.filter(k => perms[k]).length
  if (on === 0) return false
  if (on === leaves.length) return true
  return 'mixed'
}

function PermRow({ node, perms, depth = 0, onChange }: { node: PermNode; perms: Permissions; depth?: number; onChange: (key: string, val: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const isParent = !!node.children?.length
  const state = isParent ? parentState(node, perms) : !!perms[node.key]
  const checked = state === true
  const mixed = state === 'mixed'
  const toggle = () => {
    if (isParent) { const target = state !== true; leafKeys(node).forEach(k => onChange(k, target)) }
    else onChange(node.key, !checked)
  }
  return (
    <>
      <div className={cn('flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/3 transition-colors', depth > 0 && 'pl-12 bg-black/20')}>
        {isParent
          ? <button onClick={() => setOpen(o => !o)} className="w-5 h-5 flex items-center justify-center text-white/30 hover:text-white/70 transition-colors shrink-0">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          : <span className="w-5 shrink-0" />}
        <button onClick={toggle} className={cn('w-5 h-5 rounded flex items-center justify-center border transition-all shrink-0',
          checked ? 'bg-amber-500 border-amber-500' : mixed ? 'bg-amber-500/40 border-amber-500/60' : 'bg-white/5 border-white/20 hover:border-white/40')}>
          {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          {mixed && <div className="w-2 h-0.5 bg-white rounded-full" />}
        </button>
        <span onClick={isParent ? () => setOpen(o => !o) : toggle}
          className={cn('text-sm flex-1 cursor-pointer select-none', checked || mixed ? 'text-white' : 'text-white/50')}>
          {node.label}
        </span>
      </div>
      {isParent && open && node.children!.map(child => (
        <PermRow key={child.key} node={child} perms={perms} depth={depth + 1} onChange={onChange} />
      ))}
    </>
  )
}

// ─── Main page ───────────────────────────────────────────────
export default function UsersPage() {
  const { t } = useLanguage()
  const supabase = createClient()

  const [pageTab, setPageTab] = useState<'staff' | 'roles'>('staff')
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [restaurantModules, setRestaurantModules] = useState<Record<string, boolean>>({})

  // ── Staff state ──
  const [users, setUsers]           = useState<StaffUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [saving, setSaving]         = useState(false)
  const [modal, setModal]           = useState<'add-edit' | 'permissions' | 'reset-pin' | null>(null)
  const [editId, setEditId]         = useState<string | null>(null)
  const [form, setForm]             = useState<Omit<StaffUser, 'id'>>(EMPTY_STAFF)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null)
  const [newPin, setNewPin]         = useState('')
  const [showPins, setShowPins]     = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)

  // ── Roles state ──
  const [roles, setRoles]           = useState<RoleRecord[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [perms, setPerms]           = useState<Permissions>({})
  const [addingRole, setAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [creatingRole, setCreatingRole] = useState(false)
  const [savingPerms, setSavingPerms] = useState(false)
  const [savedPerms, setSavedPerms] = useState(false)
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)
  const [rightTab, setRightTab]     = useState<'permissions' | 'staff'>('permissions')
  const [roleStaff, setRoleStaff]   = useState<StaffMember[]>([])
  const [loadingRoleStaff, setLoadingRoleStaff] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [editCustomRoleId, setEditCustomRoleId] = useState<string | null>(null)
  const [showQR, setShowQR]                     = useState(false)

  useEffect(() => {
    const rid = localStorage.getItem('restaurant_id') ?? ''
    setRestaurantId(rid || null)
    setMounted(true)
    if (rid) {
      loadUsers(rid)
      loadRoles(rid)
      loadRoleStaff(rid)
      supabase.from('restaurants').select('settings').eq('id', rid).maybeSingle().then(({ data }) => {
        const modules = ((data?.settings as Record<string, unknown>)?.modules ?? {}) as Record<string, boolean>
        setRestaurantModules(modules)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Staff loaders ──
  const loadUsers = async (rid: string) => {
    setLoadingUsers(true)
    const { data } = await supabase.from('staff').select('*').eq('restaurant_id', rid).order('created_at')
    setUsers((data ?? []).map(s => ({ id: s.id, name: s.name, email: s.email ?? '', phone: s.phone ?? '', role: s.role as Role, pin: s.pin, color: s.color ?? ROLE_COLORS[s.role as Role], status: s.status as Status })))
    setLoadingUsers(false)
  }

  // ── Roles loaders ──
  const loadRoles = async (rid: string) => {
    setLoadingRoles(true)
    const { data } = await supabase.from('restaurant_roles').select('*').eq('restaurant_id', rid).order('created_at')
    setRoles((data ?? []) as RoleRecord[])
    setLoadingRoles(false)
  }
  const loadRoleStaff = async (rid: string) => {
    setLoadingRoleStaff(true)
    const { data } = await supabase.from('staff').select('id, name, email, role, role_id').eq('restaurant_id', rid).order('name')
    setRoleStaff((data ?? []) as StaffMember[])
    setLoadingRoleStaff(false)
  }

  // ── Staff actions ──
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))
  function openAdd() { setEditId(null); setForm(EMPTY_STAFF); setEditCustomRoleId(null); setModal('add-edit') }
  function openEdit(u: StaffUser) {
    setEditId(u.id)
    setForm({ name: u.name, email: u.email, phone: u.phone, role: u.role, pin: u.pin, color: u.color, status: u.status })
    setEditCustomRoleId(roleStaff.find(s => s.id === u.id)?.role_id ?? null)
    setModal('add-edit')
  }
  function openPermissions(u: StaffUser) { setSelectedUser(u); setModal('permissions') }
  function openResetPin(u: StaffUser) { setSelectedUser(u); setNewPin(''); setModal('reset-pin') }

  async function saveUser() {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)
    setSaveError(null)
    const color = ROLE_COLORS[form.role]
    // role_id is NOT NULL in DB — fall back to "No Role" role when none selected
    const noRoleId = roles.find(r => r.name === 'No Role')?.id ?? null
    const resolvedRoleId = editCustomRoleId ?? noRoleId
    if (editId) {
      const { data, error } = await supabase.from('staff').update({ name: form.name, email: form.email || null, phone: form.phone || null, role: form.role, pin: form.pin, color, status: form.status, role_id: resolvedRoleId, updated_at: new Date().toISOString() }).eq('id', editId).select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) {
        setUsers(us => us.map(u => u.id === editId ? { ...u, name: data.name, email: data.email ?? '', phone: data.phone ?? '', role: data.role as Role, pin: data.pin, color: data.color, status: data.status as Status } : u))
        setRoleStaff(prev => prev.map(s => s.id === editId ? { ...s, role_id: resolvedRoleId } : s))
      }
    } else {
      const { data, error } = await supabase.from('staff').insert({ restaurant_id: restaurantId, name: form.name, email: form.email || null, phone: form.phone || null, role: form.role, pin: form.pin, color, status: form.status, role_id: resolvedRoleId }).select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) {
        setUsers(us => [...us, { id: data.id, name: data.name, email: data.email ?? '', phone: data.phone ?? '', role: data.role as Role, pin: data.pin, color: data.color, status: data.status as Status }])
        setRoleStaff(prev => [...prev, { id: data.id, name: data.name, email: data.email ?? '', role: data.role, role_id: resolvedRoleId }])
      }
    }
    setSaving(false); setModal(null)
  }
  async function savePin() {
    if (newPin.length !== 4 || !selectedUser) return
    setSaving(true)
    await supabase.from('staff').update({ pin: newPin, updated_at: new Date().toISOString() }).eq('id', selectedUser.id)
    setUsers(us => us.map(u => u.id === selectedUser.id ? { ...u, pin: newPin } : u))
    setSaving(false); setModal(null)
  }
  async function del(id: string) {
    if (deleteConfirm === id) {
      await supabase.from('staff').delete().eq('id', id)
      setUsers(us => us.filter(u => u.id !== id)); setDeleteConfirm(null)
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

  // ── Roles actions ──
  const selectRole = (role: RoleRecord) => { setSelectedRoleId(role.id); setPerms(role.permissions ?? {}); setSavedPerms(false) }
  const changePermission = (key: string, val: boolean) => { setPerms(p => ({ ...p, [key]: val })); setSavedPerms(false) }
  const createRole = async () => {
    if (!restaurantId || !newRoleName.trim()) return
    setCreatingRole(true)
    const { data, error } = await supabase.from('restaurant_roles').insert({ restaurant_id: restaurantId, name: newRoleName.trim(), permissions: {} }).select().single()
    setCreatingRole(false)
    if (!error && data) { setNewRoleName(''); setAddingRole(false); await loadRoles(restaurantId); selectRole(data as RoleRecord) }
  }
  const savePermissions = async () => {
    if (!selectedRoleId || !restaurantId) return
    setSavingPerms(true)
    await supabase.from('restaurant_roles').update({ permissions: perms }).eq('id', selectedRoleId)
    setSavingPerms(false); setSavedPerms(true); loadRoles(restaurantId)
  }
  const deleteRole = async (id: string) => {
    if (!restaurantId) return
    setDeletingRoleId(id)
    await supabase.from('restaurant_roles').delete().eq('id', id)
    setDeletingRoleId(null)
    if (selectedRoleId === id) { setSelectedRoleId(null); setPerms({}) }
    loadRoles(restaurantId)
  }
  const assignRole = async (staffId: string, roleId: string | null) => {
    if (!restaurantId) return
    // role_id is NOT NULL — use "No Role" when unassigning
    const noRoleId = roles.find(r => r.name === 'No Role')?.id ?? null
    const resolvedRoleId = roleId ?? noRoleId
    setAssigningId(staffId)
    await supabase.from('staff').update({ role_id: resolvedRoleId }).eq('id', staffId)
    setRoleStaff(prev => prev.map(s => s.id === staffId ? { ...s, role_id: resolvedRoleId } : s))
    setAssigningId(null)
  }
  const visiblePermTree = filterPermTree(PERMISSION_TREE, restaurantModules)
  const selectAll = () => { const all: Permissions = {}; visiblePermTree.flatMap(n => leafKeys(n)).forEach(k => { all[k] = true }); setPerms(all); setSavedPerms(false) }
  const clearAll = () => { setPerms({}); setSavedPerms(false) }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  )
  const selectedRole = roles.find(r => r.id === selectedRoleId)

  if (!mounted) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center">
          <Users className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Users</h1>
          <p className="text-xs text-white/40">Manage staff accounts and role permissions</p>
        </div>
      </div>

      {/* Page-level tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/4 border border-white/8 w-fit">
        {([['staff', 'Staff', Users], ['roles', 'Role Permissions', Shield]] as const).map(([tab, label, Icon]) => (
          <button key={tab} onClick={() => setPageTab(tab)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              pageTab === tab ? 'bg-amber-500 text-white shadow-sm' : 'text-white/40 hover:text-white/70')}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ══ STAFF TAB ══════════════════════════════════════════════ */}
      {pageTab === 'staff' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{users.length} staff</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowQR(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white/6 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/60 hover:text-white text-sm font-medium rounded-xl active:scale-95 transition-all"
                title="Show POS Login QR Code"
              >
                <QrCode className="w-4 h-4" /> POS QR
              </button>
              <button onClick={openAdd}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all shadow-lg shadow-amber-500/20">
                <Plus className="w-4 h-4" />{t.usr_add}
              </button>
            </div>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search}
              className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setShowPins(p => !p)} className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
              <Key className="w-3.5 h-3.5" />{showPins ? 'Hide PINs' : 'Show PINs'}
            </button>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {filtered.map(u => {
                const customRole = (() => { const cr = roleStaff.find(s => s.id === u.id); return cr?.role_id ? roles.find(r => r.id === cr.role_id) : null })()
                return (
                  <div key={u.id} className={cn('flex items-center gap-3 p-4 bg-white/5 border rounded-2xl transition-all hover:border-white/15', u.status === 'active' ? 'border-white/10' : 'border-white/5 opacity-60')}>
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white border bg-amber-500/15 border-amber-500/25">
                        {u.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#060810]', u.status === 'active' ? 'bg-emerald-400' : 'bg-white/20')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                        {customRole
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium border border-amber-500/30 bg-amber-500/10 text-amber-400">{customRole.name}</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium border border-white/10 bg-white/5 text-white/30">No role</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {u.email && <span className="text-xs text-white/35 truncate">{u.email}</span>}
                        {showPins && <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white/8 text-white/50">PIN: {u.pin}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => openPermissions(u)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-violet-500/15 flex items-center justify-center text-white/30 hover:text-violet-400 transition-all active:scale-95"><Shield className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openResetPin(u)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-amber-500/15 flex items-center justify-center text-white/30 hover:text-amber-400 transition-all active:scale-95"><Key className="w-3.5 h-3.5" /></button>
                      <button onClick={() => toggleStatus(u)} className="active:scale-95">
                        {u.status === 'active' ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                      </button>
                      <button onClick={() => openEdit(u)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-all active:scale-95"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => del(u.id)} className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium', deleteConfirm === u.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/30 hover:text-rose-400')}>
                        {deleteConfirm === u.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <div className="text-center py-16 text-white/25 text-sm">{t.usr_no_data}</div>}
            </div>
          )}
        </>
      )}

      {/* ══ ROLES TAB ══════════════════════════════════════════════ */}
      {pageTab === 'roles' && (
        <div className="flex gap-5 items-start">
          {/* Left: role list */}
          <div className="w-52 shrink-0 space-y-2">
            <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/6 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400/60" />
                <span className="text-xs font-bold text-white/50 uppercase tracking-wider">Roles</span>
                {roles.length > 0 && <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white/40 bg-white/8">{roles.length}</span>}
              </div>
              {loadingRoles ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-white/30" /></div>
              ) : roles.length === 0 ? (
                <p className="text-center py-6 text-xs text-white/25">No roles yet</p>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {roles.map(role => {
                    const staffCount = roleStaff.filter(s => s.role_id === role.id).length
                    return (
                      <div key={role.id} onClick={() => selectRole(role)}
                        className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all group',
                          selectedRoleId === role.id ? 'bg-amber-500/15 border border-amber-500/25 text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5')}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{role.name}</p>
                          {staffCount > 0 && <p className="text-[10px] text-white/30">{staffCount} staff</p>}
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteRole(role.id) }} disabled={deletingRoleId === role.id}
                          className="w-5 h-5 rounded flex items-center justify-center text-white/20 hover:text-rose-400 opacity-0 group-hover:opacity-100 disabled:opacity-50 transition-all shrink-0">
                          {deletingRoleId === role.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {addingRole ? (
              <div className="rounded-2xl border border-white/8 bg-white/3 p-3 space-y-2">
                <input autoFocus value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createRole(); if (e.key === 'Escape') { setAddingRole(false); setNewRoleName('') } }}
                  placeholder="Role name…"
                  className="w-full px-3 py-2 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:border-amber-500/50 outline-none placeholder:text-white/20" />
                <div className="flex gap-1.5">
                  <button onClick={createRole} disabled={creatingRole || !newRoleName.trim()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 disabled:opacity-40 transition-all active:scale-95">
                    {creatingRole ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Create
                  </button>
                  <button onClick={() => { setAddingRole(false); setNewRoleName('') }} className="px-3 py-2 rounded-xl text-xs text-white/30 hover:text-white/60 bg-white/5 transition-all">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingRole(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold text-amber-400 border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-all active:scale-[0.98]">
                <Plus className="w-4 h-4" /> New Role
              </button>
            )}
          </div>

          {/* Right panel */}
          <div className="flex-1 min-w-0">
            {!selectedRole ? (
              <div className="rounded-2xl border border-white/8 bg-white/3 flex flex-col items-center justify-center h-64 gap-3">
                <Shield className="w-10 h-10 text-white/10" />
                <p className="text-sm text-white/30">Select a role from the left to edit</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/6 flex items-center gap-3">
                  <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm font-bold text-white">{selectedRole.name}</span>
                  <div className="flex gap-1 ml-4 p-0.5 rounded-lg bg-white/5 border border-white/8">
                    {(['permissions', 'staff'] as const).map(tab => (
                      <button key={tab} onClick={() => setRightTab(tab)}
                        className={cn('px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize', rightTab === tab ? 'bg-amber-500 text-white shadow-sm' : 'text-white/40 hover:text-white/70')}>
                        {tab === 'staff'
                          ? <span className="flex items-center gap-1.5"><Users className="w-3 h-3" /> Staff</span>
                          : <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> Permissions</span>}
                      </button>
                    ))}
                  </div>
                  {rightTab === 'permissions' && (
                    <div className="ml-auto flex items-center gap-3">
                      {savedPerms && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="w-3 h-3" /> Saved</span>}
                      <button onClick={savePermissions} disabled={savingPerms}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 transition-all active:scale-95">
                        {savingPerms ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                      </button>
                    </div>
                  )}
                </div>

                {rightTab === 'permissions' && (
                  <>
                    <div className="px-5 py-2 border-b border-white/4 flex items-center gap-3">
                      <button onClick={selectAll} className="text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors">Select All</button>
                      <span className="text-white/15">·</span>
                      <button onClick={clearAll} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Clear All</button>
                    </div>
                    <div>{visiblePermTree.map(node => <PermRow key={node.key} node={node} perms={perms} onChange={changePermission} />)}</div>
                  </>
                )}

                {rightTab === 'staff' && (
                  <div className="p-4">
                    <p className="text-xs text-white/30 mb-3">Staff assigned to <span className="text-amber-400 font-semibold">{selectedRole.name}</span> will inherit its permissions.</p>
                    {loadingRoleStaff ? (
                      <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-white/30" /></div>
                    ) : roleStaff.length === 0 ? (
                      <p className="text-center py-8 text-sm text-white/25">No staff members found</p>
                    ) : (
                      <div className="space-y-2">
                        {roleStaff.map(member => {
                          const isAssigned = member.role_id === selectedRole.id
                          return (
                            <div key={member.id} className={cn('flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all', isAssigned ? 'border-amber-500/30 bg-amber-500/8' : 'border-white/8 bg-white/2')}>
                              <div className="w-8 h-8 rounded-xl bg-white/8 flex items-center justify-center shrink-0">
                                <UserCircle className="w-4 h-4 text-white/40" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{member.name || '—'}</p>
                                <p className="text-[11px] text-white/35 truncate">{member.email} · {member.role}</p>
                              </div>
                              {assigningId === member.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                              ) : isAssigned ? (
                                <button onClick={() => assignRole(member.id, null)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all active:scale-95">
                                  <Check className="w-3 h-3" /> Assigned
                                </button>
                              ) : (
                                <button onClick={() => assignRole(member.id, selectedRole.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white/40 border border-white/10 hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/8 transition-all active:scale-95">
                                  <Plus className="w-3 h-3" /> Assign
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADD/EDIT STAFF MODAL ── */}
      {modal === 'add-edit' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/8">
              <h2 className="text-base font-semibold text-white">{editId ? t.edit : t.usr_add}</h2>
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.usr_name} *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Layla Hassan"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>
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
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Role</label>
                {roles.length === 0 ? (
                  <p className="text-xs text-white/30 py-3 px-3.5 rounded-xl bg-white/3 border border-white/8">
                    No roles yet — create one in the <span className="text-amber-400">Role Permissions</span> tab first.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => setEditCustomRoleId(null)}
                      className={cn('w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm border transition-all',
                        editCustomRoleId === null ? 'bg-white/8 border-white/20 text-white' : 'bg-white/3 border-white/8 text-white/40 hover:border-white/15')}>
                      <span className="w-2 h-2 rounded-full bg-white/20 shrink-0" />
                      None
                    </button>
                    {roles.map(r => (
                      <button key={r.id}
                        onClick={() => setEditCustomRoleId(r.id)}
                        className={cn('w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm border transition-all',
                          editCustomRoleId === r.id ? 'bg-amber-500/15 border-amber-500/30 text-white' : 'bg-white/3 border-white/8 text-white/40 hover:border-white/15')}>
                        <Shield className={cn('w-3.5 h-3.5 shrink-0', editCustomRoleId === r.id ? 'text-amber-400' : 'text-white/25')} />
                        {r.name}
                        {editCustomRoleId === r.id && <Check className="w-3.5 h-3.5 text-amber-400 ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.usr_pin} <span className="text-white/25">(4 digits)</span></label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                  <input type="password" maxLength={4} value={form.pin} onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit PIN"
                    className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 transition-colors font-mono tracking-widest" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">Active</span>
                <button onClick={() => set('status', form.status === 'active' ? 'inactive' : 'active')} className="active:scale-95">
                  {form.status === 'active' ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>
            </div>
            {saveError && (
              <div className="mx-6 mb-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs">
                {saveError}
              </div>
            )}
            <div className="flex gap-3 p-6 border-t border-white/8">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
              <button onClick={saveUser} disabled={!form.name.trim() || !form.pin || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editId ? t.save_changes : t.usr_add}
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
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95"><X className="w-4 h-4" /></button>
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
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Change Role</button>
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
                <div><p className="text-sm font-semibold text-white">Reset PIN</p><p className="text-xs text-white/40">{selectedUser.name}</p></div>
              </div>
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-center gap-4 py-4">
                {[0, 1, 2, 3].map(i => <div key={i} className={cn('w-4 h-4 rounded-full border-2 transition-all', i < newPin.length ? 'bg-amber-400 border-amber-400 scale-110' : 'bg-transparent border-white/25')} />)}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                  <button key={i} disabled={!k}
                    onClick={() => { if (k === '⌫') setNewPin(p => p.slice(0, -1)); else if (newPin.length < 4) setNewPin(p => p + k) }}
                    className={cn('h-12 rounded-xl text-sm font-semibold transition-all active:scale-95', !k ? 'cursor-default' : k === '⌫' ? 'bg-white/5 border border-white/8 text-white/50 hover:bg-white/10' : 'bg-white/8 border border-white/12 text-white hover:bg-white/15')}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/8">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
              <button onClick={savePin} disabled={newPin.length !== 4 || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{t.save_changes}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── QR CODE MODAL ── */}
      {showQR && restaurantId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowQR(false)}>
          <div
            className="relative w-full max-w-sm bg-[#0d1220]/98 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/8">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">POS Login QR</p>
                  <p className="text-xs text-white/40">Scan to open staff PIN login</p>
                </div>
              </div>
              <button onClick={() => setShowQR(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR code */}
            <div className="flex flex-col items-center p-8 gap-5">
              <div className="p-4 bg-white rounded-2xl shadow-xl">
                <QRCodeSVG
                  value={`https://clickgroup.app/pos/${restaurantId}/login`}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#0d1220"
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* URL label */}
              <div className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-center">
                <p className="text-[11px] text-white/35 mb-1 uppercase tracking-wider font-semibold">Login URL</p>
                <p className="text-xs text-amber-400 font-mono break-all leading-relaxed">
                  clickgroup.app/pos/{restaurantId}/login
                </p>
              </div>

              {/* Instructions */}
              <div className="w-full space-y-2">
                <div className="flex items-start gap-2.5 p-3 bg-white/3 rounded-xl">
                  <Smartphone className="w-4 h-4 text-white/40 shrink-0 mt-0.5" />
                  <p className="text-xs text-white/50 leading-relaxed">
                    Print this QR and place it near your POS tablet. Staff scan it to open the PIN login screen instantly.
                  </p>
                </div>
              </div>

              {/* Print button */}
              <button
                onClick={() => window.print()}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-all active:scale-95"
              >
                Print QR Code
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
