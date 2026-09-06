'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRestaurant, mutateRestaurant } from '@/hooks/useRestaurant'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Generic hook for settings pages that read/write the `restaurants.settings`
 * JSON column. The READ is served from the shared `useRestaurant` SWR cache
 * (one round-trip per session). Writes go through the guarded
 * `/api/settings/restaurant` route, which enforces `permKey` server-side, then
 * refresh the shared cache.
 *
 * `permKey` is the role permission the calling page requires (e.g.
 * 'settings.appearance'); pass '@owner' for owner-only pages. Read-only callers
 * may omit it.
 *
 * Usage:
 *   const { settings, setSettings, loading, saveState, save, autoSave } =
 *     useRestaurantSettings(DEFAULTS, 'settings.appearance')
 */
export function useRestaurantSettings<T extends object>(defaults: T, permKey?: string) {
  const { restaurant, loading: restLoading, revalidate } = useRestaurant()

  const [settings,  setSettings]  = useState<T>(defaults)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const restaurantId = restaurant?.id ?? null

  // Merge DB values onto defaults whenever the shared row changes. `defaults`
  // is captured once so a caller passing an inline object literal doesn't loop.
  const defaultsRef = useRef(defaults)
  useEffect(() => {
    if (!restaurant) return
    setSettings({ ...defaultsRef.current, ...(restaurant.settings as Partial<T>) })
  }, [restaurant])

  // ── Internal: guarded server write ─────────────────────────
  // The route re-reads + merges the JSON blob server-side (so concurrent writes
  // don't clobber untouched keys) and enforces `permKey`.
  const pushToDb = useCallback(async (patch: Record<string, unknown>): Promise<Error | null> => {
    if (!restaurantId) return null
    try {
      const res = await fetch('/api/settings/restaurant', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ patch, permKey: permKey ?? '@owner' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return new Error(json?.error ?? 'Save failed')
      mutateRestaurant(restaurantId, { settings: json.settings })
      return null
    } catch (e) {
      return e instanceof Error ? e : new Error('Save failed')
    }
  }, [restaurantId, permKey])

  // ── Save all current settings ────────────────────────────────
  const save = useCallback(async () => {
    setSaveState('saving')
    const error = await pushToDb(settings as Record<string, unknown>)
    if (error) {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    } else {
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    }
  }, [pushToDb, settings])

  // ── Auto-save a partial patch (for toggles) ──────────────────
  const autoSave = useCallback(async (patch: Partial<T>) => {
    setSettings(s => ({ ...s, ...patch }))
    await pushToDb(patch as Record<string, unknown>)
  }, [pushToDb])

  return {
    restaurantId,
    settings,
    setSettings,
    loading: restLoading && !restaurant,
    loadError: null as string | null,
    saveState,
    save,
    autoSave,
    retry: revalidate,
  }
}
