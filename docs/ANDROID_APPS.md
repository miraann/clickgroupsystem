# ClickGroup Android apps

One Capacitor project (`android/`) produces **six** separately-installable APKs.
Every flavor is the same WebView shell — they differ only by `applicationId`,
launcher name/icon colour, and the `server.url` each one boots to.

| App (flavor) | applicationId | Boots to | Play/launcher name |
|---|---|---|---|
| `cashier` | `com.clickgroup.pos` | `/dashboard` (→ `/pos/<slug>/login` once paired) | ClickGroup Cashier |
| `driver` | `com.clickgroup.pos.driver` | `/dashboard/driver` | ClickGroup Driver |
| `delivery` | `com.clickgroup.pos.delivery` | `/restaurant-login` (→ `/pos/<slug>/login?next=/dashboard/delivery-orders` once paired) | ClickGroup Delivery |
| `seller` | `com.clickgroup.pos.seller` | `/seller-login` | ClickGroup Seller |
| `cfd` | `com.clickgroup.pos.cfd` | `/cfd` (→ `/cfd/<slug>` once paired) | ClickGroup CFD |
| `kds` | `com.clickgroup.pos.kds` | `/restaurant-login` (→ `/pos/<slug>/login?next=/dashboard/kds` once paired) | ClickGroup KDS |

- Flavor boot URL lives in `android/app/src/<flavor>/assets/capacitor.config.json`
  (overrides the generated `src/main/assets/capacitor.config.json`).
- `cashier` keeps the no-suffix id so existing installs/Firebase config are
  untouched. Its first-run "remember the restaurant slug" redirect logic in
  `MainActivity.java` is shared with `delivery` (gated on `getPackageName()`);
  `driver` / `seller` / `cfd` never touch the slug binding.
- `delivery` reuses that same slug-binding flow: first launch opens
  `/restaurant-login` (email/password), every later launch jumps straight to the
  staff PIN screen with `?next=/dashboard/delivery-orders` appended, so the app
  always lands on the delivery-orders screen after the PIN. `/pos/<slug>/login`
  and `/restaurant-login` honour that `next` param for any internal `/dashboard`
  path. Owner PIN and any staff PIN with the `delivery` permission both pass the
  delivery-orders page guard. To re-pair, tap "Change restaurant account" on the
  PIN screen (clears the saved slug, back to `/restaurant-login`).
- `delivery` is a **single-screen kiosk** — no Home / dashboard, no other routes.
  Its flavor config sets `android.appendUserAgent: "ClickGroupDelivery"`;
  `src/lib/kioskMode.ts` reads that marker and three layers enforce the lock:
  `KioskGuard` (in `(restaurant)/layout.tsx`) bounces any in-app nav to a
  non-`/dashboard/delivery-orders` route straight back; the delivery-orders page
  hides its Home / Driver buttons; and a `WebViewListener` in `MainActivity.java`
  is the native backstop for full page loads. Other flavors are unaffected (no
  UA marker).
- `kds` reuses the cashier/delivery slug-binding flow: first launch opens
  `/restaurant-login`, every later launch jumps to the staff PIN screen with
  `?next=/dashboard/kds` appended. It's also a **single-screen kiosk** —
  `appendUserAgent: "ClickGroupKDS"`, read by `isKdsKiosk()` in
  `src/lib/kioskMode.ts`; `KioskGuard` bounces any in-app nav off
  `/dashboard/kds` straight back, and `MainActivity.java` (`enforceKdsScope`)
  is the native backstop for full page loads. The KDS page itself has no
  Home/nav buttons to hide. Owner PIN and any staff PIN with the `kds`
  permission pass the `/dashboard/kds` guard (see `src/lib/defaultRoles.ts`'s
  seeded "KDS" role). Doesn't use push — Realtime + 4s polling only, same
  stub `google-services.json` treatment as seller/cfd.
- `cfd` first run: `src/app/cfd/page.tsx` signs in with the restaurant
  email/password once, stores the menu slug in `localStorage['cfd_slug']`, then
  every later launch jumps straight to `/cfd/<slug>`. Open `/cfd?switch=1` to
  re-pair.
- `seller` / `cfd` / `kds` / `delivery` / `driver` have structural-stub
  `google-services.json` client entries (build fails without them) — their
  `mobilesdk_app_id` values were hand-crafted, not issued by Firebase, so FCM
  registration silently fails on-device for these flavors (Firebase Installations
  rejects an app_id that isn't a real registered app in the project). `seller` /
  `cfd` / `kds` don't use push and can stay stubbed. **`delivery` and `driver` DO
  need real push** (new-order / assignment
  alerts) — to enable it: in the Firebase console for project `clickgroup-c089f`,
  add an Android app for `com.clickgroup.pos.delivery` and another for
  `com.clickgroup.pos.driver` (no SHA-1 needed, this project only uses FCM
  messaging), then download the project's `google-services.json` and replace
  `android/app/google-services.json` with it — it will contain real entries for
  all 5 packages, keep the seller/cfd ones as-is. All the app-side subscribe/send
  code and per-flavor push wiring is already in place and waits on just this file.
- **CFD keep-awake:** the CFD screens keep the display on via the Wake Lock API
  (`src/hooks/useWakeLock.ts`), toggled by "Keep screen awake" on the `/cfd/<slug>`
  setup screen and persisted to `localStorage['cfd_keep_awake']` (default on).
  The native CFD shell also holds `FLAG_KEEP_SCREEN_ON` and polls that same flag
  in `MainActivity`, so the screen stays on even on WebViews without Wake Lock.

## Signing

Release APKs are signed from `android/keystore.properties` +
`android/clickgroup-release.keystore` (both git-ignored). If the properties file
is absent (fresh clone / CI without secrets) the release build falls back to the
debug key so it still assembles — that output is **not** publishable.

> **Back up `android/clickgroup-release.keystore` and `android/keystore.properties`**
> (password manager / secure storage). Losing them means no in-place updates for
> any of the five apps — users would have to uninstall and reinstall.

Regenerate the keystore (only if starting over):

```bash
keytool -genkeypair -v -keystore android/clickgroup-release.keystore \
  -alias clickgroup -keyalg RSA -keysize 2048 -validity 10950
```

## Build

```bash
npx cap sync android          # only when web assets / plugins changed
cd android
./gradlew assembleCashierRelease  assembleDriverRelease assembleDeliveryRelease \
          assembleSellerRelease   assembleCfdRelease    assembleKdsRelease
# add assemble<Flavor>Debug for debug-signed builds
```

Outputs: `android/app/build/outputs/apk/<flavor>/<release|debug>/app-<flavor>-<type>.apk`
A copy of all twelve, renamed, plus `SHA256SUMS.txt`, is written to `android/dist/`
(git-ignored — copy + `sha256sum *.apk > SHA256SUMS.txt` by hand after a build).

## Deploy note

The APKs load `https://clickgroupsystem.vercel.app/...`, so the `/cfd` pairing
page (`src/app/cfd/page.tsx`) must be deployed to Vercel before the CFD APK works.

## In-app updates

Users update in place from **Settings → Advanced → "App version & updates"** — no
reinstall. `UpdaterPlugin` (`android/app/.../UpdaterPlugin.java`) checks
`public/android-latest.json` (served from Vercel at `/android-latest.json`),
downloads the matching flavor's APK from `public/apps/` (also on Vercel), and
launches the OS installer. `versionCode` in `android/app/build.gradle` must
increase every release, and the fresh APKs must be copied into `public/apps/`
and committed. Nothing is uploaded to GitHub for Android — a Vercel deploy is
the release. Full runbook: **`docs/APP_UPDATES.md`**.
