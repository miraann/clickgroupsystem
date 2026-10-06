'use client'
// Settings card of the offline edition: licence, the address waiter tablets
// use (with a QR code to scan), the link to the online system (on/off), and
// where backups are handled.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { ShieldCheck, ShieldAlert, Tablet, CloudUpload, CloudOff, DatabaseBackup, Loader2 } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { fetchOfflineStatus, fill, type OfflineStatus } from './OfflineShell'
import { licenseLine } from './licenseLine'

export function OfflineEditionCard() {
  const { t } = useLanguage()
  const [s, setS] = useState<OfflineStatus | null>(null)
  const [ask, setAsk]           = useState<'on' | 'off' | null>(null)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => { if (s?.restaurant?.email && !email) setEmail(s.restaurant.email) }, [s, email])

  useEffect(() => {
    let alive = true
    const load = () => fetchOfflineStatus().then(v => { if (alive) setS(v) })
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // Turning the online link on needs the owner's email + password (checked on
  // this PC, and by the online system the first time); off needs the password,
  // since this screen is reachable from any tablet.
  const submitCloud = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(ask === 'on' ? '/offline/v1/connect' : '/offline/v1/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { setError(json?.error ?? t.rl_failed); return }
      setS(json)
      setAsk(null)
      setPassword('')
    } catch {
      setError(t.rl_failed)
    } finally {
      setBusy(false)
    }
  }

  if (!s) return null
  const field = 'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50'
  const good = s.license.state === 'valid'
  const row = 'flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/8'

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-white/70">{t.off_edition_title}</h2>

      <div className={row}>
        {good ? <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" /> : <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t.off_lic_title}</p>
          <p className={`text-xs mt-0.5 ${good ? 'text-white/50' : 'text-amber-300'}`}>{licenseLine(t, s.license)}</p>
        </div>
        <Link href="/offline/license" className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/70 border border-white/10">
          {t.off_lic_renew}
        </Link>
      </div>

      <div className={row}>
        <Tablet className="w-5 h-5 text-sky-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t.off_tablets_title}</p>
          {s.tablets.length ? (
            <>
              <p className="text-xs text-white/50 mt-0.5">{t.off_tablets_body}</p>
              <div className="flex flex-wrap gap-4 mt-3">
                {s.tablets.map(url => (
                  <div key={url} className="flex flex-col items-center gap-2">
                    <div className="p-2 rounded-xl bg-white"><QRCodeSVG value={url} size={112} /></div>
                    <span className="font-mono text-xs text-white/80 select-all" dir="ltr">{url}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-amber-300 mt-0.5">{t.off_no_network}</p>
          )}
        </div>
      </div>

      <div className={row}>
        {s.cloud.enabled ? <CloudUpload className="w-5 h-5 text-violet-400 shrink-0" /> : <CloudOff className="w-5 h-5 text-white/40 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm font-semibold text-white">{t.off_cloud_title}</p>
            <button type="button" role="switch" aria-checked={s.cloud.enabled} disabled={busy}
              onClick={() => { setAsk(ask ? null : s.cloud.enabled ? 'off' : 'on'); setError(null); setPassword('') }}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${s.cloud.enabled ? 'bg-emerald-500' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${s.cloud.enabled ? 'start-[22px]' : 'start-0.5'}`} />
            </button>
          </div>
          <p className="text-xs text-white/50 mt-0.5">{s.cloud.enabled ? t.off_cloud_on : t.off_cloud_off}</p>
          {s.cloud.enabled && (
            <p className="text-xs text-white/40 mt-1">
              {s.sync?.lastUploadAt
                ? fill(t.off_sync_last, { time: new Date(s.sync.lastUploadAt).toLocaleString() })
                : t.off_sync_never}
              {s.sync?.pending ? ` · ${fill(t.off_sync_waiting, { n: s.sync.pending })}` : ''}
            </p>
          )}
          {ask && (
            <form onSubmit={submitCloud} className="mt-3 space-y-2">
              <p className="text-xs text-white/60">{ask === 'on' ? t.off_cloud_sign_in : t.off_cloud_confirm_off}</p>
              {ask === 'on' && (
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.rl_email_ph}
                  autoComplete="email" required dir="ltr" className={field} />
              )}
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t.rl_password_ph}
                autoComplete="current-password" required dir="ltr" className={field} />
              {error && <p className="text-xs text-rose-300">{error}</p>}
              <button type="submit" disabled={busy || !password || (ask === 'on' && !email.trim())}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-2">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy ? t.off_cloud_working : ask === 'on' ? t.off_cloud_connect : t.off_cloud_disconnect}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className={row}>
        <DatabaseBackup className="w-5 h-5 text-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t.off_backups_title}</p>
          <p className="text-xs text-white/50 mt-0.5">{t.off_backups_body}</p>
        </div>
      </div>
    </div>
  )
}
