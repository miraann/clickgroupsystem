'use client'

/**
 * Kiosk-mode detection for the single-purpose native shells.
 *
 * The ClickGroup Delivery / KDS APKs stamp `ClickGroupDelivery` / `ClickGroupKDS`
 * onto the WebView user-agent (`android.appendUserAgent` in each flavor's
 * capacitor.config.json). When a marker is present the web app locks itself to
 * that flavor's one screen — no Home / dashboard, no other routes. See:
 *   - components/restaurant/KioskGuard.tsx  (route lock)
 *   - dashboard/delivery-orders/page.tsx    (hides the Home / Driver buttons)
 *   - android/.../MainActivity.java          (native backstop for full loads)
 */

/** The only route the delivery kiosk may sit on. */
export const DELIVERY_KIOSK_HOME = '/dashboard/delivery-orders'

/** The only route the KDS kiosk may sit on. */
export const KDS_KIOSK_HOME = '/dashboard/kds'

/** True inside the ClickGroup Delivery APK shell. */
export function isDeliveryKiosk(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('ClickGroupDelivery')
}

/** True inside the ClickGroup KDS APK shell. */
export function isKdsKiosk(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('ClickGroupKDS')
}
