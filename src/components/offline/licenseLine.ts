import type { Translations } from '@/lib/i18n/translations'
import type { OfflineStatus } from './OfflineShell'
import { fill } from './OfflineShell'

/** One sentence describing the offline licence, in the user's language. */
export function licenseLine(t: Translations, l: OfflineStatus['license']): string {
  const date = l.validUntil ?? ''
  switch (l.state) {
    case 'valid':   return fill(t.off_lic_valid,   { date, n: l.daysLeft ?? 0 })
    case 'ending':  return fill(t.off_lic_ending,  { date, n: l.daysLeft ?? 0 })
    case 'grace':   return fill(t.off_lic_grace,   { date, n: l.graceDaysLeft ?? 0 })
    case 'expired': return fill(t.off_lic_expired, { date })
    default:        return t.off_lic_none
  }
}
