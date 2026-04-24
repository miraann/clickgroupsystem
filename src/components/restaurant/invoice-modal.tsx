'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Printer, Loader2, ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

interface Item { name: string; price: number; qty: number }

interface Props {
  mode: 'receipt' | 'payment'
  orderId: string
  restaurantId: string
  tableNum: string
  guests: number
  items: Item[]
  subtotal: number
  discount: number
  surcharge: number
  total: number
  paymentMethod: string
  amountPaid: number
  changeAmount: number
  cashier: string
  note?: string
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  invoiceNum?: string
  orderNum?: string
  autoPrint?: boolean
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
  mode, orderId, restaurantId, tableNum, guests, items,
  subtotal, discount, surcharge, total, paymentMethod,
  amountPaid, changeAmount, cashier, note,
  customerName, customerPhone,
  invoiceNum: invoiceNumProp, orderNum: orderNumProp,
  autoPrint = false,
  onClose,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [{ data: rest }, { data: rsData }, { data: orderRecord }] = await Promise.all([
        supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
        supabase.from('receipt_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
        supabase.from('orders').select('order_num').eq('id', orderId).maybeSingle(),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRestaurantName((rest as any)?.name ?? '')

      if (rsData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = rsData as any
        setRs({
          shop_name:       r.shop_name       ?? null,
          logo_url:        r.logo_url        ?? null,
          phone:           r.phone           ?? null,
          address:         r.address         ?? null,
          thank_you_msg:   r.thank_you_msg   ?? 'Thank you for your visit!',
          currency_symbol: r.currency_symbol ?? '$',
          show_qr:         r.show_qr         ?? true,
          qr_url:          r.qr_url          ?? null,
          show_logo:       r.show_logo       ?? true,
          show_address:    r.show_address    ?? true,
          show_phone:      r.show_phone      ?? true,
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchedOrderNum = (orderRecord as any)?.order_num ?? ''
      setOrderNum(orderNumProp || fetchedOrderNum)

      setInvoiceNum(invoiceNumProp || `INV-${orderId.slice(-5).toUpperCase()}`)

      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const name = rs.shop_name || restaurantName || 'Restaurant'

  const handlePrint = () => window.print()

  const [printStatus, setPrintStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [printError,  setPrintError]  = useState('')

  // Auto-print once data has loaded (when autoPrint prop is true)
  useEffect(() => {
    if (!loading && autoPrint) handleHardwarePrint()
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleHardwarePrint = async () => {
    setPrintStatus('sending')
    setPrintError('')
    const now = new Date()
    try {
      const res = await fetch('/api/print/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          tableNum,
          invoiceNum,
          orderNum,
          cashier,
          dateStr: now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          timeStr: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          items,
          subtotal,
          discount,
          surcharge,
          total,
          paymentMethod,
          amountPaid,
          change: changeAmount,
          note: note ?? null,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setPrintStatus('ok')
        setTimeout(() => setPrintStatus('idle'), 3000)
      } else {
        setPrintError(json.error ?? 'Print failed')
        setPrintStatus('error')
      }
    } catch {
      setPrintError('Could not reach print server')
      setPrintStatus('error')
    }
  }


  if (loading) return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-sm">

        {/* Action buttons above receipt */}
        <div className="flex items-center justify-between mb-3 gap-2">

          {/* Hardware print (ESC/POS) */}
          <button
            onClick={handleHardwarePrint}
            disabled={printStatus === 'sending'}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border ${
              printStatus === 'ok'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : printStatus === 'error'
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : 'bg-white/10 border-white/15 text-white/70 hover:bg-white/15'
            } disabled:opacity-50`}
          >
            {printStatus === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" />
              : printStatus === 'ok'   ? <CheckCircle2 className="w-4 h-4" />
              : printStatus === 'error' ? <AlertCircle className="w-4 h-4" />
              : <Printer className="w-4 h-4" />}
            {printStatus === 'sending' ? 'Sending…'
              : printStatus === 'ok'   ? 'Printed!'
              : printStatus === 'error' ? 'Failed'
              : 'Print'}
          </button>

          <div className="flex items-center gap-2">
            {/* Browser print fallback */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-white/40 text-xs font-medium hover:bg-white/10 hover:text-white/60 active:scale-95 transition-all"
              title="Print using browser"
            >
              Browser print
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold active:scale-95 transition-all shadow-lg shadow-amber-500/30"
            >
              <X className="w-4 h-4" />
              Done
            </button>
          </div>
        </div>

        {/* Print error message */}
        {printStatus === 'error' && printError && (
          <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs">
            {printError}
          </div>
        )}

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

          {/* Customer info */}
          {customerName && (
            <>
              <div className="border-t border-dashed border-gray-300" />
              <div className="px-5 py-2 flex items-center justify-between text-[10px]">
                <div>
                  <span className="font-bold text-black">Customer: </span>
                  <span className="font-extrabold text-black">{customerName}</span>
                </div>
                {customerPhone && <span className="font-bold text-black">{customerPhone}</span>}
              </div>
            </>
          )}

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
            {mode === 'payment' && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-[11px] font-bold text-emerald-600">✓ PAID</p>
                <p className="text-[10px] font-bold text-gray-500 mt-0.5">{dateStr} · {timeStr}</p>
              </div>
            )}
          </div>

          {/* Invoice note */}
          {note && note.trim() && (
            <>
              <div className="border-t border-dashed border-gray-300" />
              <div className="px-5 py-3">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Note</p>
                <p className="text-[11px] text-gray-700 italic">{note}</p>
              </div>
            </>
          )}

          {/* QR + branding — receipt mode only (for guest) */}
          {mode === 'receipt' && (
            <>
              {rs.show_qr && rs.qr_url && (
                <>
                  <div className="border-t border-dashed border-gray-300" />
                  <div className="flex justify-center py-4">
                    <img src={rs.qr_url} alt="QR" className="w-20 h-20 object-contain" />
                  </div>
                </>
              )}
              {/* Feedback section — printed write-in area */}
              <div className="border-t border-dashed border-gray-300" />
              <div className="px-5 py-4">
                <p className="text-[11px] font-extrabold text-black text-center mb-3 uppercase tracking-wide">Your Feedback</p>
                <div className="space-y-3">
                  {[
                    { label: 'Name' },
                    { label: 'Phone / Email' },
                  ].map(({ label }) => (
                    <div key={label}>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                      <div className="border-b border-gray-300 h-5" />
                    </div>
                  ))}
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Feedback</p>
                    <div className="border-b border-gray-300 h-5" />
                    <div className="border-b border-gray-300 h-5 mt-2" />
                    <div className="border-b border-gray-300 h-5 mt-2" />
                  </div>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-300" />
              <div className="px-5 py-4 text-center space-y-1">
                {rs.thank_you_msg && (
                  <p className="font-extrabold text-black text-[13px]">{rs.thank_you_msg}</p>
                )}
                <p className="text-[9px] font-bold text-black">Powered by ClickGroup · 07701466787</p>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
