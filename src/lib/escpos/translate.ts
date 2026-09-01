// Thermal printers without an Arabic/Kurdish font ROM render non-Latin bytes as
// replacement garbage ("å‡Ø‡…"). For English-mode receipts we therefore force
// every dynamic value (payment method, currency symbol, item names, notes …) to
// printable ASCII, translating the common Kurdish (Sorani) / Arabic terms to
// their English equivalents first.

/** Known payment-method names → English. Tested against the raw value with the
 *  Unicode `i` flag; order matters (first match wins). */
const PAYMENT_METHOD_MAP: [RegExp, string][] = [
  [/کاش|كاش|نەقد|نه‌قد|نقد|cash/i,                              'Cash'],
  [/قەرز|قه‌رز|قرض|دەین|دین|دواتر|پاش.?دان|آجل|ئاجل|later|credit/i, 'Pay Later'],
  [/کارت|كارت|ڤیزا|فيزا|ماستەر|visa|master|card|بانک|بنك/i,      'Card'],
  [/ئۆن.?لا?ین|ئۆنڵاین|اون.?لاين|online|نێت/i,                   'Online'],
  [/فاست.?پەی|fast.?pay/i,                                      'FastPay'],
  [/جیب|جێب|محفظة|wallet|هەڵگر|زاین/i,                          'Wallet'],
  [/حواله|حەواڵە|گواستنەوە|transfer/i,                          'Transfer'],
]

/** Known currency symbols → ASCII. */
const CURRENCY_MAP: [RegExp, string][] = [
  [/دینار|دينار|دیناری عێراقی|د\.?ع|iqd/i, 'IQD'],
  [/دۆلار|دولار|usd/i,                     '$'],
  [/یۆرۆ|يورو|eur/i,                       'EUR'],
  [/پاوەن|جنيه|gbp/i,                      'GBP'],
]

/** Collapse a string to printable ASCII, dropping anything the printer can't
 *  render. Diacritics on Latin letters are folded (é → e); everything outside
 *  the printable ASCII range is removed. */
export function toAscii(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .normalize('NFKD')                 // fold Latin diacritics (é → e + mark)
    .replace(/[^\x20-\x7e]/g, '')      // then keep printable ASCII only
    .replace(/\s+/g, ' ')
    .trim()
}

/** English label for a payment method, given its stored name and (optionally)
 *  its icon_type bucket as a fallback. */
export function enPaymentMethod(name: string | null | undefined, iconType?: string | null): string {
  const raw = (name ?? '').trim()
  for (const [re, en] of PAYMENT_METHOD_MAP) if (re.test(raw)) return en

  const ascii = toAscii(raw)
  if (/[a-z0-9]/i.test(ascii)) return ascii   // a real Latin name — keep it

  switch ((iconType ?? '').toLowerCase()) {
    case 'card':   return 'Card'
    case 'online': return 'Online'
    case 'wallet': return 'Wallet'
    case 'other':  return 'Other'
    default:       return 'Cash'
  }
}

/** ASCII currency symbol — '' when nothing printable remains (amounts still
 *  read fine on their own). */
export function enCurrencySymbol(symbol: string | null | undefined): string {
  const raw = (symbol ?? '').trim()
  for (const [re, en] of CURRENCY_MAP) if (re.test(raw)) return en
  const ascii = toAscii(raw)
  return /[a-z0-9$]/i.test(ascii) ? ascii : ''   // drop lone punctuation left by stripping
}
