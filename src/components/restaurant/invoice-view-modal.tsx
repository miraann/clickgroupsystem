'use client'
import { useState, useEffect } from 'react'
import { X, Printer, Loader2, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

interface StoredInvoice {
  id: string
  invoice_num: string
  order_num: string | null
  table_num: string | null
  guests: number
  cashier: string | null
  payment_method: string | null
  items: Array<{ name: string; price: number; qty: number }> | null
  subtotal: number
  discount: number
  total: number
  amount_paid: number
  change_amount: number
  created_at: string
  customer_name?: string | null
  customer_phone?: string | null
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

interface Props {
  invoice: StoredInvoice
  restaurantId: string
  onClose: () => void
}

export default function InvoiceViewModal({ invoice, restaurantId, onClose }: Props) {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const [loading, setLoading] = useState(true)
  const [paperWidth, setPaperWidth] = useState(80)
  const [rs, setRs] = useState<ReceiptSettings>({
    shop_name: null, logo_url: null, phone: null, address: null,
    thank_you_msg: 'Thank you for your visit!',
    currency_symbol: '$', show_qr: true, qr_url: null,
    show_logo: true, show_address: true, show_phone: true,
  })
  const [restaurantName, setRestaurantName] = useState('')

  useEffect(() => {
    const load = async () => {
      const [{ data: rest }, { data: rsData }, { data: printer }] = await Promise.all([
        supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
        supabase.from('receipt_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
        supabase.from('printers').select('paper_width').eq('restaurant_id', restaurantId).eq('purpose', 'receipt').eq('active', true).limit(1).maybeSingle(),
      ])
      if (printer?.paper_width) setPaperWidth(printer.paper_width)
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
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrint = () => {
    const marginMm  = 2
    const wMm       = paperWidth - marginMm * 2
    // Font sizes scale with paper width (58mm→8pt, 80mm→10pt, 104mm→12pt)
    const basePt    = Math.max(7, Math.round(paperWidth * 0.105))
    const smPt      = Math.max(6, basePt - 1)
    const lgPt      = Math.round(basePt * 1.35)
    const xlPt      = Math.round(basePt * 1.8)
    const logoSizeMm = Math.round(paperWidth * 0.22)
    const qrSizeMm   = Math.round(paperWidth * 0.3)

    const tableLabel = invoice.table_num === 'Takeout' || invoice.table_num === 'Delivery'
      ? invoice.table_num
      : invoice.table_num ? `Table ${invoice.table_num}` : ''
    const guestsStr = invoice.guests > 0 ? ` · ${invoice.guests} guests` : ''

    const logoHtml = rs.show_logo && rs.logo_url
      ? `<img src="${rs.logo_url}" style="width:${logoSizeMm}mm;height:${logoSizeMm}mm;border-radius:50%;object-fit:cover;display:block;margin:0 auto 1mm;" />`
      : ''

    const qrHtml = rs.show_qr && rs.qr_url
      ? `<hr class="d"/><div style="text-align:center;padding:2mm 0;"><img src="${rs.qr_url}" style="width:${qrSizeMm}mm;height:${qrSizeMm}mm;object-fit:contain;" /></div>`
      : ''

    const customerHtml = (invoice.customer_name || invoice.customer_phone) ? `
      <hr class="d"/>
      <div style="padding:1.5mm 0;">
        ${invoice.customer_name ? `<div class="row"><span class="b">Customer</span><span class="xb">${invoice.customer_name}</span></div>` : ''}
        ${invoice.customer_phone ? `<div class="row" style="margin-top:.5mm;"><span class="b">Phone</span><span class="xb">${invoice.customer_phone}</span></div>` : ''}
      </div>` : ''

    const itemRows = (invoice.items ?? []).map(item => `
      <tr>
        <td style="padding:1mm 0;font-weight:700;">${item.name}</td>
        <td style="padding:1mm 0;text-align:center;font-weight:700;">${item.qty}</td>
        <td style="padding:1mm 0;text-align:right;font-weight:700;">${formatPrice(item.price * item.qty)}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @page { size: ${paperWidth}mm auto; margin: ${marginMm}mm; }
  *  { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Courier New',Courier,monospace; font-size:${basePt}pt; width:${wMm}mm; color:#000; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .d  { border:none; border-top:1px dashed #888; margin:0; }
  .row{ display:flex; justify-content:space-between; align-items:baseline; }
  .b  { font-weight:700; }
  .xb { font-weight:800; }
  .c  { text-align:center; }
  .r  { text-align:right; }
  .sm { font-size:${smPt}pt; }
  .lg { font-size:${lgPt}pt; }
  .xl { font-size:${xlPt}pt; }
  .sec{ padding:1.5mm 0; }
  table { width:100%; border-collapse:collapse; }
  thead th { font-weight:800; border-bottom:1px solid #ccc; padding-bottom:1mm; }
  thead th:first-child{ text-align:left; }
  thead th:nth-child(2){ text-align:center; width:8mm; }
  thead th:last-child  { text-align:right; }
</style></head><body>

<!-- HEADER -->
<div class="sec">
  <div class="row sm">
    <div>
      <div class="xb">${dateStr}</div>
      <div class="xb">${timeStr}</div>
      <div class="b" style="margin-top:1mm;">Cashier</div>
      <div class="xb">${invoice.cashier || '—'}</div>
    </div>
    <div class="c" style="flex:1;padding:0 1mm;">
      ${logoHtml}
      <div class="xb lg">${name}</div>
      ${rs.show_phone && rs.phone ? `<div class="b">${rs.phone}</div>` : ''}
      ${rs.show_address && rs.address ? `<div class="b">${rs.address}</div>` : ''}
    </div>
    <div class="r sm">
      <div class="b">Invoice No.</div>
      <div class="xb">${invoice.invoice_num}</div>
      <div class="b" style="margin-top:1mm;">Employee</div>
      <div class="xb">${invoice.cashier || '—'}</div>
    </div>
  </div>
</div>

<hr class="d"/>

<!-- ORDER INFO -->
<div class="sec sm">
  <div class="row">
    <span class="xb">${tableLabel}${guestsStr}</span>
    ${invoice.order_num ? `<span class="b">${invoice.order_num}</span>` : ''}
  </div>
</div>

${customerHtml}

<hr class="d"/>

<!-- PAYMENT METHOD -->
<div class="sec c">
  <div class="sm b">Payment Method</div>
  <div class="xb lg">${invoice.payment_method || '—'}</div>
</div>

<hr class="d"/>

<!-- ITEMS -->
<div class="sec">
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th style="text-align:right;">Price</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
</div>

<hr class="d"/>

<!-- TOTALS -->
<div class="sec">
  <div class="row b" style="margin-bottom:.5mm;"><span>Subtotal</span><span>${formatPrice(Number(invoice.subtotal))}</span></div>
  ${Number(invoice.discount) > 0 ? `<div class="row b" style="color:#dc2626;margin-bottom:.5mm;"><span>Discount</span><span>-${formatPrice(Number(invoice.discount))}</span></div>` : ''}
  <div class="row xb lg" style="border-top:1px solid #999;padding-top:1mm;"><span>Total</span><span>${formatPrice(Number(invoice.total))}</span></div>
  ${Number(invoice.amount_paid) > 0 && Number(invoice.amount_paid) > Number(invoice.total) ? `
    <div class="row b" style="margin-top:.5mm;"><span>Paid</span><span>${formatPrice(Number(invoice.amount_paid))}</span></div>
    <div class="row b"><span>Change</span><span>${formatPrice(Number(invoice.change_amount))}</span></div>` : ''}
</div>

<!-- BIG TOTAL BOX -->
<div style="border:1px solid #ddd;border-radius:2mm;padding:2mm;text-align:center;margin-bottom:2mm;">
  <div class="sm b">Total Amount</div>
  <div class="xb xl">${formatPrice(Number(invoice.total))}</div>
</div>

${qrHtml}

<!-- FOOTER -->
<hr class="d"/>
<div class="sec c">
  ${rs.thank_you_msg ? `<div class="xb lg">${rs.thank_you_msg}</div>` : ''}
  <div class="sm" style="margin-top:1mm;color:#666;">Powered by ClickGroup · 07701466787</div>
</div>

<script>
  window.addEventListener('load', function() {
    window.focus();
    window.print();
    setTimeout(function() { window.close(); }, 800);
  });
</script>
</body></html>`

    const pw = window.open('', '_blank', 'width=500,height=700')
    if (!pw) { alert('Allow pop-ups to print'); return }
    pw.document.write(html)
    pw.document.close()
  }

  const cur  = rs.currency_symbol
  const name = rs.shop_name || restaurantName || 'Restaurant'
  const date = new Date(invoice.created_at)
  const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

  if (loading) return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div id="invoice-print-root" className="relative w-full max-w-sm">

        {/* Action buttons */}
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
            Close
          </button>
        </div>

        {/* Receipt */}
        <div id="invoice-print" className="bg-white rounded-2xl shadow-2xl shadow-black/50 overflow-hidden text-[11px] font-sans">

          {/* Header */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between">

              {/* Left */}
              <div className="space-y-0.5 text-[10px]">
                <div className="font-extrabold text-black">{dateStr}</div>
                <div className="font-extrabold text-black">{timeStr}</div>
                <div className="font-bold text-black mt-2">Cashier</div>
                <div className="font-extrabold text-black">{invoice.cashier || '—'}</div>
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
                <div className="font-extrabold text-black">{invoice.invoice_num}</div>
                <div className="font-bold text-black mt-2">Employee</div>
                <div className="font-extrabold text-black">{invoice.cashier || '—'}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-300" />

          {/* Order info row */}
          <div className="px-5 py-2 flex items-center justify-between text-[10px]">
            <div>
              {invoice.table_num === 'Takeout' || invoice.table_num === 'Delivery' ? (
                <span className="font-extrabold text-black">{invoice.table_num}</span>
              ) : (
                <>
                  <span className="font-bold text-black">Table </span>
                  <span className="font-extrabold text-black">{invoice.table_num || '—'}</span>
                </>
              )}
              {invoice.guests > 0 && (
                <span className="font-bold text-black"> · {invoice.guests} guests</span>
              )}
            </div>
            {invoice.order_num && (
              <div className="font-bold text-black">{invoice.order_num}</div>
            )}
          </div>

          {/* Customer info row (delivery / takeout) */}
          {(invoice.customer_name || invoice.customer_phone) && (
            <>
              <div className="border-t border-dashed border-gray-300" />
              <div className="px-5 py-2 text-[10px] space-y-0.5">
                {invoice.customer_name && (
                  <div className="flex justify-between">
                    <span className="font-bold text-black">Customer</span>
                    <span className="font-extrabold text-black">{invoice.customer_name}</span>
                  </div>
                )}
                {invoice.customer_phone && (
                  <div className="flex justify-between">
                    <span className="font-bold text-black">Phone</span>
                    <span className="font-extrabold text-black">{invoice.customer_phone}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="border-t border-dashed border-gray-300" />

          {/* Payment method */}
          <div className="px-5 py-2 text-center">
            <p className="text-[10px] font-bold text-black">Payment Method</p>
            <p className="font-extrabold text-black text-[13px]">{invoice.payment_method || '—'}</p>
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
                {(invoice.items ?? []).map((item, i) => (
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
              <span className="tabular-nums">{formatPrice(Number(invoice.subtotal))}</span>
            </div>
            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between font-bold text-red-600">
                <span>Discount</span>
                <span className="tabular-nums">-{formatPrice(Number(invoice.discount))}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-black text-[13px] pt-1 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(Number(invoice.total))}</span>
            </div>
            {Number(invoice.amount_paid) > 0 && Number(invoice.amount_paid) > Number(invoice.total) && (
              <>
                <div className="flex justify-between font-bold text-black">
                  <span>Paid</span>
                  <span className="tabular-nums">{formatPrice(Number(invoice.amount_paid))}</span>
                </div>
                <div className="flex justify-between font-bold text-black">
                  <span>Change</span>
                  <span className="tabular-nums">{formatPrice(Number(invoice.change_amount))}</span>
                </div>
              </>
            )}
          </div>

          {/* Big total box */}
          <div className="mx-5 mb-3 rounded-xl bg-gray-50 border border-gray-200 py-3 text-center">
            <p className="text-[10px] font-bold text-black mb-0.5">Total Amount</p>
            <p className="text-[18px] font-extrabold text-black tabular-nums">
              {formatPrice(Number(invoice.total))}
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
