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
    return [
      {
        // Service worker must never be cached — browser checks for updates on each load
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        // Manifest can be cached briefly
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ]
  },
};

export default nextConfig;
