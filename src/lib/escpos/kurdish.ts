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
  tip:            'بەخشیش',
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
  return guests ? `${tableNum} مێز · ${guests} کەس` : `${tableNum} مێز`
}

// Kurdish labels for the kitchen ticket — mirrors the header/labels used on
// the KDS screen (kds_title etc. in src/lib/i18n/ku.ts) so the printed
// ticket reads the same as the on-screen kitchen order.
export const KU_KITCHEN = {
  title: 'داواکاری چێشتخانە',
}

// Kurdish labels for the Daily Sales report — mirrors the dsr_* keys in
// src/lib/i18n/ku.ts so the printed report reads the same as the on-screen one.
export const KU_REPORT = {
  title:            'ڕاپۆرتی فرۆشتنی ڕۆژانە',
  transactions:     'مامەڵەکان',
  totalRevenue:     'کۆی داهات',
  avgOrder:         'ڕێژە بەپێی فرۆش',
  guestsServed:     'میوانی خزمەتکراو',
  totalDiscounts:   'کۆی داشکاندنەکان',
  totalTips:        'کۆی بەخشیشەکان',
  changeGiven:      'پارەی گەڕاوە',
  paymentMethods:   'شێوازەکانی پارەدان',
  orderTypes:       'جۆرەکانی داواکاری',
  dineIn:           'لەناو خواردنگە',
  takeout:          'دەرکردن',
  delivery:         'گەیاندن',
  customerSplit:    'دابەشکردنی کڕیار',
  member:           'ئەندام',
  walkIn:           'کڕیاری ئاسایی',
  topItems:         'باشترین کاڵا فرۆشراوەکان',
  byCashier:        'بەپێی کاشێر',
  expensesProfit:   'خەرجی و قازانجی ڕەها',
  grossRevenue:     'کۆی داهاتی گشتی',
  paidExpenses:     'خەرجی دراو',
  netProfit:        'قازانجی ڕەها',
  monthAvg:         'ڕێژەی فرۆشتنی مانگانە',
  avgDailySales:    'ڕێژەی فرۆشتنی ڕۆژانە',
  avgDailyExpense:  'ڕێژەی خەرجی ڕۆژانە',
  endOfReport:      'کۆتایی ڕاپۆرت',
}
