'use client'

/**
 * In-app updater bridge.
 *
 * The desktop (Electron) and Android (Capacitor) builds are thin WebView shells
 * that already load the live web app from Vercel — so web/UI changes need no
 * reinstall. This module only updates the *native shell* itself:
 *
 *   - electron → electron-updater over GitHub Releases (latest.yml + .exe)
 *   - android  → a native `Updater` Capacitor plugin: fetch an `android-latest.json`
 *                release asset, compare versionCode, download + launch the APK installer
 *   - web      → nothing to do; the browser always has the latest deploy
 *
 * All calls are feature-detected and safe to invoke in any runtime.
 */

export type AppRuntime = 'electron' | 'android' | 'web'

export interface UpdateInfo {
  runtime:   AppRuntime
  current:   string
  latest:    string | null
  available: boolean
  notes:     string | null
  /** APK download URL (android only); null for electron/web */
  url:       string | null
  /**
   * Android only: the installed APK predates the native `Updater` plugin, so it
   * can't self-install. The UI falls back to opening `url` in the browser.
   */
  pluginMissing?: boolean
}

export interface UpdateEvent {
  type:     'progress' | 'update-available' | 'update-downloaded' | 'error'
  percent?: number
  version?: string
  message?: string
}

// Fetched from a same-origin route handler that proxies the GitHub release
// asset server-side — the APK WebView can't reach the GitHub CDN directly
// (no CORS headers). See src/app/api/app-update/android/route.ts.
const ANDROID_MANIFEST_URL = '/api/app-update/android'

/**
 * Direct link to the current cashier APK on GitHub Releases — the no-frills
 * fallback when the in-app updater can't run (e.g. an APK built before the
 * native Updater plugin). Bump the tag when cutting a release; see
 * docs/APP_UPDATES.md.
 */
export const CASHIER_APK_URL =
  'https://github.com/miraann/clickgroupsystem/releases/download/v1.1/ClickGroup-Cashier-release.apk'

// ── Timeout guard ───────────────────────────────────────────────
// A missing/old native plugin can leave a bridge call pending forever, and a
// stalled fetch has no deadline of its own — never let either freeze the UI.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) },
    )
  })
}

// ── Runtime detection ────────────────────────────────────────────
export function getRuntime(): AppRuntime {
  if (typeof window === 'undefined') return 'web'
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as any
  if (w.electronAPI?.isElectron) return 'electron'
  const cap = w.Capacitor
  if (cap?.isNativePlatform?.() || cap?.isNative) return 'android'
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return 'web'
}

// ── Android Capacitor plugin handle (lazy) ───────────────────────
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
let _updater: any = null
async function androidUpdater() {
  if (_updater) return _updater
  // Prefer the already-loaded global — `@capacitor/core` is a lazy chunk, and a
  // stalled chunk fetch would hang the whole check with no way to recover.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const glob = (window as any)?.Capacitor?.registerPlugin
  const registerPlugin: (name: string) => unknown =
    typeof glob === 'function'
      ? glob
      : (await withTimeout(import('@capacitor/core'), 5000, 'load @capacitor/core')).registerPlugin
  _updater = registerPlugin('Updater')
  return _updater
}

// ── Current installed version ────────────────────────────────────
export async function getCurrentVersion(): Promise<string> {
  const rt = getRuntime()
  try {
    if (rt === 'electron') {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      return String(await (window as any).electronAPI.updates.getVersion())
    }
    if (rt === 'android') {
      const u = await androidUpdater()
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const r = await withTimeout<any>(u.getCurrentVersion(), 4000, 'Updater.getCurrentVersion')
      return String(r?.versionName ?? '—')
    }
  } catch { /* fall through to build stamp */ }
  return process.env.NEXT_PUBLIC_APP_VERSION ?? '—'
}

// ── Check for an update ──────────────────────────────────────────
export async function checkForUpdate(): Promise<UpdateInfo> {
  const runtime = getRuntime()
  const current = await getCurrentVersion()

  if (runtime === 'electron') {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const r = await (window as any).electronAPI.updates.check()
    return {
      runtime,
      current,
      latest:    r?.version ?? null,
      available: !!r?.available,
      notes:     r?.notes ?? null,
      url:       null,
    }
  }

  if (runtime === 'android') {
    // Overall deadline — no single await below may leave the UI stuck on
    // "Checking…". Anything slower than this surfaces as a normal error.
    return withTimeout(checkAndroid(runtime, current), 20_000, 'checkForUpdate(android)')
  }

  // web — always current
  return { runtime, current, latest: current, available: false, notes: null, url: null }
}

// Android update check, split out so checkForUpdate() can put an overall
// deadline around it — see the withTimeout() call above.
async function checkAndroid(runtime: AppRuntime, current: string): Promise<UpdateInfo> {
  const u = await androidUpdater()

  // An APK built before the native Updater plugin leaves this call pending
  // forever — time out and treat it as "plugin missing" rather than freeze.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  let info: any = null
  try {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    info = await withTimeout<any>(u.getCurrentVersion(), 4000, 'Updater.getCurrentVersion')
  } catch { /* legacy APK without the plugin, or a wedged bridge */ }
  const pluginMissing = !info
  const pkg  = String(info?.packageName ?? 'com.clickgroup.pos')
  const currentCode = Number(info?.versionCode ?? 0)

  const res = await fetch(ANDROID_MANIFEST_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new Error(`Release manifest returned ${res.status}`)
  const manifest = await res.json()
  const entry = manifest?.flavors?.[pkg]
  if (!entry) {
    return { runtime, current, latest: null, available: false, notes: null, url: null, pluginMissing }
  }
  // With no readable install code (legacy APK) the compare can't be trusted —
  // surface the update anyway so the user can install it by hand.
  const available = pluginMissing
    ? true
    : Number(entry.versionCode ?? 0) > currentCode
  return {
    runtime,
    current,
    latest:    entry.versionName ?? null,
    available,
    notes:     entry.notes ?? null,
    url:       available ? (entry.url ?? null) : null,
    pluginMissing,
  }
}

// ── Download (+ install on android) ──────────────────────────────
export async function downloadUpdate(
  url: string | null,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const runtime = getRuntime()

  if (runtime === 'electron') {
    // progress + completion arrive via subscribeUpdateEvents()
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    await (window as any).electronAPI.updates.download()
    return
  }

  if (runtime === 'android') {
    if (!url) throw new Error('No download URL for this build')
    const u = await androidUpdater()
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    let handle: any
    if (onProgress) {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      handle = await u.addListener('progress', (e: any) => onProgress(Number(e?.percent ?? 0)))
    }
    try {
      // resolves once the OS package-installer intent has been launched
      await u.downloadAndInstall({ url })
    } finally {
      handle?.remove?.()
    }
  }
}

// ── Restart to apply (electron only) ─────────────────────────────
export async function installUpdate(): Promise<void> {
  if (getRuntime() === 'electron') {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    await (window as any).electronAPI.updates.install()
  }
  // android: the installer intent is fired inside downloadAndInstall()
}

// ── Electron push events (progress / lifecycle) ──────────────────
export function subscribeUpdateEvents(cb: (e: UpdateEvent) => void): () => void {
  if (getRuntime() !== 'electron') return () => {}
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const dispose = (window as any).electronAPI.updates.onEvent(cb)
  return typeof dispose === 'function' ? dispose : () => {}
}
