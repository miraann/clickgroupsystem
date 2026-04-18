import FaviconSync from '@/components/restaurant/favicon-sync'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { PermissionsProvider } from '@/lib/permissions/PermissionsContext'
import AuthGuard from '@/components/restaurant/AuthGuard'

export default function RestaurantLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <PermissionsProvider>
        <AuthGuard>
          <div className="min-h-screen bg-[#060810]">
            <FaviconSync />
            {children}
          </div>
        </AuthGuard>
      </PermissionsProvider>
    </LanguageProvider>
  )
}
