'use client'
// Wrapper for the native "Background" plugin (android/.../BackgroundPlugin.java):
// what stops FCM alerts from reaching a backgrounded or killed app — battery
// optimization, background restriction, a muted channel, OEM auto-start
// blockers — and the system screens that fix each one.
//
// The web app is served live to every installed APK, so older builds without
// the plugin must keep working: every call resolves to null / false there.

export interface BackgroundStatus {
  /** Doze / App Standby apply — alerts can be held until the app is opened. */
  batteryOptimized:     boolean
  /** The user set battery use to "Restricted" — background delivery is cut off. */
  backgroundRestricted: boolean
  notificationsEnabled: boolean
  /** The pos_alerts channel exists and isn't muted. */
  channelEnabled:       boolean
  manufacturer:         string
  /** The OEM ships its own auto-start / background manager on top of Android's. */
  hasOemManager:        boolean
}

interface BackgroundPlugin {
  getStatus(): Promise<BackgroundStatus>
  requestIgnoreBatteryOptimizations(): Promise<void>
  openAppSettings(): Promise<void>
  openNotificationSettings(): Promise<void>
  openOemSettings(): Promise<{ opened: boolean }>
}

let plugin: BackgroundPlugin | null = null
let loaded: Promise<void> | null = null

// Sets `plugin`; never resolve to the plugin itself. A Capacitor plugin proxy
// answers every property, `then` included, so awaiting one (or returning it
// from an async function) calls a native Background.then() and never settles.
function loadPlugin(): Promise<void> {
  loaded ??= import('@capacitor/core')
    .then(({ Capacitor, registerPlugin }) => {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Background')) {
        plugin = registerPlugin<BackgroundPlugin>('Background')
      }
    })
    .catch(() => {})
  return loaded
}

export async function getBackgroundStatus(): Promise<BackgroundStatus | null> {
  await loadPlugin()
  if (!plugin) return null
  try { return await plugin.getStatus() } catch { return null }
}

/** Anything here can hold a push until the app is opened. */
export function hasBackgroundIssue(s: BackgroundStatus): boolean {
  return s.batteryOptimized || s.backgroundRestricted || !s.notificationsEnabled || !s.channelEnabled
}

export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  await loadPlugin()
  try { await plugin?.requestIgnoreBatteryOptimizations() } catch {}
}

export async function openAppSettings(): Promise<void> {
  await loadPlugin()
  try { await plugin?.openAppSettings() } catch {}
}

export async function openNotificationSettings(): Promise<void> {
  await loadPlugin()
  try { await plugin?.openNotificationSettings() } catch {}
}

export async function openOemSettings(): Promise<boolean> {
  await loadPlugin()
  try { return (await plugin?.openOemSettings())?.opened ?? false } catch { return false }
}

const PROMPTED_KEY = 'cg_battery_exemption_prompted'

/**
 * Show Android's "Let the app always run in the background?" dialog once per
 * install, after push is set up. Later changes go through Settings → Preference.
 */
export async function promptBatteryExemptionOnce(): Promise<void> {
  try {
    if (localStorage.getItem(PROMPTED_KEY)) return
  } catch { return }
  const status = await getBackgroundStatus()
  if (!status?.batteryOptimized) return
  try { localStorage.setItem(PROMPTED_KEY, '1') } catch {}
  await requestIgnoreBatteryOptimizations()
}
