'use client'
import { useState, useEffect } from 'react'
import { GlassCard, GlassCardBody, GlassCardHeader } from '@/components/ui/glass-card'
import { Settings, Bell, Shield, Zap, Loader2, Check } from 'lucide-react'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'

const STORAGE_KEY = 'seller_system_settings'

type SettingsData = {
  system_name:     string
  support_email:   string
  default_currency: string
  notifications:   Record<string, boolean>
  security:        Record<string, boolean>
  webhook_url:     string
  smtp_host:       string
}

const DEFAULTS: SettingsData = {
  system_name:      'ClickGroup POS',
  support_email:    'support@clickgroup.io',
  default_currency: 'USD',
  notifications: {
    new_registration:     true,
    subscription_expired: true,
    payment_received:     true,
    restaurant_suspended: false,
  },
  security: {
    two_factor:      true,
    session_timeout: true,
    ip_whitelist:    false,
    audit_logging:   true,
  },
  webhook_url: '',
  smtp_host:   '',
}

export default function SellerSettingsPage() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULTS)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try { setSettings(prev => ({ ...prev, ...JSON.parse(stored) })) } catch {}
    }
  }, [])

  const handleSave = () => {
    setSaving(true)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setTimeout(() => {
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 300)
  }

  const handleReset = () => {
    setSettings(DEFAULTS)
    localStorage.removeItem(STORAGE_KEY)
  }

  const setGeneral   = (key: string, value: string) =>
    setSettings(prev => ({ ...prev, [key]: value }))
  const toggleNotif  = (key: string) =>
    setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, [key]: !prev.notifications[key] } }))
  const toggleSec    = (key: string) =>
    setSettings(prev => ({ ...prev, security: { ...prev.security, [key]: !prev.security[key] } }))

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
            {([
              { label: 'System Name',      key: 'system_name',      type: 'text'  },
              { label: 'Support Email',    key: 'support_email',    type: 'email' },
              { label: 'Default Currency', key: 'default_currency', type: 'text'  },
            ] as const).map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-white/50 mb-1.5">{f.label}</label>
                <input
                  type={f.type}
                  value={settings[f.key]}
                  onChange={e => setGeneral(f.key, e.target.value)}
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
              { key: 'new_registration',     label: 'New restaurant registration' },
              { key: 'subscription_expired', label: 'Subscription expired' },
              { key: 'payment_received',     label: 'Payment received' },
              { key: 'restaurant_suspended', label: 'Restaurant suspended' },
            ].map(n => (
              <div key={n.key} className="flex items-center justify-between">
                <span className="text-sm text-white/70">{n.label}</span>
                <ToggleSwitch
                  on={!!settings.notifications[n.key]}
                  onChange={() => toggleNotif(n.key)}
                  activeColor="bg-violet-500"
                />
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
              { key: 'two_factor',      label: 'Two-Factor Authentication' },
              { key: 'session_timeout', label: 'Session Timeout (30 min)' },
              { key: 'ip_whitelist',    label: 'IP Whitelisting' },
              { key: 'audit_logging',   label: 'Audit Logging' },
            ].map(s => (
              <div key={s.key} className="flex items-center justify-between">
                <span className="text-sm text-white/70">{s.label}</span>
                <ToggleSwitch
                  on={!!settings.security[s.key]}
                  onChange={() => toggleSec(s.key)}
                  activeColor="bg-emerald-500"
                />
              </div>
            ))}
          </GlassCardBody>
        </GlassCard>

        {/* API & Integrations */}
        <GlassCard>
          <GlassCardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-white">API & Integrations</h2>
            </div>
          </GlassCardHeader>
          <GlassCardBody className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Webhook URL</label>
              <input
                type="url"
                placeholder="https://your-webhook.com/endpoint"
                value={settings.webhook_url}
                onChange={e => setGeneral('webhook_url', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">SMTP Host</label>
              <input
                type="text"
                placeholder="smtp.yourmail.com"
                value={settings.smtp_host}
                onChange={e => setGeneral('smtp_host', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
          </GlassCardBody>
        </GlassCard>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={handleReset}
          className="px-6 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-all">
          Reset to Defaults
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/25">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
