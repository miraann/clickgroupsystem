import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TYPES = ['staff', 'driver', 'dashboard'] as const
type ManifestType = typeof TYPES[number]

const TYPE_CONFIG: Record<ManifestType, {
  nameSuffix:  string
  shortSuffix: string
  themeColor:  string
  bgColor:     string
  description: string
}> = {
  staff: {
    nameSuffix:  '– Staff',
    shortSuffix: 'Staff',
    themeColor:  '#0f0c29',
    bgColor:     '#0f0c29',
    description: 'Staff PIN login',
  },
  driver: {
    nameSuffix:  '– Driver',
    shortSuffix: 'Driver',
    themeColor:  '#0a1a0a',
    bgColor:     '#0a1a0a',
    description: 'Driver delivery portal',
  },
  dashboard: {
    nameSuffix:  'POS',
    shortSuffix: 'POS',
    themeColor:  '#022658',
    bgColor:     '#022658',
    description: 'Restaurant management system',
  },
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string; slug: string }> }
) {
  const { type, slug } = await params

  if (!TYPES.includes(type as ManifestType)) {
    return new NextResponse('Unknown manifest type', { status: 404 })
  }

  const cfg = TYPE_CONFIG[type as ManifestType]

  // Fetch restaurant name for a personalised manifest
  let restaurantName = 'ClickGroup'
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('restaurants')
      .select('name')
      .eq('menu_slug', slug)
      .maybeSingle()
    if (data?.name) restaurantName = data.name
  } catch { /* fall back to default name */ }

  const startUrl =
    type === 'dashboard'
      ? '/dashboard'
      : `/pos/${slug}/login`

  const manifest = {
    name:             `${restaurantName} ${cfg.nameSuffix}`,
    short_name:       cfg.shortSuffix,
    description:      cfg.description,
    start_url:        startUrl,
    scope:            '/',
    display:          'standalone',
    orientation:      'any',
    background_color: cfg.bgColor,
    theme_color:      cfg.themeColor,
    categories:       ['business', 'productivity'],
    prefer_related_applications: false,
    icons: [
      {
        src:     '/icon.svg',
        sizes:   'any',
        type:    'image/svg+xml',
        purpose: 'any',
      },
      {
        src:     '/icon-192.png',
        sizes:   '192x192',
        type:    'image/png',
        purpose: 'any maskable',
      },
      {
        src:     '/icon-512.png',
        sizes:   '512x512',
        type:    'image/png',
        purpose: 'any maskable',
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Cache for 1 hour — short enough to pick up name changes
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
