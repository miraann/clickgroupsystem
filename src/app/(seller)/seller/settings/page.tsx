import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { Settings, Bell, Shield, Zap, Globe } from 'lucide-react'

export default function SellerSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-white/40 mt-1">Manage system configuration and preferences</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* General */}
        <GlassCard>
          <GlassCardHeader>
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-400" />
              <h2 className="text-base font-semibold text-white">General</h2>
            </div>
          </GlassCardHeader>
          <GlassCardBody className="space-y-4">
            {[
              { label: 'System Name', value: 'ClickGroup POS', type: 'text' },
              { label: 'Support Email', value: 'support@clickgroup.io', type: 'email' },
              { label: 'Default Currency', value: 'USD', type: 'text' },
              { label: 'Trial Period (days)', value: '14', type: 'number' },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-medium text-white/50 mb-1.5">{f.label}</label>
                <input
                  type={f.type}
                  defaultValue={f.value}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              </div>
            ))}
          </GlassCardBody>
        </GlassCard>

        {/* Notifications */}
        <GlassCard>
          <GlassCardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-violet-400" />
              <h2 className="text-base font-semibold text-white">Notifications</h2>
            </div>
          </GlassCardHeader>
          <GlassCardBody className="space-y-4">
            {[
              { label: 'New restaurant registration', enabled: true },
              { label: 'Subscription expired', enabled: true },
              { label: 'Payment received', enabled: true },
              { label: 'Trial ending (3 days)', enabled: true },
              { label: 'Restaurant suspended', enabled: false },
            ].map(n => (
              <div key={n.label} className="flex items-center justify-between">
                <span className="text-sm text-white/70">{n.label}</span>
                <button className={`relative w-10 h-5 rounded-full transition-colors ${n.enabled ? 'bg-indigo-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${n.enabled ? 'left-5.5 translate-x-0' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </GlassCardBody>
        </GlassCard>

        {/* Security */}
        <GlassCard>
          <GlassCardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-semibold text-white">Security</h2>
            </div>
          </GlassCardHeader>
          <GlassCardBody className="space-y-4">
            {[
              { label: 'Two-Factor Authentication', enabled: true },
              { label: 'Session Timeout (30 min)', enabled: true },
              { label: 'IP Whitelisting', enabled: false },
              { label: 'Audit Logging', enabled: true },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-sm text-white/70">{s.label}</span>
                <button className={`relative w-10 h-5 rounded-full transition-colors ${s.enabled ? 'bg-emerald-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${s.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </GlassCardBody>
        </GlassCard>

        {/* API */}
        <GlassCard>
          <GlassCardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-white">API & Integrations</h2>
            </div>
          </GlassCardHeader>
          <GlassCardBody className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">API Key</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value="••••••••••••••••••••••••••••••••"
                  readOnly
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white/50 focus:outline-none"
                />
                <button className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 transition-all">
                  Reveal
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Webhook URL</label>
              <input
                type="url"
                placeholder="https://your-webhook.com/endpoint"
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">SMTP Settings</label>
              <input
                type="text"
                placeholder="smtp.yourmail.com"
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
          </GlassCardBody>
        </GlassCard>
      </div>

      <div className="flex justify-end gap-3">
        <button className="px-6 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-all">
          Reset to Defaults
        </button>
        <button className="px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/25">
          Save Changes
        </button>
      </div>
    </div>
  )
}
