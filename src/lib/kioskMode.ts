'use client'

/**
 * Kiosk-mode detection for the single-purpose native shells.
 *
 * The ClickGroup Delivery APK stamps `ClickGroupDelivery` onto the WebView
 * user-agent (`android.appendUserAgent` in its flavor capacitor.config.json).
 * When that marker is present the web app locks itself to the delivery-orders
 * screen — no Home / dashboard, no other routes. See:
 *   - components/restaurant/KioskGuard.tsx  (route lock)
 *   - dashboard/delivery-orders/page.tsx    (hides the Home / Driver buttons)
 *   - android/.../MainActivity.java          (native backstop for full loads)
 */

/** The only route the delivery kiosk may sit on. */
export const DELIVERY_KIOSK_HOME = '/dashboard/delivery-orders'

/** True inside the ClickGroup Delivery APK shell. */
export function isDeliveryKiosk(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('ClickGroupDelivery')
}
