'use client'
import { useEffect, useState } from 'react'
import { X, Printer, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { browserPrint } from '@/lib/webusb-print'
import { useInvoiceData } from './useInvoiceData'
import { InvoicePrintTemplate } from './InvoicePrintTemplate'
import type { InvoiceModalProps } from './types'

export default function InvoiceModal({
  mode, orderId, restaurantId,
  tableNum, guests, items,
  subtotal, discount, surcharge, total,
  paymentMethod, amountPaid, changeAmount,
  cashier, note,
  customerName, customerPhone,
  invoiceNum: invoiceNumProp,
  orderNum:   orderNumProp,
  autoPrint = false,
  onClose,
}: InvoiceModalProps) {
  const { formatPrice } = useDefaultCurrency()

  // ── Data ─────────────────────────────────────────────────────
  const { loading, rs, restaurantName, invoiceNum, orderNum, paperWidth } =
    useInvoiceData({ restaurantId, orderId, invoiceNumProp, orderNumProp })

  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

  const displayName = rs.shop_name || restaurantName || 'Restaurant'

  // ── Browser print (window.print) ─────────────────────────────
  // Injects the correct paper size as a temporary <style> tag so the
  // browser @page rule matches the physical thermal roll (58mm or 80mm).
  const handlePrint = () => {
    const style = document.createElement('style')
    style.id    = '__receipt_page_size__'
    style.textContent = `@page { size: ${paperWidth}mm auto; margin: 2mm; }`
    document.head.appendChild(style)
    window.print()
    setTimeout(() => document.getElementById('__receipt_page_size__')?.remove(), 500)
  }

  // Auto-print once data has loaded (caller sets autoPrint=true)
  useEffect(() => {
    if (!loading && autoPrint) handlePrint()
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── ESC/POS hardware print (WebUSB) ──────────────────────────
  const [printStatus, setPrintStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [printError,  setPrintError]  = useState('')

  const handleHardwarePrint = async () => {
    setPrintStatus('sending')
    setPrintError('')
    const ts = new Date()
    try {
      const res = await fetch('/api/print/receipt', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId, tableNum, guests,
          invoiceNum, orderNum, cashier,
          dateStr: ts.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          timeStr: ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          items, subtotal, discount, surcharge, total,
          paymentMethod, amountPaid, change: changeAmount,
          note: note ?? null, mode,
          qrUrl: rs.show_qr ? (rs.qr_url ?? null) : null,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Print failed')

      const bytes = Uint8Array.from(atob(json.bytes), c => c.charCodeAt(0))
      if (json.connectionType === 'usb') {
        await browserPrint(bytes)
      } else {
        throw new Error(
          'IP/Bluetooth printers require a direct network connection. ' +
          'Use "Browser Print" or switch to a USB printer.'
        )
      }
      setPrintStatus('ok')
      setTimeout(() => setPrintStatus('idle'), 3000)
    } catch (e: unknown) {
      setPrintError(e instanceof Error ? e.message : 'Print failed')
      setPrintStatus('error')
    }
  }

  // ── Loading screen ────────────────────────────────────────────
  if (loading) return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
    </div>
  )

  // ── Main render ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-sm">

        {/* Action bar */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold active:scale-95 transition-all shadow-lg shadow-amber-500/30"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleHardwarePrint}
              disabled={printStatus === 'sending'}
              title="ESC/POS direct print via WebUSB (Chrome/Edge)"
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 border disabled:opacity-50 ${
                printStatus === 'ok'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : printStatus === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  : 'bg-white/6 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60'
              }`}
            >
              {printStatus === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : printStatus === 'ok'    ? <CheckCircle2 className="w-3.5 h-3.5" />
                : printStatus === 'error' ? <AlertCircle className="w-3.5 h-3.5" />
                : <Printer className="w-3.5 h-3.5" />}
              {printStatus === 'sending' ? 'Sending…'
                : printStatus === 'ok'    ? 'Sent!'
                : printStatus === 'error' ? 'ESC/POS failed'
                : 'ESC/POS'}
            </button>

            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 border border-white/12 text-white/60 text-sm font-bold active:scale-95 transition-all hover:bg-white/12"
            >
              <X className="w-4 h-4" />
              Done
            </button>
          </div>
        </div>

        {/* ESC/POS error hint */}
        {printStatus === 'error' && printError && (
          <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs space-y-1">
            <p>{printError}</p>
            <p className="text-white/40">
              Use the{' '}
              <button onClick={handlePrint} className="underline text-amber-400 hover:text-amber-300">
                Print
              </button>{' '}
              button above — it sends through the normal Windows printer driver and works with any USB printer.
            </p>
          </div>
        )}

        {/* Receipt */}
        <InvoicePrintTemplate
          mode={mode}
          rs={rs}
          displayName={displayName}
          dateStr={dateStr}
          timeStr={timeStr}
          cashier={cashier}
          tableNum={tableNum}
          guests={guests}
          invoiceNum={invoiceNum}
          orderNum={orderNum}
          customerName={customerName}
          customerPhone={customerPhone}
          paymentMethod={paymentMethod}
          items={items}
          subtotal={subtotal}
          discount={discount}
          surcharge={surcharge}
          total={total}
          amountPaid={amountPaid}
          changeAmount={changeAmount}
          note={note}
          formatPrice={formatPrice}
        />
      </div>
    </div>
  )
}
