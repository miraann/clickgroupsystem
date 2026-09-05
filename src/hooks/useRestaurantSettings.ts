'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant, mutateRestaurant } from '@/hooks/useRestaurant'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Generic hook for settings pages that read/write the `restaurants.settings`
 * JSON column. The READ is served from the shared `useRestaurant` SWR cache
 * (one round-trip per session), while writes still go straight to the DB and
 * then refresh the shared cache.
 *
 * Usage:
 *   const { settings, setSettings, loading, saveState, save, autoSave } =
 *     useRestaurantSettings(DEFAULTS)
 */
export function useRestaurantSettings<T extends object>(defaults: T) {
  const supabase = useMemo(() => createClient(), [])
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

  // ── Internal: fetch-then-merge write ────────────────────────
  // Re-reads the current JSON blob so concurrent writes from other tabs
  // don't clobber keys they didn't touch.
  const pushToDb = useCallback(async (patch: Record<string, unknown>) => {
    if (!restaurantId) return null
    const { data } = await supabase
      .from('restaurants')
      .select('settings')
      .eq('id', restaurantId)
      .maybeSingle()
    const existing = (data?.settings ?? {}) as Record<string, unknown>
    const merged = { ...existing, ...patch }
    const { error } = await supabase
      .from('restaurants')
      .update({ settings: merged })
      .eq('id', restaurantId)
    if (!error) mutateRestaurant(restaurantId, { settings: merged })
    return error ?? null
  }, [restaurantId, supabase])

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
