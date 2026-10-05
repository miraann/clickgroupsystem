'use client'
// First run of the offline edition: sign in once with the restaurant's
// cloud email + password, and the PC's backend copies the restaurant
// (menu, tables, staff, printers, settings) from the cloud. See
// offline/runtime/control.cjs (activate) and /api/offline-cloud/export.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { OfflineShell, ErrorNote, inputCls, buttonCls, fill, fetchOfflineStatus } from '@/components/offline/OfflineShell'

export default function OfflineSetupPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState<{ name: string; licensed: boolean } | null>(null)

  // Already set up (e.g. a second tab, or a tablet opening the address): move on.
  useEffect(() => {
    fetchOfflineStatus().then(s => {
      if (!s?.activated) return
      router.replace(s.license.state === 'none' || s.license.state === 'expired' ? '/offline/license' : '/restaurant-login')
    })
  }, [router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/offline/v1/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { setError(json?.error ?? t.rl_failed); return }
      setDone({ name: json.restaurant, licensed: json.license === 'applied' })
    } catch {
      setError(t.rl_failed)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <OfflineShell title={t.off_setup_title}>
        <p className="flex items-start gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          {fill(t.off_setup_done, { name: done.name })}
        </p>
        <button className={buttonCls} onClick={() => router.replace(done.licensed ? '/restaurant-login' : '/offline/license')}>
          {done.licensed ? t.off_go_login : t.off_continue}
        </button>
      </OfflineShell>
    )
  }

  return (
    <OfflineShell title={t.off_setup_title} subtitle={t.off_setup_body}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-white/55 mb-1.5">{t.rl_email}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.rl_email_ph}
            autoComplete="email" required dir="ltr" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-white/55 mb-1.5">{t.rl_password}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t.rl_password_ph}
            autoComplete="current-password" required dir="ltr" className={inputCls} />
        </div>
        {error && <ErrorNote text={error} />}
        <button type="submit" disabled={busy || !email.trim() || !password} className={buttonCls}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? t.off_setup_working : t.off_setup_button}
        </button>
      </form>
    </OfflineShell>
  )
}
