import type { NextConfig } from "next";
import path from "path";
import { readFileSync } from "fs";
import { APK_DOWNLOAD_BASE } from "./src/lib/apkHosting";

// Stamp the web build with the package.json version so the "App version &
// updates" card on /dashboard/settings/advanced can show it in a plain browser.
const APP_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version as string;
  } catch {
    return "0.0.0";
  }
})();

// The offline edition (Windows EXE, see offline/README.md) is built with
// NEXT_PUBLIC_EDITION=offline; everything below that checks this leaves the
// online (Vercel) build untouched.
const OFFLINE = process.env.NEXT_PUBLIC_EDITION === 'offline'

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    // Always set, so it is inlined at build time and the other edition's code
    // is dropped from the bundle (see src/lib/edition.ts).
    NEXT_PUBLIC_EDITION: process.env.NEXT_PUBLIC_EDITION || 'online',
  },
  // @napi-rs/canvas ships a native .node addon (used to raster Kurdish
  // receipt text — see src/lib/escpos/kurdishRender.ts) that neither
  // Turbopack nor webpack can bundle; this tells Next to require() it
  // directly from node_modules at runtime instead of trying to bundle it.
  serverExternalPackages: ['@napi-rs/canvas'],
  ...(OFFLINE ? {
    // `next dev`: waiter tablets open the app by the PC's LAN IP, and the dev
    // server refuses its own scripts to any host but localhost unless listed
    // here. Production builds don't have this check.
    allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
    // The EXE runs the app as `node server.js` from one self-contained folder.
    output: 'standalone' as const,
    // Own build folder, so online and offline builds (and dev servers) never
    // overwrite or reuse each other's output.
    distDir: '.next-offline',
  } : {}),
  experimental: {
    // Turbopack's persistent build cache (on by default in Next 16.3) kept
    // serving an old globals.css: new utilities were generated but the file's
    // own rules (the .paper receipt styles, print CSS) never shipped, locally
    // and on Vercel, which restores the cache between deploys. Builds are only
    // a few seconds slower without it.
    turbopackFileSystemCacheForBuild: false,
  },
  // Disable Turbopack for dev — avoids the Windows Rust resolver
  // "Next.js package not found" HMR bug in Next.js 15-16 on Windows.
  // Re-enable once the upstream Turbopack path-resolution bug is patched.
  turbopack: {
    resolveAlias: {
      // Anchor 'next' to the exact installed copy so the Rust resolver
      // can always find it regardless of working-directory context.
      next: path.resolve(process.cwd(), "node_modules/next"),
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'nymzbuhphoflufxgpaxq.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // Customer face-scan selfies live in a private bucket and are served
        // via signed URL (see src/app/api/upload/selfie/route.ts), not the
        // public object path above.
        protocol: 'https',
        hostname: 'nymzbuhphoflufxgpaxq.supabase.co',
        pathname: '/storage/v1/object/sign/customer-selfies/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    // Offline, uploads are saved as relative links (/storage/v1/...) served by
    // the gateway in front of Next; the optimizer would fetch them from Next
    // itself, which doesn't serve them. Images are small and local anyway.
    ...(OFFLINE ? { unoptimized: true } : {}),
  },
  async headers() {
    // Content-Security-Policy is shipped in Report-Only mode first so it cannot
    // break WebUSB / Web Bluetooth printing, Supabase realtime, or face-api.
    // Violations are POSTed to /api/csp-report and logged as "[csp]" lines in
    // the server logs. Once a few days of real traffic (printing, face scan,
    // delivery map, table QR) log none, rename the header below to
    // `Content-Security-Policy` to enforce.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // Leaflet tiles + marker icons (delivery map), table-QR preview images.
      "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://unpkg.com https://api.qrserver.com",
      // Nominatim reverse geocoding + face-api model weights (delivery checkout).
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://oauth2.googleapis.com https://fcm.googleapis.com https://nominatim.openstreetmap.org https://cdn.jsdelivr.net",
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "report-uri /api/csp-report",
    ].join('; ')

    // Enforced now: the directives that don't gate resource loading, so they
    // can't break printing / realtime / face-api / maps while the full policy
    // above is still being observed in Report-Only.
    const cspEnforced = [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; ')

    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), usb=(self), bluetooth=(self), serial=(self)' },
      { key: 'Content-Security-Policy', value: cspEnforced },
      { key: 'Content-Security-Policy-Report-Only', value: csp },
    ]

    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
      {
        // Android app updater manifest — must never be served stale.
        source: '/android-latest.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/json; charset=utf-8' },
        ],
      },
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  async redirects() {
    return [
      {
        // The APKs moved from public/apps to the android-apps GitHub release
        // (src/lib/apkHosting.ts) so Capacitor stops copying them into every
        // APK. Old links keep working: the marketing site, printed QR codes,
        // links already sent to customers, any cached manifest.
        source: '/apps/:file([A-Za-z0-9_-]+\\.apk)',
        destination: `${APK_DOWNLOAD_BASE}/:file`,
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
