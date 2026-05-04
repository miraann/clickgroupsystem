import FaviconSync from '@/components/restaurant/favicon-sync'
import WakeLock from '@/components/restaurant/wake-lock'
import PWARegister from '@/components/restaurant/pwa-register'
import { PageTransition } from '@/components/restaurant/PageTransition'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { PermissionsProvider } from '@/lib/permissions/PermissionsContext'
import AuthGuard from '@/components/restaurant/AuthGuard'

export default function RestaurantLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <PermissionsProvider>
        <AuthGuard>
          <div className="min-h-screen bg-[#022658]">
            <FaviconSync />
            <WakeLock />
            <PWARegister />
            <PageTransition>{children}</PageTransition>
          </div>
        </AuthGuard>
      </PermissionsProvider>
    </LanguageProvider>
  )
}
