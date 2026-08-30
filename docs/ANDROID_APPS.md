# ClickGroup Android apps

One Capacitor project (`android/`) produces **four** separately-installable APKs.
Every flavor is the same WebView shell — they differ only by `applicationId`,
launcher name/icon colour, and the `server.url` each one boots to.

| App (flavor) | applicationId | Boots to | Play/launcher name |
|---|---|---|---|
| `cashier` | `com.clickgroup.pos` | `/dashboard` (→ `/pos/<slug>/login` once paired) | ClickGroup Cashier |
| `driver` | `com.clickgroup.pos.driver` | `/dashboard/driver` | ClickGroup Driver |
| `seller` | `com.clickgroup.pos.seller` | `/seller-login` | ClickGroup Seller |
| `cfd` | `com.clickgroup.pos.cfd` | `/cfd` (→ `/cfd/<slug>` once paired) | ClickGroup CFD |

- Flavor boot URL lives in `android/app/src/<flavor>/assets/capacitor.config.json`
  (overrides the generated `src/main/assets/capacitor.config.json`).
- `cashier` keeps the no-suffix id so existing installs/Firebase config are
  untouched. Its first-run "remember the restaurant slug" redirect logic in
  `MainActivity.java` is **cashier-only** (gated on `getPackageName()`).
- `cfd` first run: `src/app/cfd/page.tsx` signs in with the restaurant
  email/password once, stores the menu slug in `localStorage['cfd_slug']`, then
  every later launch jumps straight to `/cfd/<slug>`. Open `/cfd?switch=1` to
  re-pair.
- `seller` / `cfd` don't use push notifications; their `google-services.json`
  client entries are structural stubs (build would fail without them). Register
  real Firebase Android apps for those package names only if push is ever added.
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
> any of the four apps — users would have to uninstall and reinstall.

Regenerate the keystore (only if starting over):

```bash
keytool -genkeypair -v -keystore android/clickgroup-release.keystore \
  -alias clickgroup -keyalg RSA -keysize 2048 -validity 10950
```

## Build

```bash
npx cap sync android          # only when web assets / plugins changed
cd android
./gradlew assembleCashierRelease assembleDriverRelease \
          assembleSellerRelease  assembleCfdRelease
# add assemble<Flavor>Debug for debug-signed builds
```

Outputs: `android/app/build/outputs/apk/<flavor>/<release|debug>/app-<flavor>-<type>.apk`
A copy of all eight, renamed, plus `SHA256SUMS.txt`, is written to `android/dist/`.

## Deploy note

The APKs load `https://clickgroupsystem.vercel.app/...`, so the `/cfd` pairing
page (`src/app/cfd/page.tsx`) must be deployed to Vercel before the CFD APK works.
