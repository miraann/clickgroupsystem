'use client'
import { useState, useEffect, useCallback } from 'react'
import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { cn } from '@/lib/utils'
import { DollarSign, TrendingUp, AlertCircle, CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Plan } from '../plans/PlanModal'
import type { Restaurant } from '../restaurants/types'

const PLAN_BG: Record<string, string> = {
  slate:   'bg-slate-500/15 text-slate-400',
  indigo:  'bg-indigo-500/15 text-indigo-400',
  violet:  'bg-violet-500/15 text-violet-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  amber:   'bg-amber-500/15 text-amber-400',
  rose:    'bg-rose-500/15 text-rose-400',
  cyan:    'bg-cyan-500/15 text-cyan-400',
}

function nextBillingDate(createdAt: string): string {
  const d = new Date(createdAt)
  const today = new Date()
  while (d <= today) d.setMonth(d.getMonth() + 1)
  return d.toLocaleDateString()
}

export default function SubscriptionsPage() {
  const supabase = createClient()
  const [loading, setLoading]         = useState(true)
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [plans, setPlans]             = useState<Plan[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: rData }, { data: pData }] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, name, email, plan, status, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('sort_order'),
    ])
    setRestaurants((rData ?? []) as Restaurant[])
    setPlans((pData ?? []) as Plan[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const planMap = new Map(plans.map(p => [p.slug, p]))
  const active  = restaurants.filter(r => r.status === 'active')
  const expired = restaurants.filter(r => r.status === 'expired').length

  let mrr = 0
  active.forEach(r => {
    const p = planMap.get(r.plan)
    if (p) mrr += p.billing_period === 'yearly' ? p.price / 12 : p.price
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Subscriptions</h1>
        <p className="text-white/40 mt-1">Track all restaurant subscription plans and billing</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="MRR"
          value={loading ? '—' : `$${mrr.toLocaleString('en', { maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          color="emerald"
        />
        <StatCard
          title="ARR"
          value={loading ? '—' : `$${(mrr * 12).toLocaleString('en', { maximumFractionDigits: 0 })}`}
          icon={TrendingUp}
          color="indigo"
        />
        <StatCard
          title="Expired"
          value={loading ? '—' : String(expired)}
          subtitle="Needs renewal"
          icon={AlertCircle}
          color="amber"
        />
        <StatCard
          title="Active Plans"
          value={loading ? '—' : String(active.length)}
          subtitle={`of ${restaurants.length} total`}
          icon={CreditCard}
          color="violet"
        />
      </div>

      <GlassCard>
        <GlassCardHeader>
          <h2 className="text-base font-semibold text-white">All Subscriptions</h2>
        </GlassCardHeader>
        <div>
          {loading ? (
            <div className="p-6"><SkeletonList rows={6} rowHeight="h-[52px]" /></div>
          ) : restaurants.length === 0 ? (
            <div className="text-center py-16">
              <CreditCard className="w-10 h-10 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 text-sm">No subscriptions yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Restaurant', 'Plan', 'Amount', 'Status', 'Next Billing', 'Customer Since'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r, i) => {
                  const plan     = planMap.get(r.plan)
                  const colorCls = plan ? (PLAN_BG[plan.color] ?? PLAN_BG.indigo) : 'bg-white/8 text-white/40'
                  return (
                    <tr key={r.id} className={cn('hover:bg-white/3 transition-colors', i !== restaurants.length - 1 && 'border-b border-white/5')}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/20 border border-white/10 flex items-center justify-center text-xs font-bold text-white">
                            {r.name[0]}
                          </div>
                          <span className="text-sm font-medium text-white">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn('text-xs font-medium px-2.5 py-1 rounded-lg', colorCls)}>
                          {plan?.name ?? r.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {plan ? (
                          <span className="text-sm font-semibold text-white">
                            ${plan.price}
                            <span className="text-white/40 font-normal">/{plan.billing_period === 'monthly' ? 'mo' : 'yr'}</span>
                          </span>
                        ) : <span className="text-white/40 text-sm">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={r.status}>{r.status}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-white/50">
                          {r.status === 'active' ? nextBillingDate(r.created_at) : '—'}
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
        </div>
      </GlassCard>
    </div>
  )
}
