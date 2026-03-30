'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Printer, Loader2, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

interface Item { name: string; price: number; qty: number }

interface Props {
  orderId: string
  restaurantId: string
  tableNum: string
  guests: number
  items: Item[]
  subtotal: number
  discount: number
  total: number
  paymentMethod: string
  amountPaid: number
  changeAmount: number
  cashier: string
  onClose: () => void
}

interface ReceiptSettings {
  shop_name: string | null
  logo_url: string | null
  phone: string | null
  address: string | null
  thank_you_msg: string | null
  currency_symbol: string
  show_qr: boolean
  qr_url: string | null
  show_logo: boolean
  show_address: boolean
  show_phone: boolean
}

const DEFAULT_RS: ReceiptSettings = {
  shop_name: null, logo_url: null, phone: null, address: null,
  thank_you_msg: 'Thank you for your visit!',
  currency_symbol: '$', show_qr: true, qr_url: null,
  show_logo: true, show_address: true, show_phone: true,
}

export default function InvoiceModal({
  orderId, restaurantId, tableNum, guests, items,
  subtotal, discount, total, paymentMethod,
  amountPaid, changeAmount, cashier, onClose,
}: Props) {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const ranOnce = useRef(false)

  const [loading, setLoading]     = useState(true)
  const [rs, setRs]               = useState<ReceiptSettings>(DEFAULT_RS)
  const [restaurantName, setRestaurantName] = useState('')
  const [invoiceNum, setInvoiceNum] = useState('')
  const [orderNum, setOrderNum]     = useState('')

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

  useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true
    const load = async () => {
      const [{ data: rest }, { data: rsData }, { data: invData }, { data: orderRecord }] = await Promise.all([
        supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
        supabase.from('receipt_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
        supabase.from('invoice_number_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
        supabase.from('orders').select('order_num').eq('id', orderId).maybeSingle(),
      ])

      setRestaurantName(rest?.name ?? '')

      if (rsData) {
        setRs({
          shop_name:       rsData.shop_name       ?? null,
          logo_url:        rsData.logo_url        ?? null,
          phone:           rsData.phone           ?? null,
          address:         rsData.address         ?? null,
          thank_you_msg:   rsData.thank_you_msg   ?? 'Thank you for your visit!',
          currency_symbol: rsData.currency_symbol ?? '$',
          show_qr:         rsData.show_qr         ?? true,
          qr_url:          rsData.qr_url          ?? null,
          show_logo:       rsData.show_logo       ?? true,
          show_address:    rsData.show_address    ?? true,
          show_phone:      rsData.show_phone      ?? true,
        })
      }

      // Invoice number: read current, display, then increment
      let invNum = `INV-${orderId.slice(-5).toUpperCase()}`
      if (invData) {
        const num = invData.current_num ?? invData.start_num ?? 1001
        invNum = `${invData.prefix ?? 'INV-'}${num}`
        await supabase
          .from('invoice_number_settings')
          .update({ current_num: num + 1, updated_at: new Date().toISOString() })
          .eq('restaurant_id', restaurantId)
      }
      setInvoiceNum(invNum)

      // Order number: already assigned at order creation time — just read it
      const ordNum = orderRecord?.order_num ?? ''
      setOrderNum(ordNum)

      // Save invoice to database
      await supabase.from('invoices').insert({
        restaurant_id:  restaurantId,
        invoice_num:    invNum,
        order_num:      ordNum,
        table_num:      tableNum,
        guests,
        cashier,
        payment_method: paymentMethod,
        items,
        subtotal,
        discount,
        total,
        amount_paid:    amountPaid,
        change_amount:  changeAmount,
      })

      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cur  = rs.currency_symbol
  const name = rs.shop_name || restaurantName || 'Restaurant'

  const handlePrint = () => window.print()

  if (loading) return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-sm">

        {/* Action buttons above receipt */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white/70 text-sm font-medium hover:bg-white/15 active:scale-95 transition-all"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold active:scale-95 transition-all shadow-lg shadow-amber-500/30"
          >
            <X className="w-4 h-4" />
            Done
          </button>
        </div>

        {/* ── Receipt ── */}
        <div id="invoice-print" className="bg-white rounded-2xl shadow-2xl shadow-black/50 overflow-hidden text-[11px] font-sans">

          {/* Header */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between">

              {/* Left */}
              <div className="space-y-0.5 text-[10px]">
                <div className="font-extrabold text-black">{dateStr}</div>
                <div className="font-extrabold text-black">{timeStr}</div>
                <div className="font-bold text-black mt-2">Cashier</div>
                <div className="font-extrabold text-black">{cashier}</div>
              </div>

              {/* Center: logo + name */}
              <div className="flex flex-col items-center gap-1.5 px-2 flex-1">
                {rs.show_logo && rs.logo_url ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-200 shadow shrink-0">
                    <img src={rs.logo_url} alt="logo" className="w-full h-full object-cover" />
                  </div>
                ) : rs.show_logo ? (
                  <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-7 h-7 text-gray-300" />
                  </div>
                ) : null}
                <div className="text-center">
                  <p className="font-extrabold text-black text-[14px] leading-tight">{name}</p>
                  {rs.show_phone && rs.phone && (
                    <p className="font-bold text-black text-[10px] mt-0.5">{rs.phone}</p>
                  )}
                  {rs.show_address && rs.address && (
                    <p className="font-semibold text-black text-[10px]">{rs.address}</p>
                  )}
                </div>
              </div>

              {/* Right */}
              <div className="space-y-0.5 text-[10px] text-right">
                <div className="font-bold text-black">Invoice No.</div>
                <div className="font-extrabold text-black">{invoiceNum}</div>
                <div className="font-bold text-black mt-2">Employee</div>
                <div className="font-extrabold text-black">{cashier}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-300" />

          {/* Order info row */}
          <div className="px-5 py-2 flex items-center justify-between text-[10px]">
            <div>
              <span className="font-bold text-black">Table </span>
              <span className="font-extrabold text-black">{tableNum}</span>
              {guests > 0 && <span className="font-bold text-black"> · {guests} guests</span>}
            </div>
            <div className="font-bold text-black">{orderNum}</div>
          </div>

          <div className="border-t border-dashed border-gray-300" />

          {/* Payment method */}
          <div className="px-5 py-2 text-center">
            <p className="text-[10px] font-bold text-black">Payment Method</p>
            <p className="font-extrabold text-black text-[13px]">{paymentMethod}</p>
          </div>

          <div className="border-t border-dashed border-gray-300" />

          {/* Items */}
          <div className="px-5 py-3">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left pb-1.5 font-extrabold text-black">Item</th>
                  <th className="text-center pb-1.5 font-extrabold text-black w-8">Qty</th>
                  <th className="text-right pb-1.5 font-extrabold text-black">Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5 font-bold text-black">{item.name}</td>
                    <td className="py-1.5 text-center font-bold text-black">{item.qty}</td>
                    <td className="py-1.5 text-right font-bold text-black tabular-nums">
                      {formatPrice(item.price * item.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-dashed border-gray-300" />

          {/* Totals */}
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
            <div className="flex justify-between font-extrabold text-black text-[13px] pt-1 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(total)}</span>
            </div>
            {amountPaid > 0 && amountPaid > total && (
              <>
                <div className="flex justify-between font-bold text-black">
                  <span>Paid</span>
                  <span className="tabular-nums">{formatPrice(amountPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-black">
                  <span>Change</span>
                  <span className="tabular-nums">{formatPrice(changeAmount)}</span>
                </div>
              </>
            )}
          </div>

          {/* Big total box */}
          <div className="mx-5 mb-3 rounded-xl bg-gray-50 border border-gray-200 py-3 text-center">
            <p className="text-[10px] font-bold text-black mb-0.5">Total Amount</p>
            <p className="text-[18px] font-extrabold text-black tabular-nums">
              {formatPrice(total)}
            </p>
          </div>

          {/* QR */}
          {rs.show_qr && rs.qr_url && (
            <>
              <div className="border-t border-dashed border-gray-300" />
              <div className="flex justify-center py-4">
                <img src={rs.qr_url} alt="QR" className="w-20 h-20 object-contain" />
              </div>
            </>
          )}

          {/* Thank you + footer */}
          <div className="border-t border-dashed border-gray-300" />
          <div className="px-5 py-4 text-center space-y-1">
            {rs.thank_you_msg && (
              <p className="font-extrabold text-black text-[13px]">{rs.thank_you_msg}</p>
            )}
            <p className="text-[9px] font-bold text-black">Powered by ClickGroup · 07701466787</p>
          </div>

        </div>
      </div>
    </div>
  )
}
