# Prompt: build the ClickGroup POS offline edition (Windows EXE)

> **Status 2026-10-04:** Stage 1 is done and tested — see `offline/README.md` for how to
> run it, what was verified, known gaps and the detailed plan for stages 2–4. Start there.

You are continuing work on **ClickGroup POS** in `F:\clickgroupsystem`, on the git branch
**`offline-edition`** (never commit to `master`; the live online product deploys from it).
Read this whole file before doing anything, then read every file in `offline/runtime/` and
`offline/schema/00_supabase_compat.sql` — they were written in an earlier session and are not
yet tested.

## The product goal

Restaurants that subscribe get two options:
1. **Online** — the existing system (Next.js 16 on Vercel + Supabase cloud). Unchanged.
2. **Offline** — a **Windows EXE** that runs daily operations with **no internet**: tables and
   orders, kitchen tickets, payment and invoices, takeout, daily sales and reports, expenses,
   pay later, members and customers, inventory, menu and settings, staff PIN login, receipt
   printing to network/USB thermal printers.

The Android APKs stay online-only. Delivery, driver, online menu / table-QR guest ordering,
WhatsApp, push notifications, face scan and the seller panel are hidden in the offline edition.

Decisions the owner already made:
- When the offline PC happens to have internet, it **uploads sales to the cloud** so the owner
  and the seller panel can see them.
- **Waiter tablets on the same Wi-Fi** must work, by opening the PC's app in a browser.
- Subscriptions are renewed with a **renewal code** that the seller gives the restaurant. It is
  typed into the EXE and must be verifiable offline.

## Architecture (decided, don't re-litigate)

The app has ~139 files that call `supabase.from()` directly from the browser, plus 10 `.rpc()`
calls, 21 files using realtime channels, and 73 Row Level Security policies. So we **reuse the
same codebase** and give the EXE a **local Supabase-compatible backend**:

```
Electron EXE (offline edition)
 ├─ PostgreSQL 17.6 (embedded, data on the PC)         127.0.0.1:4103
 ├─ PostgREST 14.18 (same REST engine Supabase uses)   127.0.0.1:4102
 ├─ Next.js app (same code, built with NEXT_PUBLIC_EDITION=offline, output: standalone)
 │                                                     127.0.0.1:4101
 └─ Gateway (Node) — the only port browsers use        0.0.0.0:4100
      /rest/v1 → PostgREST, /auth/v1 → auth shim, /storage/v1 → files on disk,
      /realtime/v1 → WebSocket (LISTEN/NOTIFY), everything else → Next.js
```

Facts about the cloud database:
- Postgres 17.6. There are 58 public tables, 30 functions and 73 policies.
- Extensions are `pgcrypto` and `uuid-ossp`, both in the `extensions` schema.
- Tenant RLS uses `public.user_restaurant_ids()`, which matches `restaurants.owner_id = auth.uid()`
  or `restaurant_users.user_id`.
- `restaurants.owner_id` is a foreign key to `profiles(id)`. On Supabase, the
  `handle_new_user()` trigger on `auth.users` creates the profile row.
- Staff PINs are hashed into `staff_secrets` by the `fn_staff_hash_pin` trigger, using pgcrypto
  `crypt(..., gen_salt('bf', 6))`.

The login flow:
1. The restaurant signs in with email and password at `/api/restaurant/login`. The password is a
   pbkdf2 hash in `restaurant_secrets.password_hash`; see `src/lib/crypto.ts`.
2. `src/lib/supabase/session-bridge.ts` then calls `signInWithPassword` with `restaurants.email`
   and `restaurant_secrets.auth_secret`, so that `auth.uid()` works for RLS.
3. Staff then log in with a PIN at `/pos/<slug>/login`.

## Already done (uncommitted, on branch `offline-edition`)

- **`.gitignore`** now ignores `offline/vendor/`, `offline/.data/` and `offline/node_modules/`.
- **`offline/vendor/`** is not committed (about 450 MB). It holds:
  - `pgsql/`: the official EDB `postgresql-17.6-2-windows-x64-binaries.zip`, extracted to only
    `bin/`, `lib/`, `share/` (including `share/extension`, `timezone`, `timezonesets`,
    `tsearch_data`).
  - `postgrest/postgrest.exe`: v14.18 for windows-x86-64. It needs `pgsql/bin` on `PATH`
    because it loads `LIBPQ.dll`.
- **`offline/schema/00_supabase_compat.sql`**:
  - Supabase roles: anon, authenticated, service_role (BYPASSRLS), supabase_admin, authenticator.
  - The `extensions` schema, with pgcrypto and uuid-ossp.
  - A minimal `auth` schema: `users` (bcrypt `encrypted_password`), `refresh_tokens`, and the
    functions `uid()`, `role()`, `email()`, `jwt()`.
  - `storage.foldername()`.
  - It drops `public` at the top, because the dump recreates it.
- **`offline/schema/10_public.sql`**: a structure-only `pg_dump` of the cloud `public` schema,
  made with `--schema-only --schema=public --no-owner --no-publications --no-subscriptions --no-comments`.
  It contains psql 17.6 `\restrict` lines, so apply it with `psql`, not node-pg.
- **`offline/package.json`**: its own dependencies (`pg`, `ws`). Run `npm install` in `offline/`.
- **`offline/runtime/*.cjs`** (CommonJS, so Electron's main process can `require` them):
  - `config.cjs`: ports, paths and per-install secrets (`<dataDir>/secrets.json`). It also
    derives the anon and service JWTs.
  - `jwt.cjs`: HS256 signing and checking, plus `PUBLIC_ANON_KEY`. This is a placeholder
    anon key baked into the offline web build; the gateway swaps it for the install's real
    anon key, so one build works for every install.
  - `postgres.cjs`:
    - `initdb` (scram-sha-256, `--locale-provider=builtin`), then start and stop through `pg_ctl`.
    - `pg_ctl` is required because it drops admin rights on Windows.
    - Applies the numbered `schema/*.sql` files once each, tracked in `<dataDir>/schema.json`.
  - `postgrest.cjs`: writes `postgrest.conf`, starts PostgREST, and waits until it answers.
  - `auth.cjs`: the GoTrue endpoints the app uses:
    - `token?grant_type=password` and `token?grant_type=refresh_token`. Refresh tokens rotate,
      with a 10-second window where the old one still works.
    - `GET user` and `logout`.
    - `admin/users`: list, create, get, update and delete. Provisioning code needs these.
  - `storage.cjs`: buckets stored as folders.
    - Public GET for every bucket except the private ones, `customer-selfies` and `receipts`.
    - Signed URLs, uploads (including multipart form-data from browsers), and deletes.
  - `realtime.cjs`: the Phoenix protocol that realtime-js 2.116 speaks.
    - Version 2.0.0: JSON-array text frames, plus binary "kind 3" frames for user broadcast pushes.
    - `postgres_changes` come from LISTEN on the `cg_realtime` channel. The app only uses `eq`
      filters.
    - Broadcast relay is needed for POS → customer display (`table_change`, `bill_update`).
    - Also serves `POST /realtime/v1/api/broadcast`.
    - Joining requires a signed-in (non-anon) token, because change feeds bypass RLS.
  - `gateway.cjs`: the router and proxy described above, including forwarding WebSocket
    upgrades to Next for dev HMR.

## Stage 1 — finish the proof of concept (do this now)

1. **`offline/runtime/index.cjs`**:
   - `startBackend({ cfg, log })` runs: ensureCluster → start postgres → migrate → pg Pool →
     PostgREST → gateway. It returns `{ pool, stop() }`.
   - `nextEnv(cfg)` returns `NEXT_PUBLIC_EDITION=offline`,
     `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4100`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY=cfg.serviceKey` and `SESSION_SECRET`.
   - It sets the cloud-only variables to `''` so `.env.local` can't fill them in: VAPID keys,
     `FIREBASE_SERVICE_ACCOUNT`, `SUPABASE_DB_URL`, `SELLER_PASSWORD`.
2. **`offline/schema/20_offline.sql`**:
   - Add the `on_auth_user_created` trigger on `auth.users` that runs `public.handle_new_user()`.
   - Add `public.cg_realtime_notify()`. It sends `pg_notify('cg_realtime', json)` with
     `{schema, table, type, commit_timestamp, record, old_record}`.
     - If the payload is over about 7800 bytes, send `{…, truncated: true, record: {id}}`
       instead; the gateway re-reads the row.
     - Don't name a plpgsql variable `old`, because it shadows `OLD`.
   - Add `public.cg_realtime_attach_all()`. It adds the trigger to every public table that
     doesn't have it yet, and later migrations call it again.
3. **Scripts in `offline/scripts/`**:
   - `fetch-vendor.mjs`: downloads and extracts the two binaries exactly as described above, so
     nobody needs the 450 MB in git.
   - `dump-schema.mjs`: regenerates `10_public.sql` with `pg_dump` from `SUPABASE_DB_URL`.
   - `dev.mjs`: starts the backend with dataDir `offline/.data`, then runs `next dev -p 4101 -H 127.0.0.1`
     with `nextEnv`. Browse at http://localhost:4100. Ctrl+C stops everything, including postgres.
   - `seed-demo.mjs`: creates a **demo restaurant** locally:
     - An owner auth user and its profile.
     - `restaurants`, `restaurant_secrets` (pbkdf2 `password_hash` in exactly the
       `pbkdf2:<saltHex>:<hashHex>` format from `src/lib/crypto.ts`, plus an `auth_secret`).
     - Default roles from `src/lib/defaultRoles.ts`, and staff with a PIN.
     - Menu categories and items, tables, payment methods, a currency, receipt, order-number and
       invoice-number settings.
     - A network printer at `127.0.0.1:9100`.
     - Read the column definitions in `10_public.sql` to fill required fields.
     - Store the demo login details in the script itself, not in chat.
4. **App changes. Keep them small and gated, so the online build behaves exactly as before:**
   - Add `src/lib/edition.ts` exporting `IS_OFFLINE_EDITION`, a fixed Supabase cookie name for
     offline (`sb-offline-auth-token`), and the Supabase URL to use: `window.location.origin` in
     the offline browser, otherwise the env var.
     - The cookie name must be fixed because the default name is derived from the URL host,
       which differs between the server (127.0.0.1) and a tablet (192.168.x.x).
   - Use it in `src/lib/supabase/client.ts` (URL and `cookieOptions`), `server.ts` and
     `session-bridge.ts` (`cookieOptions`).
   - Make the cookies' `secure` flag false in the offline edition in these 5 places, because
     tablets use plain http on the LAN:
     - `api/pos/login`
     - `api/restaurant/login`
     - `api/restaurant/verify-pin` (two places)
     - `api/seller/login`
5. **Verify end to end with Wi-Fi turned off.** Start a tiny fake printer, a TCP server on 9100
   that saves the bytes it receives. Then:
   1. Restaurant login works.
   2. Staff PIN login works.
   3. Open a table, add items, and send to the kitchen. This goes through the `pos_send_to_kitchen` RPC.
   4. Pay. This goes through `/api/payment/finalize`.
   5. Check that a receipt and a kitchen ticket arrive at the fake printer (see printing below).
   6. Check that the daily sales report works.
   7. Check that a second browser shows live table changes, which proves realtime works.

   Run `npx tsc --noEmit` and `npm run build` (online, unchanged) to prove nothing broke for
   the online version. Fix what fails.
6. **Printing in the offline edition:**
   - `/api/print/*` builds the ESC/POS bytes on the server already; Kurdish text is drawn with
     `@napi-rs/canvas`.
   - Offline, that server runs **on the restaurant PC**, so it can send bytes straight to
     network printers (TCP 9100) and to Windows USB printers. For USB, use the raw spooler
     method from `electron-app/main.js` `printWindowsPrinter`.
   - Add an offline-only server-side dispatch path, so **tablets can print too**. Browsers on
     plain http can't use WebUSB or Web Bluetooth.

## Later stages (plan them, build after stage 1 works)

- **Stage 2, the full offline edition:**
  - Hide the online-only modules using the existing system in `src/lib/modules` and `ModuleGate`.
  - Build with `output: 'standalone'`, only when `NEXT_PUBLIC_EDITION=offline`.
  - Create a new Electron app in `electron-offline/`. Reuse the printing code from
    `electron-app/main.js`; don't break the online EXE. It should:
    - Start the backend and the Next standalone server using Electron's Node (`ELECTRON_RUN_AS_NODE`).
    - Keep data in `%ProgramData%` or `userData`.
    - Stop postgres on quit.
  - Add a Windows Firewall rule for port 4100.
  - Daily automatic `pg_dump` backups, plus restore.
  - Make screens that only refresh through realtime also refresh after their own actions.
  - Storage URLs are saved as absolute URLs by `getPublicUrl()`. Make the offline edition
    store or display them relative to the current origin, so tablets and an IP change don't
    break images.
  - The installer is NSIS through electron-builder.
- **Stage 3, activation and licensing:**
  - Add an "Offline" plan in the seller panel.
  - On first run, with internet, the restaurant logs in once. A new authenticated cloud API
    returns that restaurant's data (menu, tables, staff and roles, printers, settings) and the
    EXE loads it into the local database.
  - The license and renewal codes are **Ed25519-signed** by a seller-side private key that only
    the server has: `{restaurantId, validUntil, nonce}`. The EXE contains only the public key,
    so codes can't be forged offline.
  - Guard against setting the computer clock back by storing the last time the app saw.
- **Stage 4, sales sync and tablets:**
  - When online, upload invoices, orders and expenses created since the last sync to a cloud API
    that is idempotent, keyed by local ids.
  - Show the PC's LAN address and a QR code so tablets can join.

## Rules

- **Do not read rows from the production Supabase database.** An automatic safety check blocked
  this in the earlier session. Reading the schema is fine. Anything that copies real restaurant
  data must be a script the owner runs, or needs their explicit OK first.
- Never print or commit secrets from `.env.local`, `offline/.data/secrets.json`, keystores or
  `google-services.json` values.
- Match the existing code style: comments explain *why*, are written for an outsider, and are short.
- Commit to `offline-edition` in small, logical commits, and only when the owner asks.
- At the end, report in plain, simple English what works and what doesn't, and give the exact
  commands to run.
