import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, serverError } from '@/lib/api-auth'
import { serviceClient } from '@/lib/provision'

export const runtime = 'nodejs'

type PlanInput = {
  name?: string
  slug?: string
  price?: number
  billing_period?: string
  description?: string | null
  color?: string
  modules?: Record<string, boolean>
  is_active?: boolean
  sort_order?: number
}

function cleanPayload(b: PlanInput) {
  return {
    name:           (b.name ?? '').trim(),
    slug:           (b.slug ?? '').trim(),
    price:          Number.isFinite(b.price) ? b.price : 0,
    billing_period: b.billing_period === 'yearly' ? 'yearly' : 'monthly',
    description:    b.description?.toString().trim() || null,
    color:          b.color || 'indigo',
    modules:        b.modules && typeof b.modules === 'object' ? b.modules : {},
    is_active:      b.is_active !== false,
    sort_order:     Number.isFinite(b.sort_order) ? Math.trunc(b.sort_order as number) : 0,
  }
}

export async function GET() {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const admin = serviceClient()
    const { data } = await admin
      .from('plans')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    return NextResponse.json({ plans: data ?? [] })
  } catch (e) {
    return serverError(e)
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const payload = cleanPayload(await req.json() as PlanInput)
    if (!payload.name) return NextResponse.json({ error: 'Plan name is required.' }, { status: 400 })
    if (!payload.slug) return NextResponse.json({ error: 'Slug is required.' }, { status: 400 })

    const admin = serviceClient()
    const { data, error: insErr } = await admin.from('plans').insert(payload).select('id').single()
    if (insErr) return serverError(insErr)
    return NextResponse.json({ ok: true, id: data.id })
  } catch (e) {
    return serverError(e)
  }
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const body = await req.json() as PlanInput & { id?: string }
    if (!body.id) return NextResponse.json({ error: 'Missing plan id.' }, { status: 400 })
    const payload = cleanPayload(body)
    if (!payload.name) return NextResponse.json({ error: 'Plan name is required.' }, { status: 400 })
    if (!payload.slug) return NextResponse.json({ error: 'Slug is required.' }, { status: 400 })

    const admin = serviceClient()
    const { error: upErr } = await admin.from('plans').update(payload).eq('id', body.id)
    if (upErr) return serverError(upErr)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSeller()
  if (error) return error
  try {
    const { id } = await req.json() as { id?: string }
    if (!id) return NextResponse.json({ error: 'Missing plan id.' }, { status: 400 })
    const admin = serviceClient()
    const { error: delErr } = await admin.from('plans').delete().eq('id', id)
    if (delErr) return serverError(delErr)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
