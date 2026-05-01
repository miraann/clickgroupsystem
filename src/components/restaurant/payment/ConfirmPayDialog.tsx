'use client'
import type { Item, DbDiscount, DbSurcharge, DbPayMethod } from './types'

interface Props {
  open:             boolean
  onCancel:         () => void
  onConfirm:        () => void
  tableNum:         string
  guests:           number
  items:            Item[]
  total:            number
  finalTotal:       number
  appliedDiscount:  DbDiscount  | null
  discountAmount:   number
  appliedSurcharge: DbSurcharge | null
  surchargeAmount:  number
  payMethods:       DbPayMethod[]
  method:           string
  enteredNum:       number
  change:           number
  selectedMember:   { name: string } | null
  selectedCustomer: { name: string } | null
  formatPrice:      (n: number) => string
}

export function ConfirmPayDialog({
  open, onCancel, onConfirm,
  tableNum, guests, items, total, finalTotal,
  appliedDiscount, discountAmount, appliedSurcharge, surchargeAmount,
  payMethods, method, enteredNum, change,
  selectedMember, selectedCustomer, formatPrice,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#0d1220] border border-white/15 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-0.5">Confirm Payment</p>
              <p className="text-base font-bold text-white">{isNaN(parseInt(tableNum)) ? tableNum : `Table ${tableNum}`}{guests > 0 ? ` · ${guests} guests` : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40 mb-0.5">Total</p>
              <p className="text-xl font-bold text-amber-400 tabular-nums">{formatPrice(finalTotal)}</p>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="px-5 py-3 border-b border-white/8 max-h-48 overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-bold flex items-center justify-center shrink-0">{item.qty}</span>
                <span className="text-sm text-white/80 truncate">{item.name}</span>
              </div>
              <span className="text-sm text-white/60 tabular-nums shrink-0">{formatPrice(item.price * item.qty)}</span>
            </div>
          ))}
        </div>

        {/* Totals breakdown */}
        <div className="px-5 py-3 border-b border-white/8 space-y-1.5">
          <div className="flex justify-between text-xs text-white/40">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatPrice(total)}</span>
          </div>
          {appliedDiscount && (
            <div className="flex justify-between text-xs text-emerald-400">
              <span>{appliedDiscount.name}</span>
              <span className="tabular-nums">−{formatPrice(discountAmount)}</span>
            </div>
          )}
          {appliedSurcharge && (
            <div className="flex justify-between text-xs text-lime-400">
              <span>{appliedSurcharge.name}</span>
              <span className="tabular-nums">+{formatPrice(surchargeAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-white/8">
            <span>Total</span>
            <span className="text-amber-400 tabular-nums">{formatPrice(finalTotal)}</span>
          </div>
          {enteredNum > 0 && (
            <div className="flex justify-between text-xs text-white/40">
              <span>Cash paid</span>
              <span className="tabular-nums">{formatPrice(enteredNum)}</span>
            </div>
          )}
          {change > 0 && (
            <div className="flex justify-between text-xs text-emerald-400">
              <span>Change</span>
              <span className="tabular-nums">{formatPrice(change)}</span>
            </div>
          )}
        </div>

        {/* Payment method + customer */}
        <div className="px-5 py-3 border-b border-white/8 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-white/35">Payment</span>
            <span className="text-white/70 font-medium">{payMethods.find(m => m.id === method)?.name ?? '—'}</span>
          </div>
          {(selectedMember || selectedCustomer) && (
            <div className="flex justify-between text-xs">
              <span className="text-white/35">{selectedMember ? 'Member' : 'Customer'}</span>
              <span className="text-white/70 font-medium">{selectedMember?.name ?? selectedCustomer?.name}</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 p-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-sm font-medium transition-all active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-[2] py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-all active:scale-95 shadow-lg shadow-amber-500/20"
          >
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )
}
