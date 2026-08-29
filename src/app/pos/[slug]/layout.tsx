import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params

  let restaurantName = 'Staff Login'
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('restaurant_public')
      .select('name')
      .eq('menu_slug', slug)
      .maybeSingle()
    if (data?.name) restaurantName = `${data.name} – Staff`
  } catch { /* use fallback title */ }

  return {
    title:    restaurantName,
    manifest: `/api/manifest/staff/${slug}`,
    appleWebApp: {
      capable:         true,
      title:           restaurantName,
      statusBarStyle:  'black-translucent',
    },
  }
}

export default function PosSlugLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}
