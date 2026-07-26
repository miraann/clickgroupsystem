'use client'

const LABELS = {
  en: {
    paymentMethod:  'Payment Method',
    subtotal:       'Subtotal',
    discount:       'Discount',
    surcharge:      'Surcharge',
    total:          'Total',
    totalAmount:    'Total Amount',
    amountTendered: 'Amount Tendered',
    change:         'Change',
    paid:           '✓ PAID',
  },
  ku: {
    paymentMethod:  'شێوازی پارەدان',
    subtotal:       'کۆی کاڵاکان',
    discount:       'داشکاندن',
    surcharge:      'زیادە',
    total:          'کۆی گشتی',
    totalAmount:    'کۆی گشتی',
    amountTendered: 'پارەی دراو',
    change:         'پارەی گەڕاوە',
    paid:           '✓ پارەدراو',
  },
}

interface Props {
  mode:          'receipt' | 'payment'
  language:      'ku' | 'en'
  paymentMethod: string
  subtotal:      number
  discount:      number
  surcharge:     number
  total:         number
  amountPaid:    number
  changeAmount:  number
  dateStr:       string
  timeStr:       string
  formatPrice:   (n: number) => string
}

export function PaymentDetails({
  mode, language, paymentMethod,
  subtotal, discount, surcharge, total,
  amountPaid, changeAmount,
  dateStr, timeStr,
  formatPrice,
}: Props) {
  const L = LABELS[language]

  return (
    <>
      {/* Payment method banner */}
      <div className="border-t border-dashed border-gray-300" />
      <div className="px-5 py-2 text-center">
        <p className="text-[10px] font-bold text-black">{L.paymentMethod}</p>
        <p className="font-extrabold text-black text-[13px]">{paymentMethod}</p>
      </div>

      <div className="border-t border-dashed border-gray-300" />

      {/* Line-item totals */}
      <div className="px-5 py-3 space-y-1">
        <div className="flex justify-between font-bold text-black">
          <span>{L.subtotal}</span>
          <span className="tabular-nums" dir="ltr">{formatPrice(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between font-bold text-red-600">
            <span>{L.discount}</span>
            <span className="tabular-nums" dir="ltr">-{formatPrice(discount)}</span>
          </div>
        )}
        {surcharge > 0 && (
          <div className="flex justify-between font-bold text-orange-600">
            <span>{L.surcharge}</span>
            <span className="tabular-nums" dir="ltr">+{formatPrice(surcharge)}</span>
          </div>
        )}
        <div className="flex justify-between font-extrabold text-black text-[13px] pt-1 border-t border-gray-200">
          <span>{L.total}</span>
          <span className="tabular-nums" dir="ltr">{formatPrice(total)}</span>
        </div>
        {amountPaid > 0 && amountPaid > total && (
          <>
            <div className="flex justify-between font-bold text-black">
              <span>{L.amountTendered}</span>
              <span className="tabular-nums" dir="ltr">{formatPrice(amountPaid)}</span>
            </div>
            <div className="flex justify-between font-bold text-black">
              <span>{L.change}</span>
              <span className="tabular-nums" dir="ltr">{formatPrice(changeAmount)}</span>
            </div>
          </>
        )}
      </div>

      {/* Premium dark total box */}
      <div className="mx-5 mb-4 rounded-2xl bg-slate-900 ring-1 ring-slate-700 py-4 text-center shadow-xl shadow-slate-900/20">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{L.totalAmount}</p>
        <p className="text-[22px] font-black text-white tabular-nums tracking-tight" dir="ltr">
          {formatPrice(total)}
        </p>
        {mode === 'payment' && (
          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-[13px] font-extrabold text-emerald-400">{L.paid}</p>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5" dir="ltr">
              {dateStr} · {timeStr}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
