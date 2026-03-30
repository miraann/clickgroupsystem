import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { StatCard } from '@/components/ui/stat-card'
import { Users, Shield, UserCheck, UserX } from 'lucide-react'

const allUsers = [
  { name: 'Ahmad Karimi', email: 'ahmad@spicegarden.com', restaurant: 'Spice Garden', role: 'Owner', status: 'active', lastLogin: '2 hours ago' },
  { name: 'Layla Hassan', email: 'layla@spicegarden.com', restaurant: 'Spice Garden', role: 'Manager', status: 'active', lastLogin: 'Now' },
  { name: 'Sara Hassan', email: 'sara@goldenfork.com', restaurant: 'The Golden Fork', role: 'Owner', status: 'active', lastLogin: 'Today' },
  { name: 'Marco Rossi', email: 'marco@casagusto.com', restaurant: 'Casa del Gusto', role: 'Owner', status: 'active', lastLogin: 'Yesterday' },
  { name: 'Kenji Tanaka', email: 'kenji@sushimatsuri.com', restaurant: 'Sushi Matsuri', role: 'Owner', status: 'trial', lastLogin: '3 hours ago' },
  { name: 'Omar Khalid', email: 'omar@spicegarden.com', restaurant: 'Spice Garden', role: 'Cashier', status: 'active', lastLogin: '5 min ago' },
  { name: 'John Smith', email: 'john@burgerrepublic.com', restaurant: 'Burger Republic', role: 'Owner', status: 'suspended', lastLogin: '5 days ago' },
]

export default function SellerUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">All Users</h1>
        <p className="text-white/40 mt-1">System-wide user accounts across all restaurants</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Users" value="186" icon={Users} color="indigo" />
        <StatCard title="Active" value="178" icon={UserCheck} color="emerald" />
        <StatCard title="Suspended" value="5" icon={UserX} color="rose" />
        <StatCard title="Owners" value="24" icon={Shield} color="violet" />
      </div>

      <GlassCard>
        <GlassCardHeader>
          <h2 className="text-base font-semibold text-white">User Accounts</h2>
          <p className="text-xs text-white/40 mt-0.5">All users across all restaurants</p>
        </GlassCardHeader>
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['User', 'Restaurant', 'Role', 'Status', 'Last Login'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-white/30 uppercase tracking-wider px-6 py-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u, i) => (
                <tr key={i} className={`hover:bg-white/3 transition-colors ${i !== allUsers.length - 1 ? 'border-b border-white/5' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/20 border border-white/10 flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {u.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{u.name}</p>
                        <p className="text-xs text-white/35">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/60">{u.restaurant}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      u.role === 'Owner' ? 'bg-violet-500/15 text-violet-400' :
                      u.role === 'Manager' ? 'bg-indigo-500/15 text-indigo-400' :
                      u.role === 'Cashier' ? 'bg-amber-500/15 text-amber-400' :
                      'bg-white/10 text-white/50'
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        u.status === 'active' ? 'bg-emerald-400' :
                        u.status === 'suspended' ? 'bg-rose-400' : 'bg-amber-400'
                      }`} />
                      <span className="text-sm text-white/50 capitalize">{u.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/40">{u.lastLogin}</span>
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
