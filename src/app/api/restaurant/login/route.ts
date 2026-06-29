import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'
import { createRestaurantToken, RESTAURANT_COOKIE } from '@/lib/session'

const enc = new TextEncoder()

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  // Wrap salt in a fresh Uint8Array<ArrayBuffer> to satisfy TypeScript's BufferSource constraint
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: Uint8Array.from(salt), iterations: 100_000, hash: 'SHA-256' },
    key, 256,
  )
  return new Uint8Array(bits)
}

async function hashPassword(password: string): Promise<string> {
  const salt = Uint8Array.from(crypto.getRandomValues(new Uint8Array(16)))
  const hash = await pbkdf2(password, salt)
  return `pbkdf2:${toHex(salt)}:${toHex(hash)}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('pbkdf2:')) {
    // Legacy plaintext — compare and migrate on success
    return password === stored
  }
  const parts = stored.split(':')
  if (parts.length !== 3) return false
  const salt     = fromHex(parts[1])
  const expected = fromHex(parts[2])
  const hash     = await pbkdf2(password, salt)
  return timingSafeEqual(hash, expected)
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'restaurant/login', 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  try {
    const { email, password } = await req.json() as { email?: string; password?: string }

    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const supabase = serviceClient()

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, name, menu_slug, settings')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (!restaurant) {
      return NextResponse.json({ error: 'No restaurant found with this email address.' }, { status: 401 })
    }

    const settings = (restaurant.settings ?? {}) as Record<string, unknown>
    const storedPassword = settings.password as string | undefined

    if (!storedPassword) {
      return NextResponse.json({ error: 'No password set. Contact support.' }, { status: 401 })
    }

    const match = await verifyPassword(password.trim(), storedPassword)
    if (!match) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }

    // One-time migration: hash any plaintext password found
    if (!storedPassword.startsWith('pbkdf2:')) {
      const hashed = await hashPassword(password.trim())
      await supabase
        .from('restaurants')
        .update({ settings: { ...settings, password: hashed } })
        .eq('id', restaurant.id)
    }

    const token = await createRestaurantToken(restaurant.id, 'owner')

    const res = NextResponse.json({
      ok: true,
      restaurant: {
        id:       restaurant.id,
        name:     restaurant.name,
        menu_slug: restaurant.menu_slug,
      },
    })

    res.cookies.set(RESTAURANT_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   8 * 3600,
    })

    return res
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
