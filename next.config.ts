import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
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
    ],
    formats: ['image/webp', 'image/avif'],
  },
  async headers() {
    // Content-Security-Policy is shipped in Report-Only mode first so it cannot
    // break WebUSB / Web Bluetooth printing, Supabase realtime, or face-api.
    // Watch the browser console / a report endpoint, then rename the header to
    // `Content-Security-Policy` to enforce.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://oauth2.googleapis.com https://fcm.googleapis.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')

    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), usb=(self), bluetooth=(self), serial=(self)' },
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
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
