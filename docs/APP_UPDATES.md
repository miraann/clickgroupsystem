# In-app updates (EXE + APK)

Both native builds are **thin WebView shells** that load the live web app from
Vercel, so web / UI / business-logic changes ship the moment Vercel deploys — no
reinstall, nothing to do here.

This flow only updates the **native shell**:

| Build | What an update ships | Mechanism |
|---|---|---|
| Windows `.exe` (`electron-app/`) | `main.js` / `preload.js` — printing, tray, cache tuning | [`electron-updater`](https://www.electron.build/auto-update) reads `latest.yml` from **GitHub Releases** |
| Android `.apk` × 6 flavors (`android/`) | `MainActivity.java`, plugins, `AndroidManifest.xml`, native config | `UpdaterPlugin` reads `/android-latest.json` from **Vercel**, downloads the APK from the **`android-apps` GitHub release**, launches the OS installer |

The user triggers it from **Settings → Advanced → "App version & updates"**
(`src/app/(restaurant)/dashboard/settings/advanced/page.tsx`, backed by
`src/lib/appUpdate.ts`). Electron also does one silent check ~8 s after launch.

Hosting:
- **EXE** → GitHub Releases on `miraann/clickgroupsystem` (electron-updater needs
  the `publish` block + `latest.yml` there).
- **APKs** → attached to the **`android-apps` release** on the same repo, under
  fixed names, so the download URLs never change:
  `https://github.com/miraann/clickgroupsystem/releases/download/android-apps/<Flavor>.apk`
  (`Cashier`, `Driver`, `Delivery`, `Seller`, `CFD`, `KDS`). The base URL is
  `APK_DOWNLOAD_BASE` in `src/lib/apkHosting.ts`. They are **not** in `public/`:
  Capacitor's `webDir` is `public/`, so anything there is copied into every APK.
  The old `https://clickgroupsystem.vercel.app/apps/<Flavor>.apk` links redirect
  to the release (`redirects()` in `next.config.ts`).
- **Update manifest** → `public/android-latest.json`, served by Vercel at
  `/android-latest.json`; a `git push` that Vercel deploys publishes it. The
  Settings → Apps page (`/dashboard/settings/apps`) lists the apps for manual install.
- `android-apps` is created with `--latest=false`, so GitHub's "Latest" release —
  what `electron-updater` reads — stays the newest EXE release.

---

## Cutting a release

Pick the next version, e.g. `1.2`. Do the version bumps **in the same commit** so
`git describe` / the release tag line up:

1. `electron-app/package.json` → `"version": "1.2.0"`
2. `android/app/build.gradle` → `versionCode 3`, `versionName "1.2"`
   (`versionCode` MUST increase — it's what the APK compares)
3. `public/android-latest.json` → bump `versionCode` / `versionName` for each
   flavor that changed. The `url` fields already point at the fixed
   `android-apps` release URLs — only touch them if the filenames change.
4. `src/lib/appUpdate.ts` → `APK_RELEASE_TAG` (the version label on the
   Settings → Apps page). APK URLs there come from `APK_DOWNLOAD_BASE`, so
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

### Build + ship the 6 APKs

```bash
npx cap sync android
cd android
./gradlew assembleCashierRelease  assembleDriverRelease assembleDeliveryRelease \
          assembleSellerRelease   assembleCfdRelease    assembleKdsRelease
cd ..
# stage the fresh builds under the fixed names the URLs use (dist-release/ is git-ignored)
mkdir -p dist-release/android-apps
cp android/app/build/outputs/apk/cashier/release/app-cashier-release.apk   dist-release/android-apps/Cashier.apk
cp android/app/build/outputs/apk/driver/release/app-driver-release.apk     dist-release/android-apps/Driver.apk
cp android/app/build/outputs/apk/delivery/release/app-delivery-release.apk dist-release/android-apps/Delivery.apk
cp android/app/build/outputs/apk/seller/release/app-seller-release.apk     dist-release/android-apps/Seller.apk
cp android/app/build/outputs/apk/cfd/release/app-cfd-release.apk           dist-release/android-apps/CFD.apk
cp android/app/build/outputs/apk/kds/release/app-kds-release.apk           dist-release/android-apps/KDS.apk
# 1) replace the files on the release (same URLs) — only the flavors you rebuilt
gh release upload android-apps dist-release/android-apps/*.apk --clobber -R miraann/clickgroupsystem
# 2) THEN publish the version bump, so no device sees "update available" before the file is there
git add public/android-latest.json android/app/build.gradle src/lib/appUpdate.ts
git commit && git push          # Vercel deploys the manifest → devices are offered the update
```

The `android-apps` release was created once with:

```bash
gh release create android-apps dist-release/android-apps/*.apk -R miraann/clickgroupsystem \
  --latest=false --title "Android apps" \
  --notes "Download links for the ClickGroup Android apps. Files are replaced in place on each release; see docs/APP_UPDATES.md."
```

Release signing needs `android/keystore.properties` + the keystore (git-ignored —
see `docs/ANDROID_APPS.md`). Without them the build falls back to the debug key
and the output is **not** an in-place update for real installs. (`apksigner verify
--print-certs dist-release/android-apps/Cashier.apk` should show
`CN=ClickGroup Technology`.)

The APKs are release assets, not files in git, so new builds don't add ~60 MB
to the repo history any more.

> **Keep `public/` small.** `capacitor.config.ts` sets `webDir: 'public'`, so
> `npx cap sync android` copies the *entire* `public/` folder into each
> flavor's bundled assets. They are never read (every flavor boots straight
> to the remote `server.url`), but Gradle packages them anyway. When the APKs
> themselves lived in `public/apps/`, each build swallowed the previous ones
> (~10 MB → ~27 MB). That is why they moved to the `android-apps` release —
> don't put large files back in `public/`. Still sanity-check new APK sizes
> against the previous ones before uploading.

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
  compares `versionCode`, then downloads the `url` (the absolute `android-apps`
  release URL; GitHub answers with a redirect, which `HttpURLConnection`
  follows) with native Java.

---

## `public/android-latest.json` shape

```json
{
  "flavors": {
    "com.clickgroup.pos":          { "versionCode": 9, "versionName": "1.5.2",          "url": "https://github.com/miraann/clickgroupsystem/releases/download/android-apps/Cashier.apk",  "notes": "…" },
    "com.clickgroup.pos.driver":   { "versionCode": 9, "versionName": "1.5.2-driver",   "url": "https://github.com/miraann/clickgroupsystem/releases/download/android-apps/Driver.apk",   "notes": "…" },
    "com.clickgroup.pos.delivery": { "versionCode": 9, "versionName": "1.5.2-delivery", "url": "https://github.com/miraann/clickgroupsystem/releases/download/android-apps/Delivery.apk", "notes": "…" },
    "com.clickgroup.pos.seller":   { "versionCode": 6, "versionName": "1.4-seller",     "url": "https://github.com/miraann/clickgroupsystem/releases/download/android-apps/Seller.apk",   "notes": "…" },
    "com.clickgroup.pos.cfd":      { "versionCode": 9, "versionName": "1.5.2-cfd",      "url": "https://github.com/miraann/clickgroupsystem/releases/download/android-apps/CFD.apk",      "notes": "…" },
    "com.clickgroup.pos.kds":      { "versionCode": 9, "versionName": "1.5.2-kds",      "url": "https://github.com/miraann/clickgroupsystem/releases/download/android-apps/KDS.apk",      "notes": "…" }
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
