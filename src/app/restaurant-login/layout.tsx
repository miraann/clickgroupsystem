import { LanguageProvider } from '@/lib/i18n/LanguageContext'

export default function RestaurantLoginLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}
