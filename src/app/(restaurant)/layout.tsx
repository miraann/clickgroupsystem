import FaviconSync from '@/components/restaurant/favicon-sync'
import WakeLock from '@/components/restaurant/wake-lock'
import PWARegister from '@/components/restaurant/pwa-register'
import { PageTransition } from '@/components/restaurant/PageTransition'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { PermissionsProvider } from '@/lib/permissions/PermissionsContext'
import AuthGuard from '@/components/restaurant/AuthGuard'
import AppearanceBgProvider from '@/components/restaurant/AppearanceBgProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function RestaurantLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <PermissionsProvider>
          <AuthGuard>
            <AppearanceBgProvider>
              <div className="min-h-screen" style={{ background: 'var(--app-bg, #022658)' }}>
                <FaviconSync />
                <WakeLock />
                <PWARegister />
                <PageTransition>{children}</PageTransition>
              </div>
            </AppearanceBgProvider>
          </AuthGuard>
        </PermissionsProvider>
      </LanguageProvider>
    </ErrorBoundary>
  )
}
