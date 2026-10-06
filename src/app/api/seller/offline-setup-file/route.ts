import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, serverError } from '@/lib/api-auth'
import { serviceClient } from '@/lib/supabase/service'
import { IS_OFFLINE_EDITION } from '@/lib/edition'
import { setupFileData } from '@/lib/offlineCloud.server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Seller panel: the setup file for an offline PC that has no internet at all
// (copied by USB, opened on the PC's setup screen). Holds the restaurant's
// set-up including PIN and password hashes, so only the seller can get it.
export async function GET(req: NextRequest) {
  if (IS_OFFLINE_EDITION) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await requireSeller()
  if (error) return error
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  if (!restaurantId) return NextResponse.json({ error: 'Missing restaurant.' }, { status: 400 })
  try {
    return NextResponse.json(await setupFileData(serviceClient(), restaurantId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return serverError(e)
  }
}
