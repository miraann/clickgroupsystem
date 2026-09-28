import type { Metadata, Viewport } from "next";
import { preconnect } from "react-dom";
import NativeShell from "@/components/NativeShell";
import NavProgress from "@/components/NavProgress";
import { NATIVE_SHELL_SCRIPT } from "@/lib/nativeShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClickGroup POS",
  description: "Restaurant & Cafe Management System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CG POS",
  },
  icons: {
    icon: [
      { url: "/logo/android/launchericon-48x48.png",   sizes: "48x48",   type: "image/png" },
      { url: "/logo/android/launchericon-72x72.png",   sizes: "72x72",   type: "image/png" },
      { url: "/logo/android/launchericon-96x96.png",   sizes: "96x96",   type: "image/png" },
      { url: "/logo/android/launchericon-144x144.png", sizes: "144x144", type: "image/png" },
      { url: "/logo/android/launchericon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo/android/launchericon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/logo/ios/57.png",   sizes: "57x57"   },
      { url: "/logo/ios/60.png",   sizes: "60x60"   },
      { url: "/logo/ios/72.png",   sizes: "72x72"   },
      { url: "/logo/ios/76.png",   sizes: "76x76"   },
      { url: "/logo/ios/114.png",  sizes: "114x114" },
      { url: "/logo/ios/120.png",  sizes: "120x120" },
      { url: "/logo/ios/144.png",  sizes: "144x144" },
      { url: "/logo/ios/152.png",  sizes: "152x152" },
      { url: "/logo/ios/167.png",  sizes: "167x167" },
      { url: "/logo/ios/180.png",  sizes: "180x180" },
      { url: "/logo/ios/1024.png", sizes: "1024x1024" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#080b14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Open the TLS connection to Supabase while the JS bundle is still loading,
  // so the first data request doesn't pay for the handshake.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    preconnect(process.env.NEXT_PUBLIC_SUPABASE_URL, { crossOrigin: "anonymous" });
  }

  return (
    // suppressHydrationWarning: NATIVE_SHELL_SCRIPT adds `cg-app` to <html>
    // inside the Android app before React hydrates.
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NATIVE_SHELL_SCRIPT }} />
      </head>
      <body className="min-h-full bg-[#080b14] text-white antialiased">
        {children}
        <NavProgress />
        <NativeShell />
      </body>
    </html>
  );
}
