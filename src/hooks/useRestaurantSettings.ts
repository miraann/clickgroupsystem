'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Generic hook for settings pages that read/write to the `restaurants.settings`
 * JSON column. Handles: load from DB, merge defaults, save full state, autoSave
 * single-key toggle (optimistic UI + background write).
 *
 * Usage:
 *   const { settings, setSettings, loading, saveState, save, autoSave } =
 *     useRestaurantSettings(DEFAULTS)
 */
export function useRestaurantSettings<T extends object>(defaults: T) {
  // Stable client — one instance per hook mount
  const supabase = useMemo(() => createClient(), [])

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [settings,     setSettings]     = useState<T>(defaults)
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState<string | null>(null)
  const [saveState,    setSaveState]    = useState<SaveState>('idle')

  // ── Load ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const id = typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : ''
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, settings')
      .eq('id', id)
      .maybeSingle()

    if (error) { setLoadError(error.message); setLoading(false); return }
    if (!data)  { setLoading(false); return }

    setRestaurantId(data.id)
    // Merge DB values onto defaults so missing keys always get a safe fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSettings(s => ({ ...s, ...((data.settings ?? {}) as any) }))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (data?.settings ?? {}) as Record<string, unknown>
    const { error } = await supabase
      .from('restaurants')
      .update({ settings: { ...existing, ...patch } })
      .eq('id', restaurantId)
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
  // Optimistically updates local state, then writes to DB in background.
  const autoSave = useCallback(async (patch: Partial<T>) => {
    setSettings(s => ({ ...s, ...patch }))
    await pushToDb(patch as Record<string, unknown>)
  }, [pushToDb])

  return {
    restaurantId,
    settings,
    setSettings,
    loading,
    loadError,
    saveState,
    save,
    autoSave,
    retry: load,
  }
}
