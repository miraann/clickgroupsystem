# In-app updates (EXE + APK)

Both native builds are **thin WebView shells** that load the live web app from
Vercel, so web / UI / business-logic changes ship the moment Vercel deploys — no
reinstall, nothing to do here.

This flow only updates the **native shell**:

| Build | What an update ships | Mechanism |
|---|---|---|
| Windows `.exe` (`electron-app/`) | `main.js` / `preload.js` — printing, tray, cache tuning | [`electron-updater`](https://www.electron.build/auto-update) reads `latest.yml` from GitHub Releases |
| Android `.apk` × 5 flavors (`android/`) | `MainActivity.java`, plugins, `AndroidManifest.xml`, native config | `UpdaterPlugin` reads `android-latest.json` from GitHub Releases, downloads the APK, launches the OS installer |

The user triggers it from **Settings → Advanced → "App version & updates"**
(`src/app/(restaurant)/dashboard/settings/advanced/page.tsx`, backed by
`src/lib/appUpdate.ts`). Electron also does one silent check ~8 s after launch.

Hosting: **GitHub Releases** on `miraann/clickgroupsystem` (public repo — no token
needed for clients to download).

---

## Cutting a release

Pick the next version, e.g. `1.2`. Do the version bumps **in the same commit** so
`git describe` / the release tag line up:

1. `electron-app/package.json` → `"version": "1.2.0"`
2. `android/app/build.gradle` → `versionCode 3`, `versionName "1.2"`
   (`versionCode` MUST increase — it's what the APK compares)
3. `android-latest.json` (repo root) → bump `versionCode` / `versionName` and
   point each `url` at the new tag's assets.
4. `src/lib/appUpdate.ts` → `CASHIER_APK_URL` tag — the direct-download links
   (the PIN screen's "Install Android App" button and the "Download latest APK"
   fallback in Settings → Advanced) point straight at this release asset.

### Build the EXE

```bash
cd electron-app
npm install            # first time only (pulls electron-updater)
npm run build:win
# → electron-app/dist/ClickGroup POS Setup 1.2.0.exe
#   electron-app/dist/ClickGroup POS Setup 1.2.0.exe.blockmap
#   electron-app/dist/latest.yml
```

**Prefer `npm run release:win`** — it builds **and** uploads to GitHub Releases in
one step if `GH_TOKEN` is set (`export GH_TOKEN=<a repo-scoped PAT>`), and it
uploads the `.exe` under the exact name `latest.yml` expects. Doing it by hand
(below) needs one rename first, because electron-builder writes `latest.yml`
pointing at a hyphenated name while the file on disk has spaces:

```bash
cd electron-app/dist
mv "ClickGroup POS Setup 1.2.0.exe"          "ClickGroup-POS-Setup-1.2.0.exe"
mv "ClickGroup POS Setup 1.2.0.exe.blockmap" "ClickGroup-POS-Setup-1.2.0.exe.blockmap"
cd ../..
```

### Build the 5 APKs

```bash
npx cap sync android
cd android
./gradlew assembleCashierRelease  assembleDriverRelease assembleDeliveryRelease \
          assembleSellerRelease   assembleCfdRelease
# → android/app/build/outputs/apk/<flavor>/release/app-<flavor>-release.apk
```

Release signing needs `android/keystore.properties` + the keystore (git-ignored —
see `docs/ANDROID_APPS.md`). Without them the build falls back to the debug key
and the output is **not** an in-place update for real installs.

### Publish the GitHub release

```bash
gh release create v1.2 \
  "electron-app/dist/latest.yml" \
  "electron-app/dist/ClickGroup-POS-Setup-1.2.0.exe" \
  "electron-app/dist/ClickGroup-POS-Setup-1.2.0.exe.blockmap" \
  "android/app/build/outputs/apk/cashier/release/app-cashier-release.apk" \
  "android/app/build/outputs/apk/driver/release/app-driver-release.apk" \
  "android/app/build/outputs/apk/delivery/release/app-delivery-release.apk" \
  "android/app/build/outputs/apk/seller/release/app-seller-release.apk" \
  "android/app/build/outputs/apk/cfd/release/app-cfd-release.apk" \
  "android-latest.json" \
  --title "v1.2" --notes "What changed in the native shell…"
```

- `electron-updater` finds `latest.yml` + the `.exe` automatically via the
  `publish` block in `electron-app/package.json`.
- The APK checks `https://github.com/miraann/clickgroupsystem/releases/latest/download/android-latest.json`
  (the `latest/download/` path always resolves to the newest non-prerelease
  release), reads the entry for its own `applicationId`, and compares
  `versionCode`. The WebView can't fetch that URL directly — the GitHub CDN
  sends no CORS headers — so `src/lib/appUpdate.ts` calls the same-origin proxy
  `GET /api/app-update/android` (`src/app/api/app-update/android/route.ts`),
  which fetches the release asset server-side and echoes the JSON back. The APK
  binary itself is still pulled straight from GitHub by native Java code, which
  has no CORS constraint.

Mark the release **pre-release** while testing so `latest/download/` keeps
pointing at the previous stable one.

---

## `android-latest.json` shape

```json
{
  "flavors": {
    "com.clickgroup.pos":          { "versionCode": 3, "versionName": "1.2",          "url": "https://github.com/miraann/clickgroupsystem/releases/download/v1.2/app-cashier-release.apk",  "notes": "…" },
    "com.clickgroup.pos.driver":   { "versionCode": 3, "versionName": "1.2-driver",   "url": "https://github.com/miraann/clickgroupsystem/releases/download/v1.2/app-driver-release.apk",   "notes": "…" },
    "com.clickgroup.pos.delivery": { "versionCode": 3, "versionName": "1.2-delivery", "url": "https://github.com/miraann/clickgroupsystem/releases/download/v1.2/app-delivery-release.apk", "notes": "…" },
    "com.clickgroup.pos.seller":   { "versionCode": 3, "versionName": "1.2-seller",   "url": "https://github.com/miraann/clickgroupsystem/releases/download/v1.2/app-seller-release.apk",   "notes": "…" },
    "com.clickgroup.pos.cfd":      { "versionCode": 3, "versionName": "1.2-cfd",      "url": "https://github.com/miraann/clickgroupsystem/releases/download/v1.2/app-cfd-release.apk",      "notes": "…" }
  }
}
```

`notes` is optional free text shown under "Version X is available".

---

## First-run Android permission

The APK needs **"Install unknown apps"** for its own package. On the first
"Download & install" tap `UpdaterPlugin` opens that system screen and the card
shows a hint to grant it and tap again. After that it's one tap.
`REQUEST_INSTALL_PACKAGES` is declared in `android/app/src/main/AndroidManifest.xml`.

## Legacy APKs (pre-`UpdaterPlugin`)

An APK built before the `Updater` plugin existed can't self-install, and its
bridge call for the missing plugin never returns. `checkForUpdate()` times that
call out (4 s), flags `pluginMissing`, and — because it can't read the installed
`versionCode` or `applicationId` — assumes the **cashier** flavor and offers the
update anyway. "Download & install" then just `window.open()`s the APK URL in the
system browser so the user can install v1.1+ by hand; from then on the plugin is
present and updates are one tap.

## Testing

See the "Verification" section of the implementation plan — in short: publish a
release with a higher version than what's installed, open Settings → Advanced,
and run "Check for updates".
