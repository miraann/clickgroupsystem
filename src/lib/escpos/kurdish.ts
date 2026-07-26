// Kurdish (Sorani) labels for ESC/POS thermal receipts.
// Arabic/Kurdish script requires a printer with UTF-8 or Arabic codepage support.
// On printers without Arabic font ROM, Kurdish characters print as replacement chars.

export const KU = {
  invoiceNo:      'ژ.پسووڵە',
  employee:       'کارمەند',
  cashier:        'کاشیر',
  paymentMethod:  'شێوازی پارەدان',
  item:           'کاڵا',
  qty:            'ژ.',
  price:          'نرخ',
  subtotal:       'کۆی کاڵاکان',
  discount:       'داشکاندن',
  surcharge:      'زیادە',
  total:          'کۆی گشتی',
  totalAmount:    'کۆی گشتی',
  amountTendered: 'پارەی دراو',
  change:         'پارەی گەڕاوە',
  paid:           '*** پارەدراو ***',
  yourFeedback:   'ڕای تۆ',
  name:           'ناو:',
  phoneEmail:     'تەلەفۆن:',
  feedback:       'ڕای تۆ:',
}

export function kuTableLabel(tableNum: string, guests?: number): string {
  return guests ? `${tableNum} مێز · ${guests} کۆمەڵ` : `${tableNum} مێز`
}
