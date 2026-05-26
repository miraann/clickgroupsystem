import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const restaurant_id = searchParams.get('restaurant_id')

  const result: Record<string, unknown> = {}

  // Check env vars
  result.env = {
    FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: !!process.env.VAPID_SUBJECT,
  }

  // Try parsing service account
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      result.service_account = { project_id: sa.project_id, client_email: sa.client_email, valid: true }
    } catch (e) {
      result.service_account = { valid: false, error: String(e) }
    }
  }

  // Check subscriptions in DB
  if (restaurant_id) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, type, endpoint, created_at')
      .eq('restaurant_id', restaurant_id)
    result.subscriptions = error ? { error: error.message } : data
  } else {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, restaurant_id, type, created_at')
      .limit(10)
    result.all_subscriptions = error ? { error: error.message } : data
  }

  return NextResponse.json(result, { status: 200 })
}
