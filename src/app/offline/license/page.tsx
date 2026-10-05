'use client'
// Licence status and renewal for the offline edition. The code comes from the
// seller (signed by the cloud) and is checked on this PC with no internet.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { OfflineShell, ErrorNote, inputCls, buttonCls, fill, fetchOfflineStatus, type OfflineStatus } from '@/components/offline/OfflineShell'
import { licenseLine } from '@/components/offline/licenseLine'

export default function OfflineLicensePage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [status, setStatus] = useState<OfflineStatus | null>(null)
  const [code, setCode]     = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState<string | null>(null)

  useEffect(() => {
    fetchOfflineStatus().then(s => {
      if (s && !s.activated) router.replace('/offline/setup')
      else setStatus(s)
    })
  }, [router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null); setSaved(null)
    try {
      const res = await fetch('/offline/v1/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { setError(json?.error ?? t.rl_failed); return }
      setStatus(json)
      setCode('')
      setSaved(fill(t.off_lic_applied, { date: json.license.validUntil }))
    } catch {
      setError(t.rl_failed)
    } finally {
      setBusy(false)
    }
  }

  const usable = status && (status.license.state === 'valid' || status.license.state === 'ending' || status.license.state === 'grace')
  const good   = status?.license.state === 'valid'

  return (
    <OfflineShell title={t.off_lic_title} subtitle={status?.restaurant?.name}>
      {status && (
        <p className={`flex items-start gap-2 text-sm ${good ? 'text-emerald-300' : 'text-amber-300'}`}>
          {good ? <ShieldCheck className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
          {licenseLine(t, status.license)}
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs font-medium text-white/55">{t.off_lic_code}</label>
        <textarea value={code} onChange={e => setCode(e.target.value)} rows={3} dir="ltr" spellCheck={false}
          placeholder="CG1-XXXXX-XXXXX-…" className={`${inputCls} font-mono resize-none`} />
        {error && <ErrorNote text={error} />}
        {saved && <p className="text-xs text-emerald-300">{saved}</p>}
        <button type="submit" disabled={busy || code.trim().length < 20} className={buttonCls}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t.off_lic_apply}
        </button>
      </form>
      {usable && (
        <button onClick={() => router.replace('/dashboard')}
          className="w-full py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/70 text-sm font-semibold transition-colors">
          {t.off_continue}
        </button>
      )}
    </OfflineShell>
  )
}
