/**
 * Glue between the web app and the ClickGroup Android shell (MainActivity.java).
 *
 * Every APK flavor stamps its WebView user-agent (`ClickGroupApp`, or the
 * kiosk markers `ClickGroupDelivery` / `ClickGroupKDS`) and exposes
 * `window.ClickGroupNative`. NATIVE_SHELL_SCRIPT runs in <head> before first
 * paint and tags <html class="cg-app">, which switches on the native-feel /
 * performance rules at the bottom of globals.css. components/NativeShell.tsx
 * re-applies it after hydration, since a page that falls back to client
 * rendering (hydration mismatch) re-renders <html> without it.
 */

interface ClickGroupNativeBridge {
  appReady?: () => void
  setSystemBarColor?: (cssColor: string) => void
}

export const NATIVE_SHELL_CLASS = 'cg-app'

/** Inline <head> script: adds `cg-app` to <html> inside the APK, before first paint. */
export const NATIVE_SHELL_SCRIPT =
  "(function(){try{var c=window.Capacitor;" +
  "if(/ClickGroup(App|Delivery|KDS)/.test(navigator.userAgent)||(c&&c.isNativePlatform&&c.isNativePlatform()))" +
  "document.documentElement.classList.add('" + NATIVE_SHELL_CLASS + "')}catch(e){}})()"

function bridge(): ClickGroupNativeBridge | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { ClickGroupNative?: ClickGroupNativeBridge }).ClickGroupNative ?? null
}

/** True inside any ClickGroup APK. */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false
  if (/ClickGroup(App|Delivery|KDS)/.test(navigator.userAgent)) return true
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return cap?.isNativePlatform?.() === true
}

/** First screen rendered — lets the native splash fade out. */
export function notifyAppReady() {
  try { bridge()?.appReady?.() } catch { /* older shell */ }
}

/** Paint the Android status / navigation bars (any CSS colour). */
export function setSystemBarColor(cssColor: string) {
  try { bridge()?.setSystemBarColor?.(cssColor) } catch { /* older shell */ }
}

export function canSetSystemBarColor(): boolean {
  return typeof bridge()?.setSystemBarColor === 'function'
}
