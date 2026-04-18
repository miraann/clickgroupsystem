import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────
export interface OnlineMenuSettings {
  template:          string
  primary_color:     string
  surface_style:     string
  category_style:    string
  item_style:        string
  event_style:       string
  social_style:      string
  show_prices:       boolean
  show_descriptions: boolean
  welcome_text:      string | null
}

export interface OnlineMenuPreview {
  name:        string
  logo_url:    string | null
  categories:  { id: string; name: string; color: string; icon: string | null }[]
  items:       { id: string; name: string; price: number; image_url: string | null; description: string | null }[]
  events:      { id: string; title: string; image_url: string | null; date_label: string | null }[]
  socialLinks: { key: string; label: string; bg: string }[]
}

export interface OnlineMenuData {
  settings: OnlineMenuSettings | null
  preview:  OnlineMenuPreview
}

const SOCIAL_MAP = [
  { key: 'facebook',  label: 'Facebook',  bg: '#1877f2' },
  { key: 'instagram', label: 'Instagram', bg: '#e1306c' },
  { key: 'whatsapp',  label: 'WhatsApp',  bg: '#25d366' },
  { key: 'snapchat',  label: 'Snapchat',  bg: '#fffc00' },
  { key: 'tiktok',    label: 'TikTok',    bg: '#010101' },
  { key: 'twitter',   label: 'X',         bg: '#14171a' },
  { key: 'youtube',   label: 'YouTube',   bg: '#ff0000' },
  { key: 'maps_url',  label: 'Location',  bg: '#10b981' },
]

async function fetchOnlineMenuData(restaurantId: string): Promise<OnlineMenuData> {
  const supabase = createClient()

  const [tplRes, restRes, catsRes, itemsRes, eventsRes] = await Promise.all([
    supabase
      .from('menu_template_settings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
    supabase
      .from('restaurants')
      .select('name, logo_url, settings')
      .eq('id', restaurantId)
      .maybeSingle(),
    supabase
      .from('menu_categories')
      .select('id, name, color, icon')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('sort_order')
      .limit(5),
    supabase
      .from('menu_items')
      .select('id, name, price, image_url, description')
      .eq('restaurant_id', restaurantId)
      .eq('available', true)
      .order('sort_order')
      .limit(4),
    supabase
      .from('events_offers')
      .select('id, title, image_url, date_label')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('sort_order')
      .limit(4),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rs = (restRes.data as any)?.settings ?? {}
  const socialLinks = SOCIAL_MAP.filter(s => rs[s.key]?.trim())

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings: tplRes.data ? (tplRes.data as any) : null,
    preview: {
      name:        restRes.data?.name       ?? '',
      logo_url:    restRes.data?.logo_url   ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categories:  (catsRes.data  ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items:       (itemsRes.data ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events:      (eventsRes.data ?? []) as any,
      socialLinks,
    },
  }
}

export function useOnlineMenuSettings(restaurantId: string | null) {
  return useSWR<OnlineMenuData>(
    restaurantId ? `online-menu-settings-${restaurantId}` : null,
    () => fetchOnlineMenuData(restaurantId!),
    {
      revalidateOnFocus: false,
      dedupingInterval:  60_000,   // template settings rarely change mid-session
      keepPreviousData:  true,
    }
  )
}
