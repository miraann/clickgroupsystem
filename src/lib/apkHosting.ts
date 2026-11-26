// Where the Android APKs are downloaded from.
//
// They are attached to the `android-apps` release of miraann/clickgroup-releases,
// a public repo that holds only download/update files (no source code), so the
// source repo can be private. They are not kept in public/: Capacitor's webDir
// is public/, so anything in it is copied into every APK. The filenames never
// change, so these URLs stay the same from version to version; a new build
// replaces the files on the release (docs/APP_UPDATES.md).
//
// No imports on purpose: next.config.ts reads this too (redirect for the old
// /apps/<name>.apk links).
export const APK_DOWNLOAD_BASE = 'https://github.com/miraann/clickgroup-releases/releases/download/android-apps'
