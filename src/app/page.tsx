import Link from 'next/link'
import { Zap, ChefHat, ArrowRight, Store, Users, BarChart3, Shield } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-[#080b14] flex items-center justify-center p-8 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">ClickGroup POS</h1>
          </div>
          <h2 className="text-5xl font-bold text-white mb-4 leading-tight">
            Restaurant Management<br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Reimagined</span>
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            A complete multi-tenant SaaS platform for managing cafes and restaurants. Choose your portal to get started.
          </p>
        </div>

        {/* Portal Cards */}
        <div className="grid grid-cols-2 gap-6">
          {/* Seller Portal */}
          <Link href="/seller" className="group">
            <div className="relative rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-violet-600/5 backdrop-blur-xl p-8 hover:border-indigo-500/40 hover:bg-indigo-500/15 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/20 cursor-pointer">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">Seller Console</h3>
                    <p className="text-indigo-400 text-sm font-medium">System Administration</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-indigo-400 mt-1 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-white/50 text-sm mb-6 leading-relaxed">
                  Manage all restaurant clients, subscriptions, and system-wide settings from one central hub.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Store, label: 'Manage Restaurants' },
                    { icon: Users, label: 'Client Management' },
                    { icon: BarChart3, label: 'Revenue Analytics' },
                    { icon: Shield, label: 'Access Control' },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-2">
                      <f.icon className="w-3.5 h-3.5 text-indigo-400/60" />
                      <span className="text-xs text-white/40">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Link>

          {/* Restaurant Portal */}
          <Link href="/pos" className="group">
            <div className="relative rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-600/5 backdrop-blur-xl p-8 hover:border-amber-500/40 hover:bg-amber-500/15 transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/20 cursor-pointer">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform">
                  <ChefHat className="w-7 h-7 text-white" />
                </div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">Restaurant Panel</h3>
                    <p className="text-amber-400 text-sm font-medium">Owner & Staff Dashboard</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-amber-400 mt-1 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-white/50 text-sm mb-6 leading-relaxed">
                  Manage your restaurant operations — orders, menu, tables, staff, and real-time analytics.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Store, label: 'Order Management' },
                    { icon: Users, label: 'Staff & Roles' },
                    { icon: BarChart3, label: 'Sales Reports' },
                    { icon: Shield, label: 'Menu & Tables' },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-2">
                      <f.icon className="w-3.5 h-3.5 text-amber-400/60" />
                      <span className="text-xs text-white/40">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        </div>

        <p className="text-center text-white/20 text-sm mt-10">
          ClickGroup POS · Multi-tenant Restaurant Management Platform
        </p>
      </div>
    </div>
  )
}
