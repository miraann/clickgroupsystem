import { StatCard } from '@/components/ui/stat-card'
import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import {
  Store,
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
} from 'lucide-react'

const recentRestaurants = [
  { id: '1', name: 'Spice Garden', plan: 'professional', status: 'active' as const, joined: '2026-03-20', revenue: '$149/mo' },
  { id: '2', name: 'The Golden Fork', plan: 'enterprise', status: 'active' as const, joined: '2026-03-18', revenue: '$299/mo' },
  { id: '3', name: 'Sushi Matsuri', plan: 'starter', status: 'trial' as const, joined: '2026-03-15', revenue: 'Trial' },
  { id: '4', name: 'Casa del Gusto', plan: 'professional', status: 'active' as const, joined: '2026-03-10', revenue: '$149/mo' },
  { id: '5', name: 'Burger Republic', plan: 'starter', status: 'suspended' as const, joined: '2026-02-28', revenue: '$49/mo' },
]

const activities = [
  { icon: CheckCircle2, color: 'text-emerald-400', text: 'Spice Garden activated Professional plan', time: '2 hours ago' },
  { icon: Store, color: 'text-indigo-400', text: 'New restaurant "Sushi Matsuri" registered', time: '5 hours ago' },
  { icon: AlertCircle, color: 'text-amber-400', text: 'Burger Republic subscription expired', time: '1 day ago' },
  { icon: Users, color: 'text-violet-400', text: 'The Golden Fork added 3 new staff members', time: '2 days ago' },
]

export default function SellerDashboard() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Seller Dashboard</h1>
        <p className="text-white/40 mt-1">Monitor and manage all restaurant clients</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Restaurants"
          value="24"
          subtitle="5 added this month"
          icon={Store}
          trend={{ value: 20, positive: true }}
          color="indigo"
        />
        <StatCard
          title="Monthly Revenue"
          value="$4,280"
          subtitle="Recurring subscriptions"
          icon={DollarSign}
          trend={{ value: 12, positive: true }}
          color="emerald"
        />
        <StatCard
          title="Active Users"
          value="186"
          subtitle="Across all restaurants"
          icon={Users}
          trend={{ value: 8, positive: true }}
          color="violet"
        />
        <StatCard
          title="Avg. Uptime"
          value="99.9%"
          subtitle="Last 30 days"
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
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-3">Restaurant</th>
                  <th className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-3">Plan</th>
                  <th className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-3">Revenue</th>
                  <th className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {recentRestaurants.map((r, i) => (
                  <tr key={r.id} className={`hover:bg-white/3 transition-colors ${i !== recentRestaurants.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-white/10 flex items-center justify-center text-xs font-bold text-white">
                          {r.name[0]}
                        </div>
                        <span className="text-sm font-medium text-white">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-white/60 capitalize">{r.plan}</span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={r.status}>{r.status}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-white/70">{r.revenue}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-white/40">{r.joined}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCardBody>
        </GlassCard>

        {/* Activity Feed */}
        <GlassCard>
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Recent Activity</h2>
            <p className="text-xs text-white/40 mt-0.5">System-wide events</p>
          </GlassCardHeader>
          <GlassCardBody className="space-y-4">
            {activities.map((a, i) => (
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
      <div className="grid grid-cols-3 gap-4">
        {[
          { plan: 'Starter', count: 8, price: '$49/mo', color: 'from-slate-500/20 to-slate-600/20', border: 'border-slate-500/20', badge: 'text-slate-300' },
          { plan: 'Professional', count: 12, price: '$149/mo', color: 'from-indigo-500/20 to-violet-600/20', border: 'border-indigo-500/30', badge: 'text-indigo-300' },
          { plan: 'Enterprise', count: 4, price: '$299/mo', color: 'from-amber-500/20 to-orange-500/20', border: 'border-amber-500/30', badge: 'text-amber-300' },
        ].map((p) => (
          <GlassCard key={p.plan} className={`bg-gradient-to-br ${p.color} border ${p.border}`}>
            <GlassCardBody>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-lg font-bold ${p.badge}`}>{p.plan}</p>
                  <p className="text-3xl font-bold text-white mt-1">{p.count}</p>
                  <p className="text-sm text-white/40 mt-1">restaurants</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-white/60">{p.price}</p>
                  <div className="mt-2">
                    <TrendingUp className="w-8 h-8 text-white/10 ml-auto" />
                  </div>
                </div>
              </div>
            </GlassCardBody>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
