'use client'
import { useState } from 'react'
import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { StatCard } from '@/components/ui/stat-card'
import { cn } from '@/lib/utils'
import { Users, Plus, MoreVertical, Mail, Phone, Shield, Edit, Trash2, Key } from 'lucide-react'

type StaffRole = 'manager' | 'cashier' | 'waiter' | 'chef'

interface StaffMember {
  id: string
  name: string
  email: string
  phone: string
  role: StaffRole
  status: 'active' | 'offline'
  since: string
  lastSeen: string
}

const staff: StaffMember[] = [
  { id: '1', name: 'Layla Hassan', email: 'layla@spicegarden.com', phone: '+964 770 111 2222', role: 'manager', status: 'active', since: '2025-06-01', lastSeen: 'Now' },
  { id: '2', name: 'Omar Khalid', email: 'omar@spicegarden.com', phone: '+964 750 333 4444', role: 'cashier', status: 'active', since: '2025-08-15', lastSeen: '5 min ago' },
  { id: '3', name: 'Noor Ahmed', email: 'noor@spicegarden.com', phone: '+964 780 555 6666', role: 'waiter', status: 'active', since: '2026-01-10', lastSeen: '2 min ago' },
  { id: '4', name: 'Soran Ali', email: 'soran@spicegarden.com', phone: '+964 770 777 8888', role: 'waiter', status: 'offline', since: '2026-01-10', lastSeen: '2 hours ago' },
  { id: '5', name: 'Karzan Ibrahim', email: 'karzan@spicegarden.com', phone: '+964 750 999 0000', role: 'chef', status: 'active', since: '2025-09-20', lastSeen: 'Now' },
]

const roleConfig: Record<StaffRole, { label: string; color: string; bg: string }> = {
  manager: { label: 'Manager', color: 'text-violet-400', bg: 'bg-violet-500/15' },
  cashier: { label: 'Cashier', color: 'text-indigo-400', bg: 'bg-indigo-500/15' },
  waiter: { label: 'Waiter', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  chef: { label: 'Chef', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
}

const permissions: Record<StaffRole, string[]> = {
  manager: ['View Dashboard', 'Manage Orders', 'Manage Menu', 'Manage Staff', 'View Reports', 'Manage Tables'],
  cashier: ['View Dashboard', 'Manage Orders', 'Process Payments', 'View Reports'],
  waiter: ['View Dashboard', 'Manage Orders', 'Manage Tables'],
  chef: ['View Dashboard', 'View Orders', 'Update Order Status'],
}

export default function StaffPage() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedRole, setSelectedRole] = useState<StaffRole>('waiter')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Staff Management</h1>
          <p className="text-white/40 mt-1">Manage your team and their access permissions</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-all shadow-lg shadow-amber-500/25"
        >
          <Plus className="w-4 h-4" />
          Add Staff Member
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Staff" value={staff.length.toString()} icon={Users} color="amber" />
        <StatCard title="Active Now" value={staff.filter(s => s.status === 'active').length.toString()} icon={Users} color="emerald" />
        <StatCard title="Managers" value="1" icon={Shield} color="violet" />
        <StatCard title="Cashiers" value="1" icon={Users} color="indigo" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Staff List */}
        <GlassCard className="col-span-2">
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Team Members</h2>
            <p className="text-xs text-white/40 mt-0.5">{staff.length} members · {staff.filter(s => s.status === 'active').length} active</p>
          </GlassCardHeader>
          <GlassCardBody className="space-y-3 py-4">
            {staff.map((member) => {
              const rc = roleConfig[member.role]
              return (
                <div key={member.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/30 to-orange-500/20 border border-white/10 flex items-center justify-center text-sm font-bold text-white">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#080b14]',
                      member.status === 'active' ? 'bg-emerald-400' : 'bg-white/20'
                    )} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{member.name}</p>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', rc.bg, rc.color)}>
                        {rc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-white/25" />
                        <span className="text-xs text-white/40 truncate">{member.email}</span>
                      </div>
                      <span className="text-xs text-white/20">·</span>
                      <span className="text-xs text-white/30">{member.lastSeen}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setActiveMenu(activeMenu === member.id ? null : member.id)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-all"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeMenu === member.id && (
                      <div className="absolute right-0 top-8 z-10 w-40 rounded-xl border border-white/10 bg-[#0f1629]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                        {[
                          { icon: Edit, label: 'Edit', color: 'text-white/70' },
                          { icon: Key, label: 'Reset Password', color: 'text-amber-400' },
                          { icon: Trash2, label: 'Remove', color: 'text-rose-400' },
                        ].map(action => (
                          <button
                            key={action.label}
                            className={cn('flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-white/5 transition-colors', action.color)}
                            onClick={() => setActiveMenu(null)}
                          >
                            <action.icon className="w-4 h-4" />
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </GlassCardBody>
        </GlassCard>

        {/* Permissions Overview */}
        <GlassCard>
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Role Permissions</h2>
            <p className="text-xs text-white/40 mt-0.5">Access by role</p>
          </GlassCardHeader>
          <GlassCardBody className="space-y-5">
            {(Object.entries(roleConfig) as [StaffRole, typeof roleConfig[StaffRole]][]).map(([role, cfg]) => (
              <div key={role}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>{cfg.label}</span>
                </div>
                <div className="space-y-1">
                  {permissions[role].map(p => (
                    <div key={p} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      <span className="text-xs text-white/50">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </GlassCardBody>
        </GlassCard>
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0d1526]/95 backdrop-blur-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">Add Staff Member</h2>
              <p className="text-sm text-white/40 mt-1">Invite a new team member to your restaurant</p>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Full Name', placeholder: 'e.g. Layla Hassan', type: 'text' },
                { label: 'Email Address', placeholder: 'staff@restaurant.com', type: 'email' },
                { label: 'Phone Number', placeholder: '+964 XXX XXX XXXX', type: 'tel' },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(roleConfig) as [StaffRole, typeof roleConfig[StaffRole]][]).map(([role, cfg]) => (
                    <button
                      key={role}
                      onClick={() => setSelectedRole(role)}
                      className={cn(
                        'px-4 py-2.5 rounded-xl text-sm font-medium transition-all border',
                        selectedRole === role
                          ? `${cfg.bg} ${cfg.color} border-current/30`
                          : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/8'
                      )}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permission Preview */}
              <div className="p-3 rounded-xl bg-white/3 border border-white/5">
                <p className="text-xs font-medium text-white/50 mb-2">Permissions for {roleConfig[selectedRole].label}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {permissions[selectedRole].map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/40">{p}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-sm font-medium text-white transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2">
                <Mail className="w-4 h-4" />
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
