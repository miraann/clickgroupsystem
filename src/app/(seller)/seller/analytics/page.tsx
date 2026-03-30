import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { StatCard } from '@/components/ui/stat-card'
import { BarChart3, TrendingUp, Users, Store } from 'lucide-react'

const monthlyData = [
  { month: 'Oct', restaurants: 14, revenue: 2100 },
  { month: 'Nov', restaurants: 16, revenue: 2480 },
  { month: 'Dec', restaurants: 17, revenue: 2650 },
  { month: 'Jan', restaurants: 19, revenue: 2940 },
  { month: 'Feb', restaurants: 21, revenue: 3280 },
  { month: 'Mar', restaurants: 24, revenue: 4280 },
]

const maxRevenue = Math.max(...monthlyData.map(d => d.revenue))
const maxRestaurants = Math.max(...monthlyData.map(d => d.restaurants))

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <p className="text-white/40 mt-1">Business growth and performance metrics</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value="$51,360" subtitle="Annual" icon={TrendingUp} color="emerald" trend={{ value: 23, positive: true }} />
        <StatCard title="Restaurants" value="24" icon={Store} color="indigo" trend={{ value: 20, positive: true }} />
        <StatCard title="Total Users" value="186" icon={Users} color="violet" trend={{ value: 15, positive: true }} />
        <StatCard title="Avg Revenue/Client" value="$178" icon={BarChart3} color="amber" trend={{ value: 5, positive: true }} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <GlassCard>
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Monthly Revenue</h2>
            <p className="text-xs text-white/40 mt-0.5">Last 6 months</p>
          </GlassCardHeader>
          <GlassCardBody>
            <div className="flex items-end gap-3 h-48">
              {monthlyData.map((d) => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs text-white/40">${(d.revenue / 1000).toFixed(1)}k</span>
                  <div className="w-full relative group">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-400 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                      style={{ height: `${(d.revenue / maxRevenue) * 140}px` }}
                    />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-white/10 backdrop-blur px-2 py-1 rounded text-xs text-white whitespace-nowrap border border-white/10">
                      ${d.revenue}
                    </div>
                  </div>
                  <span className="text-xs text-white/50">{d.month}</span>
                </div>
              ))}
            </div>
          </GlassCardBody>
        </GlassCard>

        {/* Restaurants Growth */}
        <GlassCard>
          <GlassCardHeader>
            <h2 className="text-base font-semibold text-white">Restaurant Growth</h2>
            <p className="text-xs text-white/40 mt-0.5">Cumulative clients</p>
          </GlassCardHeader>
          <GlassCardBody>
            <div className="flex items-end gap-3 h-48">
              {monthlyData.map((d) => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs text-white/40">{d.restaurants}</span>
                  <div className="w-full relative group">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-violet-600 to-violet-400 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                      style={{ height: `${(d.restaurants / maxRestaurants) * 140}px` }}
                    />
                  </div>
                  <span className="text-xs text-white/50">{d.month}</span>
                </div>
              ))}
            </div>
          </GlassCardBody>
        </GlassCard>
      </div>

      {/* Plan breakdown */}
      <GlassCard>
        <GlassCardHeader>
          <h2 className="text-base font-semibold text-white">Revenue by Plan</h2>
        </GlassCardHeader>
        <GlassCardBody>
          <div className="grid grid-cols-3 gap-6">
            {[
              { plan: 'Starter', count: 8, revenue: '$392/mo', percentage: 9, color: 'bg-slate-400' },
              { plan: 'Professional', count: 12, revenue: '$1,788/mo', percentage: 42, color: 'bg-indigo-500' },
              { plan: 'Enterprise', count: 4, revenue: '$1,196/mo', percentage: 28, color: 'bg-amber-500' },
            ].map(p => (
              <div key={p.plan} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white/70">{p.plan}</span>
                  <span className="text-sm font-bold text-white">{p.revenue}</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${p.color}`} style={{ width: `${p.percentage}%` }} />
                </div>
                <p className="text-xs text-white/40">{p.count} clients · {p.percentage}% of revenue</p>
              </div>
            ))}
          </div>
        </GlassCardBody>
      </GlassCard>
    </div>
  )
}
