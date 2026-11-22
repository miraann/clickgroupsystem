# ClickGroup POS — offline edition

The same Next.js app as the online product, running on the restaurant's own
Windows PC against a local, Supabase-compatible backend. No internet needed for
daily work; waiter tablets on the same Wi-Fi open the PC's address in a browser.
When the PC has internet it uploads its sales to the online system.

```
Browser (PC or tablet) ──► Gateway  0.0.0.0:4100   runtime/gateway.cjs   (the only port devices use)
                             ├─ /offline/v1   → runtime/control.cjs  (setup, licence, status, upload now)
                             ├─ /rest/v1      → PostgREST 14.18   127.0.0.1:4102
                             ├─ /auth/v1      → runtime/auth.cjs     (GoTrue subset)
                             ├─ /storage/v1   → runtime/storage.cjs  (files under <data>/storage)
                             ├─ /realtime/v1  → runtime/realtime.cjs (LISTEN cg_realtime → postgres_changes, broadcast)
                             └─ everything else → Next.js            127.0.0.1:4101
                           PostgreSQL 17.6 (embedded)                127.0.0.1:4103
Desktop app: electron-offline/ runs runtime/serve.cjs and the Next standalone server as child processes.
```

App code changes are behind `IS_OFFLINE_EDITION` (`src/lib/edition.ts`, true when
built with `NEXT_PUBLIC_EDITION=offline`); the online build is unchanged.

## For the restaurant: how it works

1. **Seller** (online seller panel → Restaurants → ⋮ → *Offline licence*) picks an
   end date and creates a code. The first code also enables the offline edition.
2. **Install** `ClickGroup POS Offline Setup x.y.z.exe` on the restaurant PC.
3. **First run** — the setup screen offers three ways:
   - *Sign in online* (needs internet once): the restaurant's usual email +
     password. Menu, tables, staff, printers and settings are copied to the PC,
     and the seller's latest licence code is applied.
   - *Open a setup file* (no internet): the seller clicks *Download setup file*
     in the same Offline licence window (menu, staff, settings, pictures and the
     latest code in one `.cgsetup` file), copies it to the PC by USB, opens it.
   - *New restaurant* (no internet): name, owner email, password and PIN, made
     on the PC. The licence screen shows its **Restaurant ID**; the seller makes
     a code for it (Restaurants → *Offline PC licence*) and sends it by phone.
4. From then on it works with no internet: usual email/password, owner PIN and
   staff PINs. Tablets: Settings → Advanced shows the address + QR code.
5. **Renewal:** the seller makes a new code; enter it on the licence screen
   (Settings → Advanced → *Enter a renewal code*). After the end date the app keeps
   working 3 more days, then only the licence screen opens until a code is entered.
   While connected (below) renewals arrive by themselves.
6. **Connect to the online system** (Settings → Advanced, on/off switch):
   on = sales upload every minute when there is internet; off = the app never
   uses the internet. Turning it on asks for the email + password (a PC set up
   online starts on). A restaurant made on the PC is created online the first
   time, with the same menu, staff and pictures, and the sales made so far.
   Turning it off asks for the password (tablets can open Settings too).
7. **Backups:** daily, kept 14; tray icon (next to the clock) → Back up now /
   Restore / Choose backups folder (e.g. a USB stick).

## One-time setup before the first real release (owner)

1. `cd offline && npm run license-keygen` — creates the licence key pair.
   Commit `offline/runtime/license-public.pem`. Put the line in
   `offline/.data/license-private.txt` into Vercel as `OFFLINE_LICENSE_PRIVATE_KEY`
   (Production), keep a copy in a password manager, delete the file.
2. Apply `supabase/migrations/20261005_01_offline_edition.sql` to production
   (`node --env-file=.env.local scripts/db.mjs -f supabase/migrations/20261005_01_offline_edition.sql --dry-run`, then without `--dry-run`).
3. Deploy the online app (the seller licence screen and the cloud APIs are new).
4. Build the installer (below) on a PC with `npm install` done in the repo root,
   `offline/` and `electron-offline/`.

## Run it from source

```powershell
cd offline
npm install
npm run fetch-vendor          # PostgreSQL + PostgREST into offline/vendor (checksummed)
npm run seed:demo             # demo restaurant (logins: top of scripts/seed-demo.mjs)
npm run dev                   # http://localhost:4100   (not :4101 — that is Next.js alone)
```

`npm run dev` gives every restaurant a one-year licence from a local
development key, so the licence checks behave as in the real app.

**Your own restaurant in development:** `npm run import-restaurant -- --email you@example.com`
copies it from the cloud database (reads production; you run it). `--with-history`
adds orders and invoices, `--replace` refreshes it, `--remove` deletes it locally.

**Try first-run setup:** `npm run dev -- --data .data-fresh` starts a fresh "PC".
Add `--port-base 5100` to use ports 5100–5103, beside an installed desktop app.

## Build the Windows installer

```powershell
cd electron-offline
npm install
npm run build:win     # → electron-offline/dist/ClickGroup POS Offline Setup x.y.z.exe
```

**Or let GitHub build it** (needed on a PC with Smart App Control on, which
blocks electron-builder's NSIS step with `spawn UNKNOWN`): every push to
`offline-edition` runs `.github/workflows/offline-installer.yml`; download the
installer from the run's *Artifacts* (kept 30 days). Bump the version in
`electron-offline/package.json` for each release so installers are told apart.

`npm run assemble` alone stages `electron-offline/stage/` (offline Next build
+ backend + PostgreSQL/PostgREST); it refuses to finish if any value from
`.env.local` ended up inside, and warns if the licence public key is missing.
`npm run pack:win` makes an unpacked folder to try without installing.
It also copies the 64-bit Visual C++ runtime (`vcruntime140.dll`,
`vcruntime140_1.dll`, `msvcp140.dll`) from the build PC's System32 into
PostgreSQL's `bin`: the EDB binaries need it and many restaurant PCs don't
have it (without it `initdb` exits with 0xC0000135 and no output).
The installer adds a Windows Firewall rule for TCP 4100 (all network
profiles — restaurant Wi-Fi is often marked "Public") and a shared data folder
`C:\ProgramData\ClickGroup POS Offline` (database, pictures, logs, backups).
Uninstalling keeps the data folder.

## Test it

With `npm run dev` running, in a second terminal (in `offline/`):

```powershell
npm run fake-printer
npm run seed:demo -- --reset
npm run smoke         # API: logins, kitchen, pay, prints, daily sales, realtime, broadcast
npm run seed:demo -- --reset
npm run ui-test       # real Chrome/Edge: PC + tablet (LAN IP) click through order → pay
```

## Files

| Path | What it is |
|---|---|
| `runtime/index.cjs` | `startBackend()` (postgres → migrate → PostgREST → gateway → uploader); `nextEnv()` |
| `runtime/serve.cjs` | the backend as a child process of the desktop app (IPC: backup, restore, stop) |
| `runtime/control.cjs` | `/offline/v1`: status, activation, licence; blocks the app when not set up / expired |
| `runtime/license.cjs` | Ed25519 licence codes (`CG1-…`), shared with the cloud's seller API |
| `runtime/restaurant-import.cjs` | loads a restaurant into the local DB (activation + import script) |
| `runtime/upload.cjs` | sends queued sales to `/api/offline-cloud/upload` when online |
| `runtime/backup.cjs` | pg_dump backups (kept 14) + pictures, restore |
| `schema/*.sql` | applied once each, recorded in `cg_offline.migrations` inside the DB |
| `scripts/*.mjs` | dev, seed, import, keygen, vendor download, schema dump, fake printer, tests |
| `../electron-offline/` | the desktop app (main.js, splash, installer.nsh, scripts/assemble.mjs) |
| `../src/lib/offlineCloud.server.ts` | cloud side: licences, export at first run, install tokens |

Schema files run once per install, by name. To change the schema on installed
PCs, add a new numbered file; end any file that creates tables with
`select public.cg_realtime_attach_all();`.

## Status (2026-10-05)

Verified with automated tests (all passing): stage 1 smoke (25 checks) and
browser test (14) on dev and on the packaged EXE; EXE start/quit (clean stop of
PostgreSQL and PostgREST); backup/restore (15); restaurant import (17); stage 3+4
end to end against a local stand-in cloud and the real online app in dev (41:
seller codes, first-run setup in a browser, offline sale, upload, idempotency,
cross-restaurant protection, renewal, expiry, grace, clock guard); fully-offline
set-up and the online switch (45, 2026-10-06: setup file with pictures, new
restaurant on the PC, Restaurant ID licence, connect creates it online with
pictures and earlier sales, auto-renewal, switch off/on, forged licence refused). `tsc` clean,
online `npm run build` passes and contains none of the offline code paths.

Not done / known limits:
- Never run against production: the migration, the keys and the cloud APIs need
  the owner steps above. The installer was built but not installed on a PC.
- Menu/settings changes made on the PC stay on the PC; changes made online
  after setup don't reach the PC (re-run setup is not built yet). Only when a
  restaurant made on the PC first connects does its set-up go online.
- A setup file holds password and PIN hashes: the seller should hand it over
  privately. It is a few MB per 100 pictures.
- Orders still open on a table upload only after they're paid or closed.
- Live updates ignore row-level security: one restaurant per PC.
- Ports 4100–4103 are fixed; if another program uses 4100 the app says so.
- No code signing: Windows SmartScreen will warn on the installer.
- `next dev` (16.3) writes `AGENTS.md` / `CLAUDE.md` in the repo root on each start.
