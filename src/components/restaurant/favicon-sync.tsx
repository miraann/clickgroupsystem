'use client'
import { useEffect } from 'react'
import { useRestaurant } from '@/hooks/useRestaurant'

export default function FaviconSync() {
  const { restaurant } = useRestaurant()

  useEffect(() => {
    if (!restaurant?.logo_url) return

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = restaurant.logo_url
    link.type = 'image/png'

    if (restaurant.name) document.title = restaurant.name
  }, [restaurant?.logo_url, restaurant?.name])

  return null
}
