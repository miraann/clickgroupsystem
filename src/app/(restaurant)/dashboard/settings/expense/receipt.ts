import { createClient } from '@/lib/supabase/client'

// Expense receipts live in the private `receipts` bucket (20260930_04) and are
// shown through short-lived signed URLs. New rows store the object path in
// expenses.receipt_url; older rows hold the URL from when the bucket was
// public — both resolve to the same path.
export function receiptPath(stored: string): string | null {
  const m = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/receipts\/([^?#]+)/)
  if (m) return decodeURIComponent(m[1])
  return /^[a-z]+:\/\//i.test(stored) ? null : stored
}

export async function signedReceiptUrl(stored: string): Promise<string | null> {
  const path = receiptPath(stored)
  if (!path) return null
  const { data } = await createClient().storage.from('receipts').createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}
