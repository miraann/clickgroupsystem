'use client'
import { useState, useEffect, useCallback } from 'react'
import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { StatCard } from '@/components/ui/stat-card'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { BarChart3, TrendingUp, Users, Store } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Plan } from '../plans/PlanModal'
import type { Restaurant } from '../restaurants/types'

function last6Months() {
  const out = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ label: d.toLocaleString('default', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() })
  }
  return out
}

export default function AnalyticsPage() {
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
        .select('id, plan, status, created_at')
        .order('created_at'),
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
  const months  = last6Months()

  const monthlyData = months.map(m => {
    const cumulative = restaurants.filter(r => {
      const d = new Date(r.created_at)
      return d.getFullYear() < m.year || (d.getFullYear() === m.year && d.getMonth() <= m.month)
    })
    let mrr = 0
    cumulative.filter(r => r.status === 'active').forEach(r => {
      const p = planMap.get(r.plan)
      if (p) mrr += p.billing_period === 'yearly' ? p.price / 12 : p.price
    })
    return { label: m.label, total: cumulative.length, mrr }
  })

  const maxMrr  = Math.max(...monthlyData.map(d => d.mrr),   1)
  const maxTotal = Math.max(...monthlyData.map(d => d.total), 1)
  const currentMrr = monthlyData[monthlyData.length - 1]?.mrr ?? 0
  const avgPerClient = restaurants.length > 0 ? Math.round(currentMrr / restaurants.length) : 0

  const planBreakdown = plans.map(p => {
    const count = restaurants.filter(r => r.plan === p.slug).length
    let revenue = 0
    restaurants.filter(r => r.plan === p.slug && r.status === 'active').forEach(() => {
      revenue += p.billing_period === 'yearly' ? p.price / 12 : p.price
    })
    return { ...p, count, revenue }
  }).filter(p => p.count > 0)

  const totalRevenue = planBreakdown.reduce((s, p) => s + p.revenue, 0) || 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <p className="text-white/40 mt-1">Business growth and performance metrics</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Annual Revenue"     value={loading ? '—' : `$${(currentMrr * 12).toLocaleString('en', { maximumFractionDigits: 0 })}`} subtitle="Estimated ARR"       icon={TrendingUp} color="emerald" />
        <StatCard title="Restaurants"        value={loading ? '—' : String(restaurants.length)}                                                                                  icon={Store}      color="indigo"  />
        <StatCard title="Total Staff"        value={loading ? '—' : String(staffCount)}                                                                                          icon={Users}      color="violet"  />
        <StatCard title="Avg Revenue/Client" value={loading ? '—' : `$${avgPerClient}`}                                                              subtitle="MRR per restaurant" icon={BarChart3}  color="amber"   />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* MRR Chart */}
        <GlassCard>
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Monthly Revenue (MRR)</h2>
            <p className="text-xs text-white/40 mt-0.5">Last 6 months</p>
          </GlassCardHeader>
          <GlassCardBody>
            {loading ? <SkeletonList rows={1} rowHeight="h-48" /> : (
              <div className="flex items-end gap-3 h-48">
                {monthlyData.map(d => (
                  <div key={d.label} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs text-white/40">${(d.mrr / 1000).toFixed(1)}k</span>
                    <div className="w-full relative group">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-400 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                        style={{ height: `${(d.mrr / maxMrr) * 140}px`, minHeight: '4px' }}
                      />
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-white/10 backdrop-blur px-2 py-1 rounded text-xs text-white whitespace-nowrap border border-white/10">
                        ${d.mrr.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-xs text-white/50">{d.label}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCardBody>
        </GlassCard>

        {/* Growth Chart */}
        <GlassCard>
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Restaurant Growth</h2>
            <p className="text-xs text-white/40 mt-0.5">Cumulative clients</p>
          </GlassCardHeader>
          <GlassCardBody>
            {loading ? <SkeletonList rows={1} rowHeight="h-48" /> : (
              <div className="flex items-end gap-3 h-48">
                {monthlyData.map(d => (
                  <div key={d.label} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs text-white/40">{d.total}</span>
                    <div className="w-full relative group">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-violet-600 to-violet-400 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                        style={{ height: `${(d.total / maxTotal) * 140}px`, minHeight: '4px' }}
                      />
                    </div>
                    <span className="text-xs text-white/50">{d.label}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCardBody>
        </GlassCard>
      </div>

      {/* Plan Breakdown */}
      {!loading && planBreakdown.length > 0 && (
        <GlassCard>
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Revenue by Plan</h2>
          </GlassCardHeader>
          <GlassCardBody>
            <div className={`grid gap-6 ${
              planBreakdown.length === 1 ? 'grid-cols-1 max-w-sm' :
              planBreakdown.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}>
              {planBreakdown.map(p => (
                <div key={p.slug} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white/70">{p.name}</span>
                    <span className="text-sm font-bold text-white">
                      ${p.revenue.toLocaleString('en', { maximumFractionDigits: 0 })}/mo
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${(p.revenue / totalRevenue) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/40">
                    {p.count} clients · {Math.round((p.revenue / totalRevenue) * 100)}% of revenue
                  </p>
                </div>
              ))}
            </div>
          </GlassCardBody>
        </GlassCard>
      )}
    </div>
  )
}
