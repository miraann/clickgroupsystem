import type { Lang } from '@/lib/i18n/translations'

export interface DefaultWaTemplate {
  key:     'receipt' | 'delivery_confirm' | 'delivery_receipt'
  name:    string
  message: string
}

const SEP = '━━━━━━━━━━━━━━'

// Built-in receipt templates offered on Settings → WhatsApp, and used by the
// payment screen when the restaurant hasn't saved any templates of its own.
// `receipt` uses the POS variables (payment screen), `delivery_confirm` and
// `delivery_receipt` the delivery-order ones — see fillWaTemplate callers for
// what each resolves.
const DEFAULTS: Record<Lang, DefaultWaTemplate[]> = {
  ku: [
    {
      key: 'receipt',
      name: 'پسوولە',
      message: [
        '🧾 *{{restaurant_name}}*',
        SEP,
        'ژمارەی پسوولە: {{invoice_number}}',
        'داواکاری: {{order_number}}',
        'مێز: {{table}}',
        'بەروار: {{date}}',
        SEP,
        '{{items}}',
        SEP,
        '💰 *کۆی گشتی: {{total}}*',
        '',
        'سوپاس بۆ سەردانتان 🙏',
        'مێنیۆ: {{menu_link}}',
      ].join('\n'),
    },
    {
      key: 'delivery_confirm',
      name: 'پشتڕاستکردنەوەی داواکاری',
      message: [
        '🛵 *{{restaurant_name}}*',
        'سڵاو {{customer_name}} 👋',
        'داواکارییەکەت {{order_number}} وەرگیرا. تکایە وردەکارییەکان بپشکنە و پشتڕاستی بکەرەوە:',
        SEP,
        '{{items}}',
        SEP,
        'کۆی کاڵاکان: {{subtotal}}',
        'کرێی گەیاندن: {{delivery_fee}}',
        '💰 *کۆی گشتی: {{total_price}}*',
        '📍 ناونیشان: {{address}}',
        '',
        '✅ بۆ پشتڕاستکردنەوە بنووسە *بەڵێ*',
        '❌ بۆ هەڵوەشاندنەوە بنووسە *نەخێر*',
        '',
        'سوپاس 🙏',
      ].join('\n'),
    },
    {
      key: 'delivery_receipt',
      name: 'پسوولەی گەیاندن',
      message: [
        '🧾 *{{restaurant_name}}*',
        SEP,
        'سڵاو {{customer_name}} 👋',
        'داواکاری: {{order_number}}',
        SEP,
        '{{items}}',
        SEP,
        'کۆی کاڵاکان: {{subtotal}}',
        'کرێی گەیاندن: {{delivery_fee}}',
        '💰 *کۆی گشتی: {{total_price}}*',
        '',
        '📍 ناونیشان: {{address}}',
        '',
        'سوپاس بۆ داواکارییەکەت 🙏',
      ].join('\n'),
    },
  ],
  ar: [
    {
      key: 'receipt',
      name: 'الفاتورة',
      message: [
        '🧾 *{{restaurant_name}}*',
        SEP,
        'رقم الفاتورة: {{invoice_number}}',
        'الطلب: {{order_number}}',
        'الطاولة: {{table}}',
        'التاريخ: {{date}}',
        SEP,
        '{{items}}',
        SEP,
        '💰 *المجموع الكلي: {{total}}*',
        '',
        'شكراً لزيارتكم 🙏',
        'القائمة: {{menu_link}}',
      ].join('\n'),
    },
    {
      key: 'delivery_confirm',
      name: 'تأكيد الطلب',
      message: [
        '🛵 *{{restaurant_name}}*',
        'مرحباً {{customer_name}} 👋',
        'استلمنا طلبك {{order_number}}. يرجى مراجعة التفاصيل وتأكيد الطلب:',
        SEP,
        '{{items}}',
        SEP,
        'المجموع الفرعي: {{subtotal}}',
        'رسوم التوصيل: {{delivery_fee}}',
        '💰 *المجموع الكلي: {{total_price}}*',
        '📍 العنوان: {{address}}',
        '',
        '✅ للتأكيد أرسل *نعم*',
        '❌ للإلغاء أرسل *لا*',
        '',
        'شكراً لك 🙏',
      ].join('\n'),
    },
    {
      key: 'delivery_receipt',
      name: 'فاتورة التوصيل',
      message: [
        '🧾 *{{restaurant_name}}*',
        SEP,
        'مرحباً {{customer_name}} 👋',
        'الطلب: {{order_number}}',
        SEP,
        '{{items}}',
        SEP,
        'المجموع الفرعي: {{subtotal}}',
        'رسوم التوصيل: {{delivery_fee}}',
        '💰 *المجموع الكلي: {{total_price}}*',
        '',
        '📍 العنوان: {{address}}',
        '',
        'شكراً لطلبك 🙏',
      ].join('\n'),
    },
  ],
  en: [
    {
      key: 'receipt',
      name: 'Receipt',
      message: [
        '🧾 *{{restaurant_name}}*',
        SEP,
        'Invoice: {{invoice_number}}',
        'Order: {{order_number}}',
        'Table: {{table}}',
        'Date: {{date}}',
        SEP,
        '{{items}}',
        SEP,
        '💰 *Total: {{total}}*',
        '',
        'Thank you for visiting 🙏',
        'Menu: {{menu_link}}',
      ].join('\n'),
    },
    {
      key: 'delivery_confirm',
      name: 'Confirm Order',
      message: [
        '🛵 *{{restaurant_name}}*',
        'Hi {{customer_name}} 👋',
        'We received your order {{order_number}}. Please check the details and confirm:',
        SEP,
        '{{items}}',
        SEP,
        'Subtotal: {{subtotal}}',
        'Delivery fee: {{delivery_fee}}',
        '💰 *Total: {{total_price}}*',
        '📍 Address: {{address}}',
        '',
        '✅ Reply *YES* to confirm',
        '❌ Reply *NO* to cancel',
        '',
        'Thank you 🙏',
      ].join('\n'),
    },
    {
      key: 'delivery_receipt',
      name: 'Delivery Receipt',
      message: [
        '🧾 *{{restaurant_name}}*',
        SEP,
        'Hi {{customer_name}} 👋',
        'Order: {{order_number}}',
        SEP,
        '{{items}}',
        SEP,
        'Subtotal: {{subtotal}}',
        'Delivery fee: {{delivery_fee}}',
        '💰 *Total: {{total_price}}*',
        '',
        '📍 Address: {{address}}',
        '',
        'Thank you for your order 🙏',
      ].join('\n'),
    },
  ],
}

export function getDefaultWaTemplates(lang: Lang): DefaultWaTemplate[] {
  return DEFAULTS[lang] ?? DEFAULTS.en
}

/** `• Burger ×2 — 10,000 IQD` lines for the {{items}} variable. */
export function formatWaItemLines(
  items: { name: string; qty: number; price: number }[],
  formatPrice: (n: number) => string,
): string {
  return items.map(i => `• ${i.name} ×${i.qty} — ${formatPrice(i.price * i.qty)}`).join('\n')
}

/**
 * Replaces {{key}} with vars[key]. A "Label: {{var}}" line whose variables all
 * came out empty is dropped, so e.g. "Table: {{table}}" disappears on a
 * takeout order instead of being sent as a dangling "Table: ". Sentences are
 * kept. Unknown variables are left as-is.
 */
export function fillWaTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl
    .split('\n')
    .flatMap(line => {
      const keys     = [...line.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).filter(k => k in vars)
      const resolved = line.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? vars[k] : m))
      const allEmpty = keys.length > 0 && keys.every(k => !vars[k].trim())
      if (allEmpty && (!resolved.trim() || /:\s*$/.test(resolved))) return []
      return [resolved]
    })
    .join('\n')
}
