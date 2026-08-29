# Security remediation — runbook

Tracks the fixes from the security audit. Items in **Done** are already in the
codebase. Items in **Needs you** require your Supabase project, hosting env, or
signing certs and cannot be applied from code alone.

---

## Done (in this codebase)

| Finding | Change |
|---|---|
| C2, H1 | `src/middleware.ts` — server-side gate on `/dashboard/*` and `/seller/*` using the signed cookies. Client `AuthGuard` / `SellerAuthGuard` now verify the server cookie and no longer trust a `localStorage` flag. |
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

**Known residual (follow-up, not blocking):** `orders` / `order_items` /
`delivery_orders` are still anon-readable so guest tracking works. Close this by
adding `security definer` RPCs `track_orders(restaurant_id, phone)` and
`place_order(...)`, repointing `src/app/order/[slug]` + `src/app/guest/[tableId]`
at them, then dropping the three `public_read_*` policies. Also: the menu child
tables (`modifier_options`, `menu_item_modifiers`, `menu_item_ingredients`,
`kds_station_categories`) have no `restaurant_id` and are left open by this
migration — add parent-join policies later. And `/pos` (the no-slug page) reads
`staff` client-side; it stops returning rows after this migration by design —
use `/pos/<slug>/login`.

### 6. Strip secrets from `settings`
Uncomment and run the final `update` in migration 01.

### 7. Repoint dashboard/POS data reads
Client pages currently `select('settings')` / `select('*')` on `restaurants`.
After step 5 the browser session only sees its own restaurant, so those keep
working, but audit any place that reads another tenant's row or the raw
`settings` blob and move it to a server route.

---

## Needs you — infrastructure

| Item | What to do |
|---|---|
| **M1** shared rate limiter | `src/lib/rate-limit.ts` is per-instance in memory (ineffective on Vercel). Add Upstash Redis or Vercel KV, make `rateLimit` async, back it with `INCR`/`PEXPIRE`, keep in-memory as the no-env fallback. ~16 call sites gain `await`. |
| **L1** `SESSION_SECRET` | `openssl rand -base64 48`, set in Vercel env for all environments, redeploy. Confirm it isn't the `.env.local` placeholder. |
| **Windows installer signing** | `electron-app/package.json` has `sign: null`. Get an OV/EV code-signing cert (or Azure Trusted Signing), set `win.certificateFile` + password, remove `sign: null`. Without it users get SmartScreen warnings. |
| **Android release** | Add a release `signingConfig` + `minifyEnabled true` in `android/app/build.gradle`; publish a privacy policy (camera + customer PII); handle the `POST_NOTIFICATIONS` runtime prompt on Android 13+. |
| **CSP enforce** | After watching Report-Only for a few days with real printing / face-scan / realtime traffic, rename the header in `next.config.ts` to `Content-Security-Policy`. |
| **CI secrets** | Add `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` as GitHub Actions repo secrets so the build step runs. |
| **GDPR delete / backup-restore** | Currently client-side against the DB. After C1 they must be server routes behind `requireRestaurant` + a server-side `verifySecret(pin, owner_pin_hash)` check, using the service client. |
