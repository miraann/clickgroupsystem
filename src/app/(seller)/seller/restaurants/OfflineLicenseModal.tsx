'use client'
// Licence / renewal codes for a restaurant's offline desktop app. The seller
// picks an end date; the code is signed on the server and the restaurant pastes
// it into the app (Settings → Advanced, or the licence screen).
// Also: the setup file for a PC with no internet at all, and codes for a
// restaurant that was made on a PC (restaurant = null; the seller types the
// Restaurant ID the PC's licence screen shows).
import { useEffect, useState } from 'react'
import { X, KeyRound, Copy, Check, Loader2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Restaurant } from './types'

interface Issued { id: string; valid_until: string; code: string; note: string | null; issued_at: string }

const addMonths = (months: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Picture bytes as base64, for the setup file. */
async function toBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  } catch {
    return null
  }
}

export function OfflineLicenseModal({ restaurant, onClose }: { restaurant: Restaurant | null; onClose: () => void }) {
  const [pcId, setPcId]             = useState('')
  const [fileBusy, setFileBusy]     = useState<string | null>(null)
  const [validUntil, setValidUntil] = useState(addMonths(1))
  const [note, setNote]             = useState('')
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [code, setCode]             = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [issued, setIssued]         = useState<Issued[]>([])

  const loadIssued = () => {
    if (!restaurant) return
    fetch(`/api/seller/offline-license?restaurantId=${restaurant.id}`)
      .then(r => r.json()).then(d => setIssued(d.licenses ?? [])).catch(() => {})
  }
  useEffect(() => { loadIssued() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setBusy(true); setError(null); setCode(null); setCopied(false)
    const res = await fetch('/api/seller/offline-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(restaurant ? { restaurantId: restaurant.id, validUntil, note } : { restaurantId: pcId.trim(), validUntil, note, pcRestaurant: true }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) { setError(data.error ?? 'Could not create the code.'); return }
    setCode(data.code)
    loadIssued()
  }

  const downloadSetupFile = async () => {
    if (!restaurant) return
    setError(null)
    setFileBusy('Preparing…')
    try {
      const res = await fetch(`/api/seller/offline-setup-file?restaurantId=${restaurant.id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Could not make the setup file.'); return }
      const { pictures, ...file } = data as { pictures: { url: string; rel: string }[] } & Record<string, unknown>
      const files: Record<string, string> = {}
      for (const [i, p] of pictures.entries()) {
        setFileBusy(`Pictures ${i + 1}/${pictures.length}…`)
        const b64 = await toBase64(p.url)
        if (b64) files[p.rel] = b64
      }
      const blob = new Blob([JSON.stringify({ ...file, files })], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(restaurant.name || 'restaurant').replace(/[^\p{L}\p{N}]+/gu, '-')}.cgsetup`
      a.click()
      URL.revokeObjectURL(a.href)
      if (!file.license) setError('Downloaded — but this restaurant has no licence yet, so the PC will ask for a code. Create one above first to include it.')
    } finally {
      setFileBusy(null)
    }
  }

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const input = 'w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#0d1526]/95 backdrop-blur-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-400" />Offline licence</h2>
            <p className="text-sm text-white/40 mt-0.5">{restaurant ? restaurant.name : 'Restaurant made on an offline PC'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-white/50">
            The restaurant pastes this code into the offline desktop app. It works without internet until the end date.
            The first code also lets the restaurant set the app up.
          </p>
          {!restaurant && (
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Restaurant ID <span className="text-white/25">(shown on the PC&apos;s licence screen)</span></label>
              <input value={pcId} onChange={e => setPcId(e.target.value)} dir="ltr" spellCheck={false}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={`${input} font-mono`} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Valid until</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {[1, 3, 6, 12].map(m => (
                <button key={m} onClick={() => setValidUntil(addMonths(m))}
                  className={cn('px-3 py-1.5 rounded-lg text-xs border transition-all',
                    validUntil === addMonths(m) ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'text-white/50 border-white/10 hover:bg-white/5')}>
                  {m === 12 ? '1 year' : `${m} month${m > 1 ? 's' : ''}`}
                </button>
              ))}
            </div>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Note <span className="text-white/25">(optional, e.g. paid until…)</span></label>
            <input value={note} onChange={e => setNote(e.target.value)} className={input} />
          </div>
          {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-2.5">{error}</p>}
          <button onClick={generate} disabled={busy || !validUntil || (!restaurant && pcId.trim().length < 36)}
            className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Create code
          </button>

          {code && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-2">
              <p className="text-xs text-emerald-300">Code valid until {validUntil} — send it to the restaurant:</p>
              <p className="font-mono text-sm text-white break-all select-all" dir="ltr">{code}</p>
              <button onClick={() => copy(code)} className="flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {restaurant && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <p className="text-xs text-white/50">
                For a PC with no internet: a setup file with the menu, staff, settings, pictures and the latest code.
                Copy it to the PC (e.g. USB stick) and open it on the setup screen. It contains password and PIN hashes — keep it private.
              </p>
              <button onClick={downloadSetupFile} disabled={!!fileBusy}
                className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-white/10 text-white/80 text-sm font-semibold flex items-center justify-center gap-2 transition-all">
                {fileBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{fileBusy ?? 'Download setup file'}
              </button>
            </div>
          )}

          {issued.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-white/50 mb-2">Issued codes</p>
              <div className="space-y-1.5">
                {issued.map(i => (
                  <div key={i.id} className="flex items-center gap-3 text-xs text-white/60 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/8">
                    <span className="font-semibold text-white/80">until {i.valid_until}</span>
                    <span className="text-white/30">issued {new Date(i.issued_at).toLocaleDateString()}</span>
                    {i.note && <span className="truncate text-white/40">{i.note}</span>}
                    <button onClick={() => copy(i.code)} title="Copy code" className="ml-auto text-white/40 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
