import { NextResponse } from 'next/server'
import { requireSeller, serverError } from '@/lib/api-auth'
import { serviceClient } from '@/lib/provision'

export const runtime = 'nodejs'

// System-wide staff list for the seller "All Users" page.
export async function GET() {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const admin = serviceClient()
    const { data } = await admin
      .from('staff')
      .select('id, name, email, role, status, created_at, restaurant_id, restaurants(name)')
      .order('created_at', { ascending: false })
    return NextResponse.json({ staff: data ?? [] })
  } catch (e) {
    return serverError(e)
  }
}
