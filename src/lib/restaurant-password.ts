import 'server-only'
import { serviceClient } from '@/lib/supabase/service'
import { hashSecret, verifySecret, isLegacyPlaintext } from '@/lib/crypto'

export interface PasswordCheckOk {
  ok: true
  restaurant: { id: string; name: string; menu_slug: string | null }
  hasOwnerPin: boolean
}
export interface PasswordCheckFail {
  ok: false
  status: number
  error: string
}

/**
 * Restaurant email + password check shared by the dashboard login and CFD
 * pairing. The password lives only in restaurant_secrets — never trust a
 * `settings.password` key, since restaurants.settings is tenant-writable.
 * A legacy plaintext value is re-hashed in place on the first match.
 */
export async function checkRestaurantPassword(
  email: string,
  password: string,
): Promise<PasswordCheckOk | PasswordCheckFail> {
  const sb = serviceClient()

  const { data: restaurant } = await sb
    .from('restaurants')
    .select('id, name, menu_slug')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  if (!restaurant) {
    return { ok: false, status: 401, error: 'No restaurant found with this email address.' }
  }

  const { data: secretRow } = await sb
    .from('restaurant_secrets')
    .select('password_hash, owner_pin_hash')
    .eq('restaurant_id', restaurant.id)
    .maybeSingle()

  const stored = secretRow?.password_hash as string | undefined
  if (!stored) {
    return { ok: false, status: 401, error: 'No password set. Contact support.' }
  }

  if (!(await verifySecret(password, stored))) {
    return { ok: false, status: 401, error: 'Incorrect password.' }
  }

  if (isLegacyPlaintext(stored)) {
    await sb
      .from('restaurant_secrets')
      .update({ password_hash: await hashSecret(password), updated_at: new Date().toISOString() })
      .eq('restaurant_id', restaurant.id)
  }

  return {
    ok: true,
    restaurant: restaurant as PasswordCheckOk['restaurant'],
    hasOwnerPin: !!(secretRow?.owner_pin_hash as string | undefined),
  }
}
