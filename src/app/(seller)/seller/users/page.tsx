'use client'
import { useState, useEffect, useCallback } from 'react'
import { GlassCard, GlassCardHeader } from '@/components/ui/glass-card'
import { StatCard } from '@/components/ui/stat-card'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { cn } from '@/lib/utils'
import { Users, Shield, UserCheck, UserX, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type StaffRow = {
  id:            string
  name:          string
  email:         string | null
  role:          string
  status:        string
  created_at:    string
  restaurant_id: string
  restaurants:   { name: string } | null
}

const ROLE_COLORS: Record<string, string> = {
  owner:   'bg-violet-500/15 text-violet-400',
  manager: 'bg-indigo-500/15 text-indigo-400',
  cashier: 'bg-amber-500/15 text-amber-400',
  waiter:  'bg-emerald-500/15 text-emerald-400',
  kitchen: 'bg-rose-500/15 text-rose-400',
  staff:   'bg-white/10 text-white/50',
}

export default function SellerUsersPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [staff, setStaff]     = useState<StaffRow[]>([])
  const [search, setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('staff')
      .select('id, name, email, role, status, created_at, restaurant_id, restaurants(name)')
      .order('created_at', { ascending: false })
    setStaff((data ?? []) as unknown as StaffRow[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = staff.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.restaurants?.name ?? '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    )
  })

  const active    = staff.filter(u => u.status === 'active').length
  const inactive  = staff.filter(u => u.status !== 'active').length
  const owners    = staff.filter(u => u.role === 'owner').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">All Users</h1>
        <p className="text-white/40 mt-1">System-wide user accounts across all restaurants</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Users" value={loading ? '—' : String(staff.length)} icon={Users}     color="indigo"  />
        <StatCard title="Active"      value={loading ? '—' : String(active)}       icon={UserCheck} color="emerald" />
        <StatCard title="Inactive"    value={loading ? '—' : String(inactive)}     icon={UserX}     color="rose"    />
        <StatCard title="Owners"      value={loading ? '—' : String(owners)}       icon={Shield}    color="violet"  />
      </div>

      <GlassCard>
        <GlassCardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">User Accounts</h2>
              <p className="text-xs text-white/40 mt-0.5">All staff across all restaurants</p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
          </div>
        </GlassCardHeader>
        <div>
          {loading ? (
            <div className="p-6"><SkeletonList rows={7} rowHeight="h-[52px]" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 text-sm">{search ? 'No users match your search' : 'No users yet'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['User', 'Restaurant', 'Role', 'Status', 'Joined'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.id} className={cn('hover:bg-white/3 transition-colors', i !== filtered.length - 1 && 'border-b border-white/5')}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/20 border border-white/10 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {(u.name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{u.name ?? '—'}</p>
                          {u.email && <p className="text-xs text-white/35">{u.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-white/60">{u.restaurants?.name ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full capitalize', ROLE_COLORS[u.role] ?? ROLE_COLORS.staff)}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span className="text-sm text-white/50 capitalize">{u.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-white/40">{new Date(u.created_at).toLocaleDateString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
