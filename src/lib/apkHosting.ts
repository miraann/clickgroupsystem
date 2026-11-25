// Where the Android APKs are downloaded from.
//
// They are attached to the `android-apps` release of the public GitHub repo
// (the same repo the desktop installer is released from), not kept in public/:
// Capacitor's webDir is public/, so anything in it is copied into every APK.
// The filenames never change, so these URLs stay the same from version to
// version; a new build replaces the files on the release (docs/APP_UPDATES.md).
//
// No imports on purpose: next.config.ts reads this too (redirect for the old
// /apps/<name>.apk links).
export const APK_DOWNLOAD_BASE = 'https://github.com/miraann/clickgroupsystem/releases/download/android-apps'
