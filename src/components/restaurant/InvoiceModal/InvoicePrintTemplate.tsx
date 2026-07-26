'use client'
import { ImageIcon } from 'lucide-react'
import { PaymentDetails } from './PaymentDetails'
import type { Item, ReceiptSettings } from './types'

const LABELS = {
  en: {
    invoiceNo:    'Invoice No.',
    employee:     'Employee',
    cashier:      'Cashier',
    table:        'Table',
    guests:       'guests',
    customer:     'Customer',
    item:         'Item',
    qty:          'Qty',
    price:        'Price',
    note:         'Note',
    yourFeedback: 'Your Feedback',
    name:         'Name',
    phoneEmail:   'Phone / Email',
    feedback:     'Feedback',
    poweredBy:    'Powered by ClickGroup · 07701466787',
  },
  ku: {
    invoiceNo:    'ژ.پسووڵە',
    employee:     'کارمەند',
    cashier:      'کاشیر',
    table:        'مێز',
    guests:       'کۆمەڵ',
    customer:     'کریار',
    item:         'کاڵا',
    qty:          'ژ.',
    price:        'نرخ',
    note:         'تێبینی',
    yourFeedback: 'ڕای تۆ',
    name:         'ناو',
    phoneEmail:   'تەلەفۆن / ئیمەیل',
    feedback:     'ڕای تۆ',
    poweredBy:    'Powered by ClickGroup · 07701466787',
  },
}

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
  const lang  = rs.language ?? 'ku'
  const isKu  = lang === 'ku'
  const L     = LABELS[lang]

  return (
    <div
      id="invoice-print"
      dir={isKu ? 'rtl' : 'ltr'}
      className="bg-white rounded-2xl shadow-2xl shadow-black/50 overflow-hidden text-[11px] font-sans"
      style={isKu ? { fontFamily: "'KurdishCustom', 'KurdishFont', sans-serif" } : undefined}
    >

      {/* ── Header: col-1/date | center/logo+name | col-3/invoice ── */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-1">

          {/* Column 1 — date/cashier (LTR: left; RTL: right) */}
          <div className="space-y-0.5 text-[10px] shrink-0 min-w-0 max-w-[30%]">
            <div className="font-extrabold text-black truncate" dir="ltr">{dateStr}</div>
            <div className="font-extrabold text-black" dir="ltr">{timeStr}</div>
            <div className="font-bold text-black mt-2">{L.cashier}</div>
            <div className="font-extrabold text-black truncate">{cashier}</div>
          </div>

          {/* Center: logo + restaurant name */}
          <div className="flex flex-col items-center gap-1.5 px-1 flex-1 min-w-0">
            {rs.show_logo && rs.logo_url ? (
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-gray-200 shadow shrink-0">
                <img src={rs.logo_url} alt="logo" className="w-full h-full object-cover" />
              </div>
            ) : rs.show_logo ? (
              <div className="w-14 h-14 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center shrink-0">
                <ImageIcon className="w-6 h-6 text-gray-300" />
              </div>
            ) : null}
            <div className="text-center min-w-0 w-full">
              <p className="font-extrabold text-black text-[13px] leading-tight break-words">{displayName}</p>
              {rs.show_phone && rs.phone && (
                <p className="font-bold text-black text-[10px] mt-0.5" dir="ltr">{rs.phone}</p>
              )}
              {rs.show_address && rs.address && (
                <p className="font-semibold text-black text-[10px] break-words">{rs.address}</p>
              )}
            </div>
          </div>

          {/* Column 3 — invoice/employee (LTR: right; RTL: left) */}
          <div className="space-y-0.5 text-[10px] text-end shrink-0 min-w-0 max-w-[30%]">
            <div className="font-bold text-black">{L.invoiceNo}</div>
            <div className="font-extrabold text-black truncate" dir="ltr">{invoiceNum}</div>
            <div className="font-bold text-black mt-2">{L.employee}</div>
            <div className="font-extrabold text-black truncate">{cashier}</div>
          </div>

        </div>
      </div>

      <div className="border-t border-dashed border-gray-300" />

      {/* ── Order info ── */}
      <div className="px-5 py-2 flex items-center justify-between text-[10px]">
        <div>
          <span className="font-bold text-black">{L.table} </span>
          <span className="font-extrabold text-black" dir="ltr">{tableNum}</span>
          {guests > 0 && (
            <span className="font-bold text-black"> · <span dir="ltr">{guests}</span> {L.guests}</span>
          )}
        </div>
        <div className="font-bold text-black" dir="ltr">{orderNum}</div>
      </div>

      {/* ── Customer (optional) ── */}
      {customerName && (
        <>
          <div className="border-t border-dashed border-gray-300" />
          <div className="px-5 py-2 flex items-center justify-between text-[10px]">
            <div>
              <span className="font-bold text-black">{L.customer}: </span>
              <span className="font-extrabold text-black">{customerName}</span>
            </div>
            {customerPhone && (
              <span className="font-bold text-black" dir="ltr">{customerPhone}</span>
            )}
          </div>
        </>
      )}

      {/* ── Items table ── */}
      <div className="border-t border-dashed border-gray-300" />
      <div className="px-5 py-3">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-start pb-1.5 font-extrabold text-black">{L.item}</th>
              <th className="text-center pb-1.5 font-extrabold text-black w-8">{L.qty}</th>
              <th className="text-end pb-1.5 font-extrabold text-black">{L.price}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1.5 font-bold text-black text-start">{item.name}</td>
                <td className="py-1.5 text-center font-bold text-black" dir="ltr">{item.qty}</td>
                <td className="py-1.5 text-end font-bold text-black tabular-nums" dir="ltr">
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
        language={lang}
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
            <p className="text-[11px] font-extrabold text-black uppercase tracking-wide mb-1">{L.note}</p>
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
              {L.yourFeedback}
            </p>
            <div className="space-y-3">
              {[L.name, L.phoneEmail].map(label => (
                <div key={label}>
                  <p className="text-[11px] font-extrabold text-black uppercase tracking-wide mb-1">{label}</p>
                  <div className="border-b border-gray-300 h-5" />
                </div>
              ))}
              <div>
                <p className="text-[11px] font-extrabold text-black uppercase tracking-wide mb-1">{L.feedback}</p>
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
            <p className="text-[9px] font-bold text-black">{L.poweredBy}</p>
          </div>
        </>
      )}

    </div>
  )
}
