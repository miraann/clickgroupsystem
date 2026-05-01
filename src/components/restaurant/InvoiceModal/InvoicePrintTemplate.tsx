'use client'
import { ImageIcon } from 'lucide-react'
import { PaymentDetails } from './PaymentDetails'
import type { Item, ReceiptSettings } from './types'

interface Props {
  mode:           'receipt' | 'payment'
  rs:             ReceiptSettings
  displayName:    string
  dateStr:        string
  timeStr:        string
  cashier:        string
  tableNum:       string
  guests:         number
  invoiceNum:     string
  orderNum:       string
  customerName?:  string | null
  customerPhone?: string | null
  paymentMethod:  string
  items:          Item[]
  subtotal:       number
  discount:       number
  surcharge:      number
  total:          number
  amountPaid:     number
  changeAmount:   number
  note?:          string
  formatPrice:    (n: number) => string
}

export function InvoicePrintTemplate({
  mode, rs, displayName,
  dateStr, timeStr, cashier,
  tableNum, guests, invoiceNum, orderNum,
  customerName, customerPhone,
  paymentMethod,
  items, subtotal, discount, surcharge, total,
  amountPaid, changeAmount,
  note, formatPrice,
}: Props) {
  return (
    <div id="invoice-print" className="bg-white rounded-2xl shadow-2xl shadow-black/50 overflow-hidden text-[11px] font-sans">

      {/* ── Header: date/cashier | logo+name | invoice/employee ── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between">

          {/* Left column */}
          <div className="space-y-0.5 text-[10px]">
            <div className="font-extrabold text-black">{dateStr}</div>
            <div className="font-extrabold text-black">{timeStr}</div>
            <div className="font-bold text-black mt-2">Cashier</div>
            <div className="font-extrabold text-black">{cashier}</div>
          </div>

          {/* Center: logo + restaurant name */}
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
              <p className="font-extrabold text-black text-[14px] leading-tight">{displayName}</p>
              {rs.show_phone && rs.phone && (
                <p className="font-bold text-black text-[10px] mt-0.5">{rs.phone}</p>
              )}
              {rs.show_address && rs.address && (
                <p className="font-semibold text-black text-[10px]">{rs.address}</p>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-0.5 text-[10px] text-right">
            <div className="font-bold text-black">Invoice No.</div>
            <div className="font-extrabold text-black">{invoiceNum}</div>
            <div className="font-bold text-black mt-2">Employee</div>
            <div className="font-extrabold text-black">{cashier}</div>
          </div>
        </div>
      </div>

      <div className="border-t border-dashed border-gray-300" />

      {/* ── Order info ── */}
      <div className="px-5 py-2 flex items-center justify-between text-[10px]">
        <div>
          <span className="font-bold text-black">Table </span>
          <span className="font-extrabold text-black">{tableNum}</span>
          {guests > 0 && <span className="font-bold text-black"> · {guests} guests</span>}
        </div>
        <div className="font-bold text-black">{orderNum}</div>
      </div>

      {/* ── Customer (optional) ── */}
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

      {/* ── Items table ── */}
      <div className="border-t border-dashed border-gray-300" />
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

      {/* ── Payment method, totals, big total box ── */}
      <PaymentDetails
        mode={mode}
        paymentMethod={paymentMethod}
        subtotal={subtotal}
        discount={discount}
        surcharge={surcharge}
        total={total}
        amountPaid={amountPaid}
        changeAmount={changeAmount}
        dateStr={dateStr}
        timeStr={timeStr}
        formatPrice={formatPrice}
      />

      {/* ── Invoice note (optional) ── */}
      {note?.trim() && (
        <>
          <div className="border-t border-dashed border-gray-300" />
          <div className="px-5 py-3">
            <p className="text-[11px] font-extrabold text-black uppercase tracking-wide mb-1">Note</p>
            <p className="text-[11px] font-bold text-black italic">{note}</p>
          </div>
        </>
      )}

      {/* ── Receipt-mode footer: QR + feedback + thank-you ── */}
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

          <div className="border-t border-dashed border-gray-300" />
          <div className="px-5 py-4">
            <p className="text-[11px] font-extrabold text-black text-center mb-3 uppercase tracking-wide">
              Your Feedback
            </p>
            <div className="space-y-3">
              {['Name', 'Phone / Email'].map(label => (
                <div key={label}>
                  <p className="text-[11px] font-extrabold text-black uppercase tracking-wide mb-1">{label}</p>
                  <div className="border-b border-gray-300 h-5" />
                </div>
              ))}
              <div>
                <p className="text-[11px] font-extrabold text-black uppercase tracking-wide mb-1">Feedback</p>
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
  )
}
