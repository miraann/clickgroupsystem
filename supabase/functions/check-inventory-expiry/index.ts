// Supabase Edge Function — daily inventory expiry sweep.
// Deploy: supabase functions deploy check-inventory-expiry
// Schedule (Dashboard → Edge Functions → Schedules, or via pg_cron):
//   select cron.schedule(
//     'inventory-expiry-check', '0 6 * * *',
//     $$select net.http_post(
//         url := 'https://<project-ref>.supabase.co/functions/v1/check-inventory-expiry',
//         headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
//       )$$
//   );
//
// This is functionally equivalent to calling the `check_inventory_expiry()`
// Postgres function directly — use whichever scheduling mechanism is already
// available in your Supabase plan (pg_cron may not be enabled on all tiers).

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? ''
  const expected = `Bearer ${Deno.env.get('SERVICE_ROLE_KEY') ?? ''}`
  if (!Deno.env.get('SERVICE_ROLE_KEY') || auth !== expected) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase.rpc('check_inventory_expiry', { p_warn_days: 3 })
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true, checkedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
