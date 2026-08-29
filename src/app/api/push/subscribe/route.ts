import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRestaurant, getRestaurantSession, serverError } from '@/lib/api-auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { restaurant_id, staff_id } = body

    if (!restaurant_id) return NextResponse.json({ error: 'Missing restaurant_id' }, { status: 400 })

    // Only a signed-in member of this restaurant may register a device for it.
    const { error: authErr } = await requireRestaurant(restaurant_id)
    if (authErr) return authErr

    const supabase = await createClient()

    if (body.fcm_token) {
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { restaurant_id, endpoint: body.fcm_token, type: 'fcm', subscription: null, staff_id: staff_id ?? null },
          { onConflict: 'endpoint' }
        )
      if (error) return serverError(error)
    } else if (body.subscription) {
      const endpoint = (body.subscription as { endpoint: string }).endpoint
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { restaurant_id, endpoint, type: 'web', subscription: body.subscription, staff_id: staff_id ?? null },
          { onConflict: 'endpoint' }
        )
      if (error) return serverError(error)
    } else {
      return NextResponse.json({ error: 'Missing subscription or fcm_token' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json()
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

    const session = await getRestaurantSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createClient()
    // Scope the delete to the caller's restaurant so one tenant can't drop
    // another tenant's device registrations by guessing endpoints.
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('restaurant_id', session.rid)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
