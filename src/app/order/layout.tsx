import { LanguageProvider } from '@/lib/i18n/LanguageContext'

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}
