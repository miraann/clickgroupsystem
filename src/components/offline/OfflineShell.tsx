'use client'
import Image from 'next/image'

/** Same look as the restaurant login page, for the offline edition's own screens. */
export function OfflineShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#022658] flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-amber-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-600/8 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-white p-2.5 flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-[#f5c518]/20 ring-1 ring-white/15">
            <Image src="/logo/logo.png" alt="ClickGroup" width={64} height={64} className="w-full h-full object-contain" priority />
          </div>
          <h1 className="text-2xl font-black text-white">{title}</h1>
          {subtitle && <p className="text-white/50 text-sm mt-2 leading-relaxed">{subtitle}</p>}
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl shadow-black/40">
          {children}
        </div>
      </div>
    </div>
  )
}

export const inputCls = 'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#f5c518]/60 focus:ring-2 focus:ring-[#f5c518]/15 transition-colors'
export const buttonCls = 'w-full py-3 rounded-2xl bg-[#f5c518] hover:bg-[#ffd43b] disabled:opacity-30 disabled:cursor-not-allowed text-[#0a1533] font-black text-sm transition-all active:scale-[0.98] shadow-lg shadow-[#f5c518]/25 flex items-center justify-center gap-2'

export function ErrorNote({ text }: { text: string }) {
  return <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-2.5">{text}</p>
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m))
}

/** What /offline/v1/status returns (offline/runtime/control.cjs). */
export interface OfflineStatus {
  activated:  boolean
  restaurant: { name: string; slug: string } | null
  license:    { state: 'none' | 'valid' | 'ending' | 'grace' | 'expired'; validUntil?: string; daysLeft?: number; graceDaysLeft?: number }
  tablets:    string[]
  sync:       { lastUploadAt?: string; pending?: number; lastError?: string | null } | null
}

export async function fetchOfflineStatus(): Promise<OfflineStatus | null> {
  try {
    const res = await fetch('/offline/v1/status', { cache: 'no-store' })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}
