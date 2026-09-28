# Security remediation — runbook

Tracks the fixes from the security audit. Items in **Done** are already in the
codebase. Items in **Needs you** require your Supabase project, hosting env, or
signing certs and cannot be applied from code alone.

---

## Done (in this codebase)

| Finding | Change |
|---|---|
| C2, H1 | `src/proxy.ts` (Next 16's middleware; already present) is the server-side gate on `/dashboard/*` and `/seller/*` using the signed cookies. Client `AuthGuard` / `SellerAuthGuard` now verify the server cookie and no longer trust a `localStorage` flag. (An added `src/middleware.ts` was removed — it duplicated `proxy.ts` and Next 16 rejects having both.) |
| H2 | `upload/receipt-image` now requires a restaurant session, validates size (≤4 MB) + magic bytes, rejects SVG, and derives the storage path from the session (not a request field). `upload/selfie` (public, can't require auth) now caps at 3 MB, sniffs magic bytes, and returns a **signed** URL. |
| H3 | `api/push/debug` deleted. |
| H4 | `api/push/send`: unauthenticated callers (guest pages) can no longer choose the notification text or target a device, are throttled per-restaurant, and the push must correspond to a real recent event. Text is length-clamped. |
| H5 | `payment/finalize` verifies the signed restaurant cookie; the `isOwner` body flag is ignored. |
| M4 | `electron-app/main.js`: `will-navigate` / `will-redirect` locked to our origin, `will-attach-webview` blocked, `data:` dropped from the window-open allow-list, and every `ipcMain` handler checks the calling frame origin. |
| M5 | `seller/login` uses a constant-time comparison (`src/lib/crypto.ts`). |
| M6 | Security headers added in `next.config.ts` (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS, `Permissions-Policy`). CSP ships as **`Content-Security-Policy-Report-Only`** — watch reports, then rename to `Content-Security-Policy`. |
| L4 | `inventory/check-expiry` is POST-only and accepts `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends). |
| L2 | `AndroidManifest.xml` → `allowBackup=false` + `data_extraction_rules.xml`. |
| L5 | Touched routes return generic error text; details go to `console.error`. |
| — | `.github/workflows/ci.yml` — lint (non-blocking) + typecheck + build on every push/PR. |
| Seller panel | `src/app/api/seller/restaurants/route.ts` (behind `requireSeller`) now backs the list / create / edit / suspend / delete flows — the modals + list page no longer touch Supabase directly. **Create auto-provisions** the auth user + `restaurant_secrets` (hashed password + owner PIN) via `src/lib/provision.ts`, so `scripts/provision-auth-users.mjs` is only a one-time backfill. Delete also removes the auth user. Owner email is now required (it's the login username). |
| Full-project audit follow-up (2026-09-13) | `printer/print-test` had **no auth check at all** and let any caller open a raw TCP connection to an attacker-chosen `ip:port` (SSRF) or, via a `/dev/../..` path, write outside `/dev/` (arbitrary file write) — now gated by `requireAuth()` + a device-path allow-list regex. `devices/scan` (unauthenticated LAN port-scan on self-hosted deploys) now also requires `requireAuth()`. `src/lib/supabase/api-guard.ts`'s `requireRestaurantId()` only checked that a restaurant UUID *existed* (service-role lookup), not that the caller belonged to it — a cross-tenant IDOR letting anyone who knew/guessed another restaurant's UUID pull its printer IP/name/language via `print/kitchen`, `print/receipt`, `print/daily-sales`, `print/table-qr`, `printer/test-escpos`; all five now use the session-bound `requireRestaurant()` from `src/lib/api-auth.ts` (same helper `payment/finalize` already used) and the weak helper was deleted. `next` (16.2.1 → 16.3.5) and `sharp` (^0.34.5 → ^0.35.4) were upgraded — the old `next` had several unauthenticated-RCE and middleware/proxy-bypass CVEs that could have let an attacker route around `src/proxy.ts`'s cookie check entirely. |
| Settings role gate (follow-up to `7d1cf46`) | **Layout gate**: `settings/layout.tsx` now default-**denies** any `/dashboard/settings/*` route with no `NAV_GROUPS`/`EXTRA_PERM_MAP` entry for non-owners (was: unmapped routes rendered to anyone who could open Settings). **Server enforcement**: post-C1 every staff of a restaurant shares one Supabase auth user, so RLS can't tell roles apart — role permissions are now checked server-side by `requirePermission()` (`src/lib/permissions/server.ts`), keyed off `sid`/`rlid` added to the signed `__pos_restaurant` token at PIN login (`src/lib/session.ts`, `api/pos/login`). Guarded routes: `api/settings/roles` + `api/settings/staff` (`settings.users`), `api/settings/restaurant` (the `restaurants.settings` blob — caller passes its `permKey`, backs `useRestaurantSettings`), `api/settings/database` (owner-only + owner-PIN re-verify for restore / GDPR-delete). `hasPermission()` (`src/lib/permissions/check.ts`) is shared with the client `canAny`. |

| 2026-09-28 follow-up | **Owner PIN / password only from `restaurant_secrets`**: `restaurant/login`, `verify-pin`, `pos/login`, `settings/database` no longer fall back to `settings.password` / `settings.owner_pin` — `restaurants.settings` is tenant-writable, so any staff could have planted an owner PIN. Password check shared in `src/lib/restaurant-password.ts`. **`signOut({ scope: 'local' })`** everywhere — every device of a restaurant signs in as the same auth user, and the default global sign-out revoked every other POS/KDS/CFD session. **CFD pairing** (`/api/cfd/pair`) now mints a real Supabase session; `src/app/cfd/[slug]/layout.tsx` sends an unpaired display back to `/cfd?switch=1`. **Guest surfaces off direct reads**: QR guest tracking polls `guest_order_items()`, delivery checkout creates the order with a client-generated id (no insert…select), delivery tracking polls `guest_track_delivery_orders()` (its realtime had silently stopped when migration 04 closed `delivery_orders`), coupons go through `guest_validate_discount_code()`. **`push/subscribe`** writes with the service role after `requireRestaurant()`. **Rate limiter** is shared through Upstash Redis when configured (see infra table). **CSP** gained the tile / geocoding / QR / face-model origins the code actually uses plus a `/api/csp-report` collector. `scripts/security-probe.mjs` checks all of it against the live project. |

**Still client-side + tenant-RLS only (follow-up, not privilege-escalation):** the
other ~28 settings pages write directly to Supabase — menu management, devices/
printers, delivery zones, expenses, inventory, members, customers, currencies,
whatsapp templates, void reasons, surcharges, tables. Tenant RLS scopes them to
the restaurant; a same-restaurant role can still edit them via a direct client
call regardless of its `settings.*` permissions. Move behind guarded routes if
per-role control of those is required.

**Middleware (`src/proxy.ts`) is intentionally not the enforcement point for
role permissions:** it runs on the Edge with no DB access, has no staff identity,
and its failure mode is an HTML redirect (wrong for a JSON API caller). It stays
the coarse signed-cookie gate for `/dashboard/*` pages; per-permission checks
live in the route handlers via `requirePermission()`.

> **Existing PIN sessions:** a staff token minted before this change carries no
> `rlid`; guarded routes return 403 for it until the user re-enters their PIN
> (8 h token TTL). Only the 4 guarded mutation classes are affected.

---

## Needs you — C1: Supabase Auth + tenant RLS

**This is the critical fix.** Until it lands, the public anon key can still read
and write the whole database. Do it on a **staging** Supabase project first.

Already done in code for this: the guest / CFD / POS-login pages now read
`restaurant_public` instead of the `restaurants` table, and
`src/lib/orderNumber.ts` calls the `guest_assign_order_number` RPC (with a
fallback), so migration 02 can lock `restaurants` / `order_number_settings`
without breaking the public pages.

### 1. Add the secrets table + public view
Run `supabase/migrations/20260829_01_restaurant_secrets.sql`. This is additive
(new table, new view) and safe to run before anything else — do it now so the
code changes above have `restaurant_public` to read from. **Edit the
`settings->>'currency'` / `settings->>'default_language'` expressions in the
view to match your real settings JSON keys.**

### 2. Provision one auth user per restaurant
```
SUPABASE_URL=https://<proj>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service key> \
node scripts/provision-auth-users.mjs
```
Creates an `auth.users` row per restaurant, sets `restaurants.owner_id`, and
stores the generated password in `restaurant_secrets.auth_secret`.

### 3. Wire login to mint a real Supabase session  ✅ DONE

`src/lib/supabase/session-bridge.ts` → `attachRestaurantSupabaseSession(req, res, restaurantId)`
signs in as the restaurant's auth user with `restaurant_secrets.auth_secret` and
writes the `sb-*` cookies onto the response. It is called from:
- `src/app/api/restaurant/verify-pin/route.ts` (owner)
- all three success paths of `src/app/api/pos/login/route.ts` (owner via pending,
  owner fallback, staff — staff run under the restaurant's identity + app-level
  `PermissionsContext`)

The owner-PIN checks in both routes now prefer `restaurant_secrets.owner_pin_hash`
(`verifySecret`) and fall back to the legacy plaintext `settings.owner_pin`.
`src/app/api/restaurant/login/route.ts` reads `restaurant_secrets.password_hash`
first (fallback `settings.password`) and migrates legacy plaintext into
`restaurant_secrets`, never back into `settings`.

Verified against the dev project: `signInWithPassword` with the stored
`auth_secret` returns a valid session (JWT `sub` = the provisioned auth user).

If a restaurant isn't provisioned yet the bridge returns `not_provisioned` and
login still works via the `__pos_restaurant` cookie (pre-migration-02 behaviour).

<details><summary>Original sketch (kept for reference)</summary>

After the PIN check succeeds:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// after PIN verified, before returning:
const store = await cookies()
const authed = createServerClient(URL, ANON_KEY, {
  cookies: {
    getAll: () => store.getAll(),
    setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
  },
})
const { data: secret } = await serviceClient()
  .from('restaurant_secrets').select('auth_secret').eq('restaurant_id', restaurant.id).single()
await authed.auth.signInWithPassword({ email: restaurant.email, password: secret.auth_secret })
// the sb-* cookies are now attached to the response; keep setting __pos_restaurant too
```

Also switch the owner-PIN check to `verifySecret(pin, secret.owner_pin_hash)`
(`src/lib/crypto.ts`) and the login-password check to
`verifySecret(password, secret.password_hash)`; on a legacy plaintext match,
re-hash with `hashSecret()` and write it back to `restaurant_secrets`.

Staff: signing in as the restaurant's owner user is acceptable (app-level
permissions still apply via `PermissionsContext`). To give each staff member a
distinct DB identity later, create per-staff `auth.users` + `restaurant_users`
rows and sign in as that user instead.

</details>

### 4. Deploy that build, confirm login still works on staging.

### 5. Close anon access
Run `supabase/migrations/20260829_02_tenant_rls.sql`. It:
- drops every `using(true)` anon / dev policy,
- adds `authenticated` tenant policies (via `user_restaurant_ids()`) on every
  table that has `restaurant_id`, plus a parent-join policy for `order_items`,
- keeps a **narrow anon SELECT** on menu-structure tables and on
  `orders` / `order_items` / `delivery_orders` (guest order tracking reads these
  back by id + phone — a bounded exposure: order status + delivery contact, no
  login secrets),
- keeps anon INSERT for guest order placement + waiter calls,
- makes the `customer-selfies` bucket private.

Then verify with ONLY the anon key, no session:
```js
await anon.from('restaurants').select('*')      // -> [] / error  (was: every row incl. secrets)
await anon.from('staff').select('*')            // -> [] / error
await anon.from('payment_methods').select('*')  // -> [] / error
await anon.from('customers').select('*')        // -> [] / error
await anon.from('menu_items').select('*')       // -> rows (public menu, intended)
```
Then smoke-test the guest menu (`/r/<slug>`), CFD, a guest order, a waiter call,
and the POS PIN login.

**Known residual — closed by `20260928_03` (see 5b):** `orders` / `order_items` were
still anon-readable with no scoping (`using(true)`) so the dine-in QR-order
flow (`src/app/guest/[tableId]`) can look up "is there an active order at this
table" and re-read items it just inserted. Neither table carries direct
customer PII (that lived in `delivery_orders`, closed below), so this is a
cross-tenant *business-data* exposure (order totals/items/table numbers, not
identity), lower severity than the closed items. Close it the same way as
`delivery_orders` below: add `security definer` RPCs for the active-order
lookup and the post-insert total read, then drop `public_read_orders` /
`public_read_order_items`. And `/pos` (the no-slug page) reads `staff`
client-side; it stops returning rows after this migration by design — use
`/pos/<slug>/login`.

**Closed (2026-09-13, migration `20260913_04_security_hardening.sql`):**
- `delivery_orders` had the same unscoped `anon select using(true)` — but
  unlike `orders`/`order_items` it holds real customer PII (name, phone,
  address, GPS coordinates), so *any* anon caller could read every
  restaurant's delivery customers, not just their own by phone (RLS can't
  verify a client-supplied filter, only row data). Replaced with a
  `security definer` RPC, `guest_track_delivery_orders(restaurant_id, phone)`,
  that does the phone match server-side and returns the order + items in one
  call; `src/app/order/[slug]/page.tsx`'s tracking search now calls it via
  `supabase.rpc(...)` instead of three raw table reads. The old
  `public_read_delivery_orders` policy is dropped.
- `modifier_options`, `menu_item_modifiers`, `kds_station_categories` have no
  `restaurant_id` and never got RLS enabled at all by migration 02 (their
  columns didn't match its loop's `restaurant_id`-column check) — meaning
  Postgres/Supabase's default public-schema grants left them fully open,
  **read AND write**, to anon and authenticated alike, across every
  restaurant. (`menu_item_ingredients`, also named in migration 02's comment
  as "no restaurant_id", actually does have the column and was already
  covered by the main tenant-RLS loop — that comment was stale.) Migration 04
  enables RLS on all three and adds a parent-join tenant policy
  (`modifier_options`/`menu_item_modifiers` via `menu_modifiers.restaurant_id`,
  `kds_station_categories` via `kds_stations.restaurant_id`); the first two
  keep the anon SELECT migration 02 already created for them (guest menu
  needs modifier choices), `kds_station_categories` gets none (internal KDS
  routing only).
- `push_subscriptions` had an unscoped anon SELECT added so `api/push/send`
  could look up target devices for unauthenticated guest-triggered
  notifications (delivery/waiter-call) — same "RLS can't check a
  client-supplied filter" problem, so any anon caller could dump every
  restaurant's push endpoints and staff-device links. That route already
  validates the caller itself (signed session, or a real recent
  orders/waiter_calls row) before it ever touches `push_subscriptions`, so it
  now uses the service-role client instead (same pattern as `print/kitchen` /
  `print/receipt`) and the anon policy is dropped.

**Run `supabase/migrations/20260913_04_security_hardening.sql` on staging
first, then production**, and smoke-test: the guest menu's modifier options
still render, KDS station routing still works from Settings, and the
"track my delivery order" search on `/order/<slug>` still finds an order by
phone.

### 5b. Close the remaining anon reads (2026-09-28)

A probe with only the anon key (`scripts/security-probe.mjs`) found far more
still open than the repo's SQL accounts for — policies made in the Supabase
dashboard or by the root `supabase-*.sql` dev files that migration 02 never
named: `delivery_orders` (customer name/phone/address/GPS — still readable
after migration 04), `customers`, `members`, `profiles`, `audit_logs`,
`delivery_notifications`, `push_subscriptions`, `role_messages`, plus the
known `orders` / `order_items`. It also found `restaurant_users`' policies
recursing into themselves: every query touching `restaurant_users`,
`delivery_zones` or `whatsapp_logs` failed with `42P17`.

1. Run **`20260928_01_strip_settings_secrets.sql`** (strips `password` /
   `owner_pin` from `settings` and adds a trigger so they can't come back —
   step 6 below, done).
2. Run **`20260928_02_guest_rpcs_and_fixes.sql`** — additive, safe before
   the deploy: report functions, non-recursive `restaurant_users` /
   `profiles` policies, `SECURITY DEFINER` on the triggers guest inserts fire
   (without it a delivery order would fail once anon can't write
   `delivery_notifications`, and guest `order_items` would lose their
   `restaurant_id`), the guest RPCs, anon read on `kds_stations` /
   `kds_station_categories` (guest-order KDS routing).
3. Deploy the matching build.
4. Run **`20260928_03_close_anon_reads.sql`** — drops anon read on
   `orders` / `order_items`, narrows the anon INSERTs, and sweeps the live
   catalog for every policy open to anon / public / authenticated without an
   identity check, replacing each with a tenant policy. Every change prints a
   `NOTICE`; lines starting `REVIEW:` are tables it left alone on purpose.
5. `node --env-file=.env.local scripts/security-probe.mjs` → expect
   "No unexpected anon reads". Smoke-test: guest QR order + its status
   updates, a delivery order (with coupon + zone fee) and its tracking, a
   waiter call, the CFD (re-pair once — displays paired before this have no
   session), POS PIN login, dashboard delivery zones.

### 6. Strip secrets from `settings`  ✅ DONE
`20260928_01_strip_settings_secrets.sql` (production had none left; the
trigger keeps it that way).

### 7. Repoint dashboard/POS data reads
Client pages currently `select('settings')` / `select('*')` on `restaurants`.
After step 5 the browser session only sees its own restaurant, so those keep
working, but audit any place that reads another tenant's row or the raw
`settings` blob and move it to a server route.

---

## Needs you — infrastructure

| Item | What to do |
|---|---|
| **M1** shared rate limiter | Code done (`src/lib/rate-limit.ts` is async and shared via Redis). **To activate:** create a free Upstash Redis database (or add Upstash from the Vercel Marketplace, which sets `KV_REST_API_URL` / `KV_REST_API_TOKEN` itself) and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel, then redeploy. Without them it stays per-instance in memory. |
| **L1** `SESSION_SECRET` | `openssl rand -base64 48`, set in Vercel env for all environments, redeploy. Signs everyone out once (all `__pos_restaurant` / seller cookies become invalid). The local `.env.local` value is not a placeholder (62 chars) — make sure production's is a different, fresh one. |
| **Windows installer signing** | `electron-app/package.json` has `signAndEditExecutable: false` + `sign: null`. Needs an OV/EV code-signing cert (or Azure Trusted Signing): remove both keys and build with `CSC_LINK` / `CSC_KEY_PASSWORD` set. Without it users get SmartScreen warnings. |
| **Android release** | Release `signingConfig` + `minifyEnabled true` are in place. Still: publish a privacy policy (camera + customer PII); handle the `POST_NOTIFICATIONS` runtime prompt on Android 13+. |
| **CSP enforce** | Origins now match what the code loads; violations log as `[csp]` lines (Vercel → Logs). After a few days with none from real printing / face-scan / delivery-map / table-QR traffic, rename the header in `next.config.ts` to `Content-Security-Policy`. |
| **CI secrets** | `gh secret set NEXT_PUBLIC_SUPABASE_URL` and `gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY` (paste the values from `.env.local`; both are public anyway) so CI's build step runs. |
| **GDPR delete / backup-restore** | Currently client-side against the DB. After C1 they must be server routes behind `requireRestaurant` + a server-side `verifySecret(pin, owner_pin_hash)` check, using the service client. |
