'use client'
import { useState, useEffect, useCallback } from 'react'
import { GlassCard, GlassCardBody } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import {
  Search, Plus, Store, MoreVertical, Eye, Ban,
  Trash2, Edit, CheckCircle, Filter, Download, Loader2,
} from 'lucide-react'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Restaurant } from './types'
import { PLAN_LABELS } from './types'
import { AddRestaurantModal } from './AddRestaurantModal'
import { EditRestaurantModal } from './EditRestaurantModal'
import type { RestaurantStatus } from '@/types'

export default function RestaurantsPage() {
  const supabase = createClient()

  const [restaurants, setRestaurants]   = useState<Restaurant[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAdd, setShowAdd]           = useState(false)
  const [editRec, setEditRec]           = useState<Restaurant | null>(null)
  const [activeMenu, setActiveMenu]     = useState<string | null>(null)

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
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-500/25">
          <Plus className="w-4 h-4" />Add Restaurant
        </button>
      </div>

      {/* Filters */}
      <GlassCard>
        <GlassCardBody className="py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input type="text" placeholder="Search restaurants..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-all" />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-white/30" />
              {['all', 'active', 'trial', 'suspended', 'expired'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                    statusFilter === s
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5')}>
                  {s}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-white/30">{filtered.length} restaurants</span>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
                <Download className="w-3.5 h-3.5" />Export
              </button>
            </div>
          </div>
        </GlassCardBody>
      </GlassCard>

      {/* Table */}
      <GlassCard>
        <div className="overflow-visible">
          {loading ? (
            <div className="p-6">
              <SkeletonList rows={5} rowHeight="h-[58px]" />
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
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut', delay: i * 0.03 }}
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
                        <span className={cn('text-xs font-medium px-2.5 py-1 rounded-lg',
                          r.plan === 'enterprise'   ? 'bg-amber-500/15 text-amber-400' :
                          r.plan === 'professional' ? 'bg-indigo-500/15 text-indigo-400' :
                          'bg-slate-500/15 text-slate-400')}>
                          {PLAN_LABELS[r.plan] ?? r.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4"><Badge variant={r.status}>{r.status}</Badge></td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-white/40">{new Date(r.created_at).toLocaleDateString()}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
                          <button onClick={() => setActiveMenu(activeMenu === r.id ? null : r.id)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-all">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {activeMenu === r.id && (
                            <div className="absolute right-0 top-8 z-50 w-44 rounded-xl border border-white/10 bg-[#0f1629]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                              {[
                                { icon: Eye,      label: 'View Details', color: 'text-white/70',   action: () => setActiveMenu(null) },
                                { icon: Edit,     label: 'Edit',         color: 'text-white/70',   action: () => { setEditRec(r); setActiveMenu(null) } },
                                {
                                  icon:   r.status === 'active' ? Ban : CheckCircle,
                                  label:  r.status === 'active' ? 'Suspend' : 'Activate',
                                  color:  r.status === 'active' ? 'text-amber-400' : 'text-emerald-400',
                                  action: () => handleStatusToggle(r),
                                },
                                { icon: Trash2, label: 'Delete', color: 'text-rose-400', action: () => handleDelete(r.id) },
                              ].map(a => (
                                <button key={a.label} onClick={a.action}
                                  className={cn('flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-white/5 transition-colors', a.color)}>
                                  <a.icon className="w-4 h-4" />{a.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>

      {showAdd && (
        <AddRestaurantModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />
      )}

      {editRec && (
        <EditRestaurantModal restaurant={editRec} onClose={() => setEditRec(null)} onSaved={() => { setEditRec(null); load() }} />
      )}
    </div>
  )
}
