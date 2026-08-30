import { LanguageProvider } from '@/lib/i18n/LanguageContext'

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}
