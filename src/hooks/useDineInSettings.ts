import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export interface CachedDineInSettings {
  enable_qr_ordering:     boolean
  show_call_waiter:       boolean
  auto_accept_qr_orders:  boolean
  require_guest_count:    boolean
  table_turnover_minutes: number
  dine_in_note:           string
}

const DEFAULTS: CachedDineInSettings = {
  enable_qr_ordering:     true,
  show_call_waiter:       true,
  auto_accept_qr_orders:  false,
  require_guest_count:    true,
  table_turnover_minutes: 90,
  dine_in_note:           '',
}

async function fetchDineInSettings(restaurantId: string): Promise<CachedDineInSettings> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .maybeSingle()
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = ((data?.settings ?? {}) as any)
  return {
    enable_qr_ordering:     s.enable_qr_ordering     ?? DEFAULTS.enable_qr_ordering,
    show_call_waiter:       s.show_call_waiter        ?? DEFAULTS.show_call_waiter,
    auto_accept_qr_orders:  s.auto_accept_qr_orders  ?? DEFAULTS.auto_accept_qr_orders,
    require_guest_count:    s.require_guest_count     ?? DEFAULTS.require_guest_count,
    table_turnover_minutes: Number(s.table_turnover_minutes ?? DEFAULTS.table_turnover_minutes),
    dine_in_note:           s.dine_in_note            ?? DEFAULTS.dine_in_note,
  }
}

export function useDineInSettings(restaurantId: string | null) {
  return useSWR<CachedDineInSettings>(
    restaurantId ? `dine-in-settings-${restaurantId}` : null,
    () => fetchDineInSettings(restaurantId!),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
  )
}
