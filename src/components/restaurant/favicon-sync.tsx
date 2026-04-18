'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function FaviconSync() {
  useEffect(() => {
    const sync = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('restaurants')
        .select('logo_url, name')
        .limit(1)
        .maybeSingle()

      if (!data?.logo_url) return

      // Update favicon
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = data.logo_url
      link.type = 'image/png'

      // Update tab title
      if (data.name) {
        document.title = data.name
      }
    }
    sync()
  }, [])

  return null
}
