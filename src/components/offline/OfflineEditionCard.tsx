'use client'
// Settings card of the offline edition: licence, the address waiter tablets
// use (with a QR code to scan), sales upload, and where backups are handled.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { ShieldCheck, ShieldAlert, Tablet, CloudUpload, DatabaseBackup } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { fetchOfflineStatus, fill, type OfflineStatus } from './OfflineShell'
import { licenseLine } from './licenseLine'

export function OfflineEditionCard() {
  const { t } = useLanguage()
  const [s, setS] = useState<OfflineStatus | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => fetchOfflineStatus().then(v => { if (alive) setS(v) })
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (!s) return null
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
        <CloudUpload className="w-5 h-5 text-violet-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t.off_sync_title}</p>
          <p className="text-xs text-white/50 mt-0.5">
            {s.sync?.lastUploadAt
              ? fill(t.off_sync_last, { time: new Date(s.sync.lastUploadAt).toLocaleString() })
              : t.off_sync_never}
            {s.sync?.pending ? ` · ${fill(t.off_sync_waiting, { n: s.sync.pending })}` : ''}
          </p>
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
