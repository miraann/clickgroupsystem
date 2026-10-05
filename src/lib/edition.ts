// Online (Vercel + Supabase cloud) or offline (Windows EXE with a local
// Supabase-compatible backend, see offline/). Fixed at build time.
export const IS_OFFLINE_EDITION = process.env.NEXT_PUBLIC_EDITION === 'offline'

// Supabase derives its session cookie name from the API host. Offline that
// host is 127.0.0.1 on the server but 192.168.x.x on a waiter tablet, so the
// names would differ and a tablet would never see its own session.
export const SUPABASE_COOKIE_OPTIONS = IS_OFFLINE_EDITION
  ? { name: 'sb-offline-auth-token' }
  : undefined

/**
 * Offline, the browser talks to the backend on whatever address it opened the
 * app with (the POS PC itself, or its LAN IP from a tablet).
 */
export function supabaseUrl(): string {
  if (IS_OFFLINE_EDITION && typeof window !== 'undefined') return window.location.origin
  return process.env.NEXT_PUBLIC_SUPABASE_URL!
}

/**
 * Can the app reach its backend? Online that needs the internet. Offline the
 * backend is this PC (or the PC across the Wi-Fi), which works even when the
 * browser reports no network — a POS PC with Wi-Fi switched off says
 * navigator.onLine === false while 127.0.0.1 answers fine.
 */
export function browserOnline(): boolean {
  return IS_OFFLINE_EDITION || navigator.onLine
}

/** Cookies can only be `secure` over https; offline tablets use plain http on the LAN. */
export const SECURE_COOKIES = process.env.NODE_ENV === 'production' && !IS_OFFLINE_EDITION

// ── Uploaded files (Supabase Storage) ───────────────────────────────────────
// getPublicUrl() returns an absolute link built from the API address — offline
// that is whichever address the uploading device used (127.0.0.1, or the PC's
// LAN IP, which can change). The offline edition saves the link relative, so
// it works from the PC and every tablet.

const STORAGE_PATH = /^https?:\/\/[^/]+(\/storage\/v1\/object\/public\/.*)$/

/** The form of a public storage URL to save in the database. */
export function storedFileUrl(publicUrl: string): string {
  if (!IS_OFFLINE_EDITION) return publicUrl
  return STORAGE_PATH.exec(publicUrl)?.[1] ?? publicUrl
}

/** For server-side fetches: a saved relative link resolved through the gateway. */
export function fetchableFileUrl(url: string): string {
  return url.startsWith('/') ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}${url}` : url
}

// ── Features that need the internet ─────────────────────────────────────────
// Delivery, guest ordering by QR / online menu and WhatsApp all depend on
// customers reaching the restaurant over the internet, so the offline edition
// switches them off whatever the plan or role says.

/** Plan modules (src/lib/modules) that are off in the offline edition. */
const OFFLINE_OFF_MODULES = new Set(['delivery', 'whatsapp'])

/** Role permissions (and everything under them) that are off in the offline edition. */
const OFFLINE_OFF_PERMISSIONS = [
  'dashboard.btn_qr_orders', 'dashboard.btn_delivery', 'delivery', 'driver_screen',
  'manage_delivery', 'payment_screen.wa', 'menu.online_menu', 'settings.delivery', 'settings.whatsapp',
]

export function offlineDisablesModule(key: string): boolean {
  return IS_OFFLINE_EDITION && OFFLINE_OFF_MODULES.has(key)
}

export function offlineDisablesPermission(key: string): boolean {
  return IS_OFFLINE_EDITION && OFFLINE_OFF_PERMISSIONS.some(p => key === p || key.startsWith(`${p}.`))
}
