# In-app updates (EXE + APK)

Both native builds are **thin WebView shells** that load the live web app from
Vercel, so web / UI / business-logic changes ship the moment Vercel deploys — no
reinstall, nothing to do here.

This flow only updates the **native shell**:

| Build | What an update ships | Mechanism |
|---|---|---|
| Windows `.exe` (`electron-app/`) | `main.js` / `preload.js` — printing, tray, cache tuning | [`electron-updater`](https://www.electron.build/auto-update) reads `latest.yml` from **GitHub Releases** |
| Android `.apk` × 5 flavors (`android/`) | `MainActivity.java`, plugins, `AndroidManifest.xml`, native config | `UpdaterPlugin` reads `/android-latest.json` from **Vercel**, downloads the APK from `/apps`, launches the OS installer |

The user triggers it from **Settings → Advanced → "App version & updates"**
(`src/app/(restaurant)/dashboard/settings/advanced/page.tsx`, backed by
`src/lib/appUpdate.ts`). Electron also does one silent check ~8 s after launch.

Hosting:
- **EXE** → GitHub Releases on `miraann/clickgroupsystem` (electron-updater needs
  the `publish` block + `latest.yml` there).
- **APKs** → committed to `public/apps/` and served from the Vercel deploy. The
  update manifest is `public/android-latest.json` (served at `/android-latest.json`).
  Nothing GitHub-side; a `git push` that Vercel deploys *is* the APK release. The
  Settings → Apps page (`/dashboard/settings/apps`) lists them for manual install.

---

## Cutting a release

Pick the next version, e.g. `1.2`. Do the version bumps **in the same commit** so
`git describe` / the release tag line up:

1. `electron-app/package.json` → `"version": "1.2.0"`
2. `android/app/build.gradle` → `versionCode 3`, `versionName "1.2"`
   (`versionCode` MUST increase — it's what the APK compares)
3. `public/android-latest.json` → bump `versionCode` / `versionName` for each
   flavor that changed. The `url` fields already point at the stable
   `https://clickgroupsystem.vercel.app/apps/ClickGroup-<Flavor>-release.apk`
   paths — only touch them if the filenames change.
4. `src/lib/appUpdate.ts` → `APK_RELEASE_TAG` (the version label on the
   Settings → Apps page). APK URLs there are the fixed `/apps/...` paths, so
   nothing else to change.

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

### Build + ship the 5 APKs

```bash
npx cap sync android
cd android
./gradlew assembleCashierRelease  assembleDriverRelease assembleDeliveryRelease \
          assembleSellerRelease   assembleCfdRelease
cd ..
# copy the fresh builds into public/ under the stable names the manifest uses
cp android/app/build/outputs/apk/cashier/release/app-cashier-release.apk   public/apps/ClickGroup-Cashier-release.apk
cp android/app/build/outputs/apk/driver/release/app-driver-release.apk     public/apps/ClickGroup-Driver-release.apk
cp android/app/build/outputs/apk/delivery/release/app-delivery-release.apk public/apps/ClickGroup-Delivery-release.apk
cp android/app/build/outputs/apk/seller/release/app-seller-release.apk     public/apps/ClickGroup-Seller-release.apk
cp android/app/build/outputs/apk/cfd/release/app-cfd-release.apk           public/apps/ClickGroup-CFD-release.apk
git add public/apps public/android-latest.json android/app/build.gradle src/lib/appUpdate.ts
git commit && git push          # Vercel deploys → the APK release is live
```

Release signing needs `android/keystore.properties` + the keystore (git-ignored —
see `docs/ANDROID_APPS.md`). Without them the build falls back to the debug key
and the output is **not** an in-place update for real installs. (`apksigner verify
--print-certs public/apps/ClickGroup-Cashier-release.apk` should show
`CN=ClickGroup Technology`.)

Each APK is ~10 MB → ~50 MB of binaries live in `public/apps/` and in git
history. The filenames are stable so the working tree stays ~50 MB, but every
release adds another ~50 MB of history.

### Publish the EXE (GitHub release)

Only the Electron build still uses a GitHub release:

```bash
gh release create v1.2 \
  "electron-app/dist/latest.yml" \
  "electron-app/dist/ClickGroup-POS-Setup-1.2.0.exe" \
  "electron-app/dist/ClickGroup-POS-Setup-1.2.0.exe.blockmap" \
  --title "v1.2" --notes "What changed in the native shell…"
```

- `electron-updater` finds `latest.yml` + the `.exe` automatically via the
  `publish` block in `electron-app/package.json`. Mark it **pre-release** while
  testing so `latest/download/` keeps pointing at the previous stable EXE.
- The APK's native `Updater` fetches `/android-latest.json` from the same Vercel
  origin (no CORS proxy needed), reads the entry for its own `applicationId`,
  compares `versionCode`, then downloads the `url` (an absolute
  `https://clickgroupsystem.vercel.app/apps/…` path) with native Java.

---

## `public/android-latest.json` shape

```json
{
  "flavors": {
    "com.clickgroup.pos":          { "versionCode": 5, "versionName": "1.3",          "url": "https://clickgroupsystem.vercel.app/apps/ClickGroup-Cashier-release.apk",  "notes": "…" },
    "com.clickgroup.pos.driver":   { "versionCode": 5, "versionName": "1.3-driver",   "url": "https://clickgroupsystem.vercel.app/apps/ClickGroup-Driver-release.apk",   "notes": "…" },
    "com.clickgroup.pos.delivery": { "versionCode": 5, "versionName": "1.3-delivery", "url": "https://clickgroupsystem.vercel.app/apps/ClickGroup-Delivery-release.apk", "notes": "…" },
    "com.clickgroup.pos.seller":   { "versionCode": 5, "versionName": "1.3-seller",   "url": "https://clickgroupsystem.vercel.app/apps/ClickGroup-Seller-release.apk",   "notes": "…" },
    "com.clickgroup.pos.cfd":      { "versionCode": 5, "versionName": "1.3-cfd",      "url": "https://clickgroupsystem.vercel.app/apps/ClickGroup-CFD-release.apk",      "notes": "…" }
  }
}
```

- The `url` **must be absolute** — native Java downloads it directly.
- Bump a flavor's `versionCode` only when its APK actually changed; leaving it
  put means no "update available" prompt for that app.
- `notes` is optional free text shown under "Version X is available".

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

- **APK**: bump a flavor's `versionCode` in `public/android-latest.json` above
  what's installed, `git push`, wait for the Vercel deploy, then open
  Settings → Advanced → "Check for updates" on that flavor.
- **EXE**: publish a GitHub release with a higher `latest.yml` version than
  what's installed; electron-updater picks it up on next launch (or via
  "Check for updates").
