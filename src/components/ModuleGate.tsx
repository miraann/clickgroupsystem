'use client'
import { Lock, ArrowUpCircle } from 'lucide-react'
import { MODULES, isModuleEnabled } from '@/lib/modules'
import { useRestaurant } from '@/hooks/useRestaurant'

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

/**
 * Wraps content with a module access check. Reads plan modules from the shared
 * `useRestaurant` SWR cache — no dedicated `restaurants` query, and instant on
 * any navigation where that cache is already warm.
 */
export function ModuleGate({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const { restaurant, loading } = useRestaurant()

  const hasTenant = typeof window !== 'undefined' && !!localStorage.getItem('restaurant_id')
  if (!hasTenant) return <>{children}</>                 // no tenant bound → fail open
  if (!restaurant) return loading ? null : <>{children}</> // still resolving → hold; gave up → fail open

  const modules = ((restaurant.settings as Record<string, unknown>)?.modules ?? {}) as Record<string, boolean>
  if (!isModuleEnabled(modules, moduleKey)) return <UpgradeWall moduleName={moduleLabel(moduleKey)} />
  return <>{children}</>
}
