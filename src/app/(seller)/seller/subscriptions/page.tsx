import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { DollarSign, TrendingUp, AlertCircle, CreditCard } from 'lucide-react'

const subscriptions = [
  { restaurant: 'The Golden Fork', plan: 'Enterprise', amount: '$299', status: 'active' as const, nextBilling: '2026-04-26', since: '2025-09-03' },
  { restaurant: 'Spice Garden', plan: 'Professional', amount: '$149', status: 'active' as const, nextBilling: '2026-04-20', since: '2025-11-15' },
  { restaurant: 'Le Petit Bistro', plan: 'Professional', amount: '$149', status: 'active' as const, nextBilling: '2026-04-10', since: '2026-02-10' },
  { restaurant: 'Casa del Gusto', plan: 'Professional', amount: '$149', status: 'active' as const, nextBilling: '2026-04-20', since: '2026-01-20' },
  { restaurant: 'Sushi Matsuri', plan: 'Starter', amount: '$0', status: 'trial' as const, nextBilling: '2026-04-15', since: '2026-03-15' },
  { restaurant: 'Burger Republic', plan: 'Starter', amount: '$49', status: 'suspended' as const, nextBilling: '—', since: '2025-12-01' },
  { restaurant: 'Noodle House', plan: 'Starter', amount: '$49', status: 'expired' as const, nextBilling: '—', since: '2025-10-08' },
]

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Subscriptions</h1>
        <p className="text-white/40 mt-1">Track all restaurant subscription plans and billing</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="MRR" value="$4,280" icon={DollarSign} color="emerald" trend={{ value: 12, positive: true }} />
        <StatCard title="ARR" value="$51,360" icon={TrendingUp} color="indigo" trend={{ value: 12, positive: true }} />
        <StatCard title="Expiring Soon" value="2" subtitle="Within 7 days" icon={AlertCircle} color="amber" />
        <StatCard title="Active Plans" value="22" subtitle="Out of 24" icon={CreditCard} color="violet" />
      </div>

      <GlassCard>
        <GlassCardHeader>
          <h2 className="text-base font-semibold text-white">All Subscriptions</h2>
        </GlassCardHeader>
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Restaurant', 'Plan', 'Amount', 'Status', 'Next Billing', 'Customer Since'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s, i) => (
                <tr key={i} className={`hover:bg-white/3 transition-colors ${i !== subscriptions.length - 1 ? 'border-b border-white/5' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/20 border border-white/10 flex items-center justify-center text-xs font-bold text-white">
                        {s.restaurant[0]}
                      </div>
                      <span className="text-sm font-medium text-white">{s.restaurant}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
                      s.plan === 'Enterprise' ? 'bg-amber-500/15 text-amber-400' :
                      s.plan === 'Professional' ? 'bg-indigo-500/15 text-indigo-400' :
                      'bg-slate-500/15 text-slate-400'
                    }`}>{s.plan}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-white">{s.amount}<span className="text-white/40 font-normal">/mo</span></span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={s.status}>{s.status}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/50">{s.nextBilling}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/40">{s.since}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
