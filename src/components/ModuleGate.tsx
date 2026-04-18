'use client'
import { useEffect, useState } from 'react'
import { Lock, ArrowUpCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MODULES, isModuleEnabled } from '@/lib/modules'

let _cache: { restaurantId: string; modules: Record<string, boolean>; at: number } | null = null
const CACHE_TTL = 30_000

export function UpgradeWall({ moduleName }: { moduleName: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm mx-auto px-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-500/10">
          <Lock className="w-9 h-9 text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">{moduleName}</h2>
        <p className="text-white/45 text-sm leading-relaxed mb-6">
          This module is not included in your current plan. Contact your account administrator to upgrade and unlock{' '}
          <span className="text-white/70 font-medium">{moduleName}</span>.
        </p>
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium">
          <ArrowUpCircle className="w-4 h-4" />
          Upgrade to Enable
        </div>
      </div>
    </div>
  )
}

export function moduleLabel(key: string): string {
  return MODULES.find(m => m.key === key)?.label ?? key
}

/** Wraps content with a module access check. Shows upgrade wall if disabled. */
export function ModuleGate({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const supabase = createClient()
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    const restaurantId = localStorage.getItem('restaurant_id')
    if (!restaurantId) { setEnabled(true); return }

    if (_cache && _cache.restaurantId === restaurantId && Date.now() - _cache.at < CACHE_TTL) {
      setEnabled(isModuleEnabled(_cache.modules, moduleKey))
      return
    }

    supabase.from('restaurants')
      .select('settings')
      .eq('id', restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        const modules = ((data?.settings as Record<string, unknown>)?.modules ?? {}) as Record<string, boolean>
        _cache = { restaurantId, modules, at: Date.now() }
        setEnabled(isModuleEnabled(modules, moduleKey))
      })
  }, [moduleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (enabled === null) return null
  if (!enabled) return <UpgradeWall moduleName={moduleLabel(moduleKey)} />
  return <>{children}</>
}
