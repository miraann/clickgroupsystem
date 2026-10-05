import { createBrowserClient } from '@supabase/ssr'
import { supabaseUrl, SUPABASE_COOKIE_OPTIONS } from '@/lib/edition'

export function createClient() {
  return createBrowserClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        heartbeatIntervalMs: 30000,
      },
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
    }
  )
}
