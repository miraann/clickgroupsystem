// Read-only security probe. Run: node --env-file=.env.local scripts/security-probe.mjs
//
// 1. For every table PostgREST exposes, counts the rows the bare anon key can
//    read (HEAD + count — no row data is fetched or printed). Anything outside
//    EXPECTED_PUBLIC that is readable is a cross-tenant leak.
// 2. If migration 20260928_02 is applied, prints the live policy / trigger
//    state from security_policy_report() / security_trigger_report().
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !svc) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Tables the public guest / menu pages are meant to read.
const EXPECTED_PUBLIC = new Set([
  'restaurant_public', 'menu_categories', 'menu_items', 'currencies', 'events_offers',
  'tables', 'table_groups', 'menu_modifiers', 'modifier_options', 'menu_item_modifiers',
  'kitchen_notes', 'combo_discounts', 'menu_template_settings', 'kds_stations',
  'kds_station_categories', 'plans',
])

const hdr = k => ({ apikey: k, Authorization: `Bearer ${k}` })

const spec = await (await fetch(`${url}/rest/v1/`, { headers: { ...hdr(svc), Accept: 'application/openapi+json' } })).json()
const tables = Object.keys(spec.paths ?? {}).filter(p => p !== '/' && !p.startsWith('/rpc/')).map(p => p.slice(1)).sort()

let leaks = 0
console.log('── anon-readable rows ──')
for (const t of tables) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=0`, { headers: { ...hdr(anon), Prefer: 'count=exact' } })
  if (!r.ok) {
    const body = await r.text()
    console.log(`  ERR  ${t.padEnd(28)} ${r.status} ${body.slice(0, 120)}`)
    continue
  }
  const n = Number((r.headers.get('content-range') ?? '').split('/')[1] ?? 0)
  if (n === 0) continue
  const ok = EXPECTED_PUBLIC.has(t)
  if (!ok) leaks++
  console.log(`  ${ok ? 'ok  ' : 'LEAK'} ${t.padEnd(28)} ${n} rows`)
}
console.log(leaks ? `\n${leaks} table(s) leak to anon.` : '\nNo unexpected anon reads.')

for (const fn of ['security_policy_report', 'security_trigger_report']) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...hdr(svc), 'Content-Type': 'application/json' }, body: '{}' })
  if (!r.ok) { console.log(`\n(${fn} not available — run migration 20260928_02)`); continue }
  const rows = await r.json()
  console.log(`\n── ${fn} ──`)
  if (fn === 'security_policy_report') {
    for (const p of rows) {
      if (!p.rls_enabled) console.log(`  RLS OFF  ${p.table_name}`)
      else if (p.policy_name) console.log(`  ${p.table_name.padEnd(26)} ${p.policy_name.padEnd(40)} ${String(p.roles).padEnd(22)} ${p.cmd}`)
    }
  } else {
    for (const t of rows) console.log(`  ${t.table_name.padEnd(26)} ${t.trigger_name.padEnd(36)} ${t.function_name.padEnd(36)} definer=${t.security_definer}`)
  }
}
