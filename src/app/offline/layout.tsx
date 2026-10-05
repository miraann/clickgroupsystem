import { notFound } from 'next/navigation'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { IS_OFFLINE_EDITION } from '@/lib/edition'

// Screens of the offline edition's desktop app (first-run setup, licence).
// They talk to the PC's own backend at /offline/v1, so they don't exist online.
export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  if (!IS_OFFLINE_EDITION) notFound()
  return <LanguageProvider>{children}</LanguageProvider>
}
