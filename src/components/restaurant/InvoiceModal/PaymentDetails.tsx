'use client'

interface Props {
  mode:          'receipt' | 'payment'
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
  mode, paymentMethod,
  subtotal, discount, surcharge, total,
  amountPaid, changeAmount,
  dateStr, timeStr,
  formatPrice,
}: Props) {
  return (
    <>
      {/* Payment method banner */}
      <div className="border-t border-dashed border-gray-300" />
      <div className="px-5 py-2 text-center">
        <p className="text-[10px] font-bold text-black">Payment Method</p>
        <p className="font-extrabold text-black text-[13px]">{paymentMethod}</p>
      </div>

      <div className="border-t border-dashed border-gray-300" />

      {/* Line-item totals */}
      <div className="px-5 py-3 space-y-1">
        <div className="flex justify-between font-bold text-black">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatPrice(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between font-bold text-red-600">
            <span>Discount</span>
            <span className="tabular-nums">-{formatPrice(discount)}</span>
          </div>
        )}
        {surcharge > 0 && (
          <div className="flex justify-between font-bold text-orange-600">
            <span>Surcharge</span>
            <span className="tabular-nums">+{formatPrice(surcharge)}</span>
          </div>
        )}
        <div className="flex justify-between font-extrabold text-black text-[13px] pt-1 border-t border-gray-200">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(total)}</span>
        </div>
        {amountPaid > 0 && amountPaid > total && (
          <>
            <div className="flex justify-between font-bold text-black">
              <span>Amount Tendered</span>
              <span className="tabular-nums">{formatPrice(amountPaid)}</span>
            </div>
            <div className="flex justify-between font-bold text-black">
              <span>Change</span>
              <span className="tabular-nums">{formatPrice(changeAmount)}</span>
            </div>
          </>
        )}
      </div>

      {/* Big total box with optional PAID stamp */}
      <div className="mx-5 mb-3 rounded-xl bg-gray-50 border border-gray-200 py-3 text-center">
        <p className="text-[10px] font-bold text-black mb-0.5">Total Amount</p>
        <p className="text-[18px] font-extrabold text-black tabular-nums">
          {formatPrice(total)}
        </p>
        {mode === 'payment' && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-[11px] font-bold text-emerald-600">✓ PAID</p>
            <p className="text-[10px] font-bold text-black mt-0.5">{dateStr} · {timeStr}</p>
          </div>
        )}
      </div>
    </>
  )
}
