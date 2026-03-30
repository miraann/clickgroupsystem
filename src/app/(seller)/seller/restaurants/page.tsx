'use client'
import { useState } from 'react'
import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import {
  Search, Plus, Store, MoreVertical, Eye, Ban, Trash2,
  Edit, CheckCircle, Filter, Download
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RestaurantStatus } from '@/types'

interface Restaurant {
  id: string
  name: string
  owner: string
  email: string
  plan: string
  status: RestaurantStatus
  users: number
  created: string
  lastActive: string
}

const restaurants: Restaurant[] = [
  { id: '1', name: 'Spice Garden', owner: 'Ahmad Karimi', email: 'ahmad@spicegarden.com', plan: 'Professional', status: 'active', users: 12, created: '2025-11-15', lastActive: 'Today' },
  { id: '2', name: 'The Golden Fork', owner: 'Sara Hassan', email: 'sara@goldenfork.com', plan: 'Enterprise', status: 'active', users: 28, created: '2025-09-03', lastActive: 'Today' },
  { id: '3', name: 'Sushi Matsuri', owner: 'Kenji Tanaka', email: 'kenji@sushimatsuri.com', plan: 'Starter', status: 'trial', users: 3, created: '2026-03-15', lastActive: '2 hours ago' },
  { id: '4', name: 'Casa del Gusto', owner: 'Marco Rossi', email: 'marco@casagusto.com', plan: 'Professional', status: 'active', users: 9, created: '2026-01-20', lastActive: 'Yesterday' },
  { id: '5', name: 'Burger Republic', owner: 'John Smith', email: 'john@burgerrepublic.com', plan: 'Starter', status: 'suspended', users: 5, created: '2025-12-01', lastActive: '5 days ago' },
  { id: '6', name: 'Le Petit Bistro', owner: 'Claire Dupont', email: 'claire@petitbistro.com', plan: 'Professional', status: 'active', users: 7, created: '2026-02-10', lastActive: 'Today' },
  { id: '7', name: 'Noodle House', owner: 'Wei Chen', email: 'wei@noodlehouse.com', plan: 'Starter', status: 'expired', users: 2, created: '2025-10-08', lastActive: '1 month ago' },
]

export default function RestaurantsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const filtered = restaurants.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.owner.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Restaurants</h1>
          <p className="text-white/40 mt-1">Manage all restaurant clients and their access</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
        >
          <Plus className="w-4 h-4" />
          Add Restaurant
        </button>
      </div>

      {/* Filters */}
      <GlassCard>
        <GlassCardBody className="py-4">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search restaurants..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
              />
            </div>

            {/* Status filter */}
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
        <div className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Restaurant', 'Owner', 'Plan', 'Status', 'Users', 'Created', 'Last Active', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className={cn(
                    'hover:bg-white/3 transition-colors',
                    i !== filtered.length - 1 && 'border-b border-white/5'
                  )}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-600/20 border border-white/10 flex items-center justify-center text-sm font-bold text-white shrink-0">
                        {r.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{r.name}</p>
                        <p className="text-xs text-white/35">{r.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/70">{r.owner}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      'text-xs font-medium px-2.5 py-1 rounded-lg',
                      r.plan === 'Enterprise' ? 'bg-amber-500/15 text-amber-400' :
                      r.plan === 'Professional' ? 'bg-indigo-500/15 text-indigo-400' :
                      'bg-slate-500/15 text-slate-400'
                    )}>{r.plan}</span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={r.status}>{r.status}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/60">{r.users}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/40">{r.created}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/40">{r.lastActive}</span>
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
                        <div className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-white/10 bg-[#0f1629]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                          {[
                            { icon: Eye, label: 'View Details', color: 'text-white/70' },
                            { icon: Edit, label: 'Edit', color: 'text-white/70' },
                            { icon: r.status === 'active' ? Ban : CheckCircle, label: r.status === 'active' ? 'Suspend' : 'Activate', color: r.status === 'active' ? 'text-amber-400' : 'text-emerald-400' },
                            { icon: Trash2, label: 'Delete', color: 'text-rose-400' },
                          ].map((action) => (
                            <button
                              key={action.label}
                              className={cn(
                                'flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-white/5 transition-colors',
                                action.color
                              )}
                              onClick={() => setActiveMenu(null)}
                            >
                              <action.icon className="w-4 h-4" />
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Add Restaurant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0d1526]/95 backdrop-blur-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">Add New Restaurant</h2>
              <p className="text-sm text-white/40 mt-1">Create a new restaurant account and send invite</p>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Restaurant Name', placeholder: 'e.g. Spice Garden', type: 'text' },
                { label: 'Owner Full Name', placeholder: 'e.g. Ahmad Karimi', type: 'text' },
                { label: 'Owner Email', placeholder: 'owner@restaurant.com', type: 'email' },
                { label: 'Phone Number', placeholder: '+964 XXX XXX XXXX', type: 'tel' },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Subscription Plan</label>
                <select className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none">
                  <option value="starter" className="bg-[#0d1526]">Starter — $49/mo</option>
                  <option value="professional" className="bg-[#0d1526]">Professional — $149/mo</option>
                  <option value="enterprise" className="bg-[#0d1526]">Enterprise — $299/mo</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2">
                <Store className="w-4 h-4" />
                Create & Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
