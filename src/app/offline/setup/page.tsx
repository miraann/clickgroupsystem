'use client'
// First run of the offline edition. Three ways in:
//  - online: sign in once with the restaurant's cloud email + password, and the
//    PC's backend copies the restaurant from the cloud (activate);
//  - setup file: the seller's file, copied by USB, for a PC with no internet;
//  - new restaurant: made on this PC, no internet; the seller then sends a
//    licence code for its Restaurant ID.
// See offline/runtime/control.cjs and /api/offline/create-restaurant.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, Globe, FileUp, Store, ChevronLeft } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { OfflineShell, ErrorNote, inputCls, buttonCls, fill, fetchOfflineStatus } from '@/components/offline/OfflineShell'

type Mode = 'choose' | 'online' | 'file' | 'new'

export default function OfflineSetupPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [mode, setMode]         = useState<Mode>('choose')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin]           = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState<{ name: string; licensed: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Already set up (e.g. a second tab, or a tablet opening the address): move on.
  useEffect(() => {
    fetchOfflineStatus().then(s => {
      if (!s?.activated) return
      router.replace(s.license.state === 'none' || s.license.state === 'expired' ? '/offline/license' : '/restaurant-login')
    })
  }, [router])

  const send = async (url: string, body: BodyInit, onOk: (json: Record<string, unknown>) => void) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      const json = await res.json().catch(() => null)
      if (!res.ok) { setError(json?.error ?? t.rl_failed); return }
      onOk(json)
    } catch {
      setError(t.rl_failed)
    } finally {
      setBusy(false)
    }
  }

  const submitOnline = (e: React.FormEvent) => {
    e.preventDefault()
    send('/offline/v1/activate', JSON.stringify({ email: email.trim(), password }),
      json => setDone({ name: String(json.restaurant), licensed: json.license === 'applied' }))
  }

  const openFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    const text = await file.text()
    // Checked here too so a wrong file gets a clear message, not a slow upload.
    if (!text.includes('"clickgroup-offline-setup"')) { setError(t.off_file_bad); return }
    send('/offline/v1/activate-file', text,
      json => setDone({ name: String(json.restaurant), licensed: json.license === 'applied' }))
  }

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault()
    // A new restaurant has no licence yet: the licence screen shows its ID for the seller.
    send('/api/offline/create-restaurant', JSON.stringify({ name: name.trim(), email: email.trim(), password, ownerPin: pin }),
      json => setDone({ name: String(json.name), licensed: false }))
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

  const back = (
    <button type="button" onClick={() => { setMode('choose'); setError(null) }} disabled={busy}
      className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 disabled:opacity-40">
      <ChevronLeft className="w-4 h-4 rtl:rotate-180" />{t.off_back}
    </button>
  )
  const label = 'block text-xs font-medium text-white/55 mb-1.5'
  const emailField = (
    <div>
      <label className={label}>{t.rl_email}</label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.rl_email_ph}
        autoComplete="email" required dir="ltr" className={inputCls} />
    </div>
  )

  if (mode === 'online') {
    return (
      <OfflineShell title={t.off_setup_title} subtitle={t.off_setup_body}>
        <form onSubmit={submitOnline} className="space-y-4">
          {back}
          {emailField}
          <div>
            <label className={label}>{t.rl_password}</label>
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

  if (mode === 'file') {
    return (
      <OfflineShell title={t.off_setup_title} subtitle={t.off_file_body}>
        {back}
        <input ref={fileInput} type="file" accept=".cgsetup,application/json" className="hidden"
          onChange={e => { openFile(e.target.files?.[0]); e.target.value = '' }} />
        {error && <ErrorNote text={error} />}
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className={buttonCls}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {busy ? t.off_file_working : t.off_file_pick}
        </button>
      </OfflineShell>
    )
  }

  if (mode === 'new') {
    const ready = name.trim() && email.trim() && password.length >= 8 && /^\d{6}$/.test(pin)
    return (
      <OfflineShell title={t.off_mode_new} subtitle={t.off_new_body}>
        <form onSubmit={submitNew} className="space-y-4">
          {back}
          <div>
            <label className={label}>{t.off_new_name}</label>
            <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
          </div>
          {emailField}
          <div>
            <label className={label}>{t.rl_password}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8}
              autoComplete="new-password" required dir="ltr" className={inputCls} />
            <p className="text-[11px] text-white/35 mt-1">{t.off_new_password_hint}</p>
          </div>
          <div>
            <label className={label}>{t.off_new_pin}</label>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric"
              autoComplete="off" required dir="ltr" className={`${inputCls} tracking-[0.4em] font-mono`} />
          </div>
          {error && <ErrorNote text={error} />}
          <button type="submit" disabled={busy || !ready} className={buttonCls}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.off_new_button}
          </button>
        </form>
      </OfflineShell>
    )
  }

  const choices: { mode: Mode; icon: typeof Globe; title: string; body: string }[] = [
    { mode: 'online', icon: Globe,  title: t.off_mode_online, body: t.off_mode_online_d },
    { mode: 'file',   icon: FileUp, title: t.off_mode_file,   body: t.off_mode_file_d },
    { mode: 'new',    icon: Store,  title: t.off_mode_new,    body: t.off_mode_new_d },
  ]
  return (
    <OfflineShell title={t.off_setup_title} subtitle={t.off_setup_choose}>
      {choices.map(c => (
        <button key={c.mode} type="button" onClick={() => setMode(c.mode)}
          className="w-full flex items-start gap-3 p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-start transition-colors">
          <c.icon className="w-5 h-5 text-[#f5c518] shrink-0 mt-0.5" />
          <span>
            <span className="block text-sm font-bold text-white">{c.title}</span>
            <span className="block text-xs text-white/50 mt-0.5 leading-relaxed">{c.body}</span>
          </span>
        </button>
      ))}
    </OfflineShell>
  )
}
