'use client'
import { useState, useEffect, useCallback } from 'react'
import { StatCard } from '@/components/ui/stat-card'
import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { cn } from '@/lib/utils'
import {
  Store, TrendingUp, DollarSign, Users, Activity,
  Clock, CheckCircle2, AlertCircle, ArrowUpRight, XCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Plan } from './plans/PlanModal'
import type { Restaurant } from './restaurants/types'

const PLAN_GRADIENT: Record<string, { bg: string; border: string; badge: string }> = {
  slate:   { bg: 'from-slate-500/20 to-slate-600/20',   border: 'border-slate-500/20',  badge: 'text-slate-300'  },
  indigo:  { bg: 'from-indigo-500/20 to-violet-600/20', border: 'border-indigo-500/30', badge: 'text-indigo-300' },
  violet:  { bg: 'from-violet-500/20 to-purple-600/20', border: 'border-violet-500/30', badge: 'text-violet-300' },
  emerald: { bg: 'from-emerald-500/20 to-green-600/20', border: 'border-emerald-500/30',badge: 'text-emerald-300'},
  amber:   { bg: 'from-amber-500/20 to-orange-500/20',  border: 'border-amber-500/30',  badge: 'text-amber-300'  },
  rose:    { bg: 'from-rose-500/20 to-red-600/20',      border: 'border-rose-500/30',   badge: 'text-rose-300'   },
  cyan:    { bg: 'from-cyan-500/20 to-sky-600/20',      border: 'border-cyan-500/30',   badge: 'text-cyan-300'   },
}

export default function SellerDashboard() {
  const supabase = createClient()
  const [loading, setLoading]         = useState(true)
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [plans, setPlans]             = useState<Plan[]>([])
  const [staffCount, setStaffCount]   = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: rData }, { data: pData }, { count: sCount }] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, name, email, plan, status, created_at, settings')
        .order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('sort_order'),
      supabase.from('staff').select('id', { count: 'exact', head: true }),
    ])
    setRestaurants((rData ?? []) as Restaurant[])
    setPlans((pData ?? []) as Plan[])
    setStaffCount(sCount ?? 0)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const planMap = new Map(plans.map(p => [p.slug, p]))

  const now            = new Date()
  const monthStart     = new Date(now.getFullYear(), now.getMonth(), 1)
  const addedThisMonth = restaurants.filter(r => new Date(r.created_at) >= monthStart).length
  const active         = restaurants.filter(r => r.status === 'active')

  let mrr = 0
  active.forEach(r => {
    const p = planMap.get(r.plan)
    if (p) mrr += p.billing_period === 'yearly' ? p.price / 12 : p.price
  })

  const planDist = plans
    .map(p => ({
      ...p,
      count: restaurants.filter(r => r.plan === p.slug).length,
      theme: PLAN_GRADIENT[p.color] ?? PLAN_GRADIENT.indigo,
    }))
    .filter(p => p.count > 0)

  const recent = restaurants.slice(0, 5)

  const activities = recent.map(r => {
    if (r.status === 'active')    return { icon: CheckCircle2, color: 'text-emerald-400', text: `${r.name} registered`,          time: new Date(r.created_at).toLocaleDateString() }
    if (r.status === 'suspended') return { icon: AlertCircle,  color: 'text-amber-400',   text: `${r.name} account suspended`,    time: new Date(r.created_at).toLocaleDateString() }
    return                               { icon: XCircle,      color: 'text-rose-400',    text: `${r.name} subscription expired`, time: new Date(r.created_at).toLocaleDateString() }
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Seller Dashboard</h1>
        <p className="text-white/40 mt-1">Monitor and manage all restaurant clients</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Restaurants"
          value={loading ? '—' : String(restaurants.length)}
          subtitle={`${addedThisMonth} added this month`}
          icon={Store}
          color="indigo"
        />
        <StatCard
          title="Monthly Revenue"
          value={loading ? '—' : `$${mrr.toLocaleString('en', { maximumFractionDigits: 0 })}`}
          subtitle="Recurring subscriptions"
          icon={DollarSign}
          color="emerald"
        />
        <StatCard
          title="Active Users"
          value={loading ? '—' : String(staffCount)}
          subtitle="Across all restaurants"
          icon={Users}
          color="violet"
        />
        <StatCard
          title="Active Clients"
          value={loading ? '—' : String(active.length)}
          subtitle={`of ${restaurants.length} total`}
          icon={Activity}
          color="cyan"
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Recent Restaurants */}
        <GlassCard className="col-span-2">
          <GlassCardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Recent Restaurants</h2>
                <p className="text-xs text-white/40 mt-0.5">Latest registered clients</p>
              </div>
              <a href="/seller/restaurants" className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                View all <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </GlassCardHeader>
          <GlassCardBody className="px-0 py-0">
            {loading ? (
              <div className="p-6"><SkeletonList rows={5} rowHeight="h-[44px]" /></div>
            ) : recent.length === 0 ? (
              <div className="text-center py-12">
                <Store className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-white/30 text-sm">No restaurants yet</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Restaurant', 'Plan', 'Status', 'Revenue', 'Joined'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => {
                    const plan = planMap.get(r.plan)
                    return (
                      <tr key={r.id} className={cn('hover:bg-white/3 transition-colors', i !== recent.length - 1 && 'border-b border-white/5')}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-white/10 flex items-center justify-center text-xs font-bold text-white">
                              {r.name[0]}
                            </div>
                            <span className="text-sm font-medium text-white">{r.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-white/60">{plan?.name ?? r.plan}</span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={r.status}>{r.status}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-white/70">
                            {plan ? `$${plan.price}/${plan.billing_period === 'monthly' ? 'mo' : 'yr'}` : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-white/40">{new Date(r.created_at).toLocaleDateString()}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </GlassCardBody>
        </GlassCard>

        {/* Activity Feed */}
        <GlassCard>
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Recent Activity</h2>
            <p className="text-xs text-white/40 mt-0.5">System-wide events</p>
          </GlassCardHeader>
          <GlassCardBody className="space-y-4">
            {loading ? (
              <SkeletonList rows={4} rowHeight="h-[52px]" />
            ) : activities.length === 0 ? (
              <p className="text-sm text-white/30">No activity yet</p>
            ) : activities.map((a, i) => (
              <div key={i} className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <a.icon className={`w-4 h-4 ${a.color}`} />
                </div>
                <div>
                  <p className="text-sm text-white/70 leading-snug">{a.text}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3 text-white/25" />
                    <span className="text-xs text-white/30">{a.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </GlassCardBody>
        </GlassCard>
      </div>

      {/* Plan Distribution */}
      {!loading && planDist.length > 0 && (
        <div className={cn(
          'grid gap-4',
          planDist.length === 1 ? 'grid-cols-1 max-w-xs' :
          planDist.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
        )}>
          {planDist.map(p => (
            <GlassCard key={p.slug} className={`bg-gradient-to-br ${p.theme.bg} border ${p.theme.border}`}>
              <GlassCardBody>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-lg font-bold ${p.theme.badge}`}>{p.name}</p>
                    <p className="text-3xl font-bold text-white mt-1">{p.count}</p>
                    <p className="text-sm text-white/40 mt-1">restaurants</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white/60">
                      ${p.price}/{p.billing_period === 'monthly' ? 'mo' : 'yr'}
                    </p>
                    <div className="mt-2">
                      <TrendingUp className="w-8 h-8 text-white/10 ml-auto" />
                    </div>
                  </div>
                </div>
              </GlassCardBody>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  )
}
