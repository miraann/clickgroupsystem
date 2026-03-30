'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, UtensilsCrossed } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Restaurant {
  id: string; name: string; logo_url: string | null
}

export default function PublicRestaurantPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>()
  const supabase = createClient()

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, logo_url')
      .eq('id', restaurantId)
      .maybeSingle()
    if (error || !data) { setError('Restaurant not found.'); setLoading(false); return }
    setRestaurant(data as Restaurant)
    setLoading(false)
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
    </div>
  )

  if (error || !restaurant) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <UtensilsCrossed className="w-10 h-10 text-gray-200" />
    </div>
  )

  return (
    <div className="min-h-screen bg-white flex flex-col items-center pt-16">
      {/* Circle logo */}
      <div className="w-36 h-36 rounded-full ring-4 ring-amber-400 ring-offset-4 overflow-hidden bg-gray-100 shadow-xl">
        {restaurant.logo_url
          ? <img src={restaurant.logo_url} alt={restaurant.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <span className="text-white text-5xl font-bold">{restaurant.name.charAt(0).toUpperCase()}</span>
            </div>
        }
      </div>
      <h1 className="mt-4 text-2xl font-bold text-gray-900 tracking-tight">{restaurant.name}</h1>
    </div>
  )
}
