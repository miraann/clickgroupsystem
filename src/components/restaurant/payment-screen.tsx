'use client'
import { useState, useEffect } from 'react'
import { ArrowLeft, Users, Printer, Loader2, Check, Delete } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import InvoiceModal from './invoice-modal'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

// ── Types ─────────────────────────────────────────────────────
interface Item { name: string; price: number; qty: number }

interface DbDiscount  { id: string; name: string; type: 'percentage' | 'fixed'; value: number; min_order: number; active: boolean }
interface DbSurcharge { id: string; name: string; type: 'percentage' | 'fixed'; value: number; applied_to: string; active: boolean }

interface Props {
  orderId: string
  restaurantId: string
  tableNum: string
  guests: number
  items: Item[]
  total: number
  onClose: () => void
  onPaid: () => void
}

interface DbPayMethod { id: string; name: string; icon_type: string; is_default: boolean }

type ActionTab = 'surcharge' | 'gratuity' | 'discount' | 'note' | 'split' | 'paylater'

const ICON_COLORS: Record<string, { inactive: string; active: string }> = {
  cash:   { inactive: 'text-emerald-400', active: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' },
  card:   { inactive: 'text-orange-400',  active: 'bg-orange-500/20 border-orange-500/40 text-orange-300'   },
  online: { inactive: 'text-violet-400',  active: 'bg-violet-500/20 border-violet-500/40 text-violet-300'   },
  wallet: { inactive: 'text-blue-400',    active: 'bg-blue-500/20 border-blue-500/40 text-blue-300'         },
  other:  { inactive: 'text-pink-400',    active: 'bg-pink-500/20 border-pink-500/40 text-pink-300'         },
}

const ACTION_TABS: { id: ActionTab; label: string; color: string }[] = [
  { id: 'surcharge', label: 'Surcharge', color: 'text-lime-400    border-lime-500/30    bg-lime-500/10'    },
  { id: 'gratuity',  label: 'Gratuity',  color: 'text-green-400   border-green-500/30   bg-green-500/10'  },
  { id: 'discount',  label: 'Discount',  color: 'text-yellow-400  border-yellow-500/30  bg-yellow-500/10' },
  { id: 'note',      label: 'Note',      color: 'text-cyan-400    border-cyan-500/30    bg-cyan-500/10'   },
  { id: 'split',     label: 'Split Bill',color: 'text-teal-400    border-teal-500/30    bg-teal-500/10'   },
  { id: 'paylater',  label: 'Pay Later', color: 'text-rose-400    border-rose-500/30    bg-rose-500/10'   },
]

// ── Numpad key layout ─────────────────────────────────────────
const NUMPAD = ['7','8','9','4','5','6','1','2','3','0','00','.']

// ── Component ─────────────────────────────────────────────────
export default function PaymentScreen({ orderId, restaurantId, tableNum, guests, items, total, onClose, onPaid }: Props) {
  const [payMethods, setPayMethods]       = useState<DbPayMethod[]>([])
  const [method, setMethod]               = useState<string>('')
  const [entered, setEntered]             = useState('')
  const [paying, setPaying]               = useState(false)
  const [paid, setPaid]                   = useState(false)
  const [activeTab, setActiveTab]         = useState<ActionTab | null>(null)
  const [showInvoice, setShowInvoice]     = useState(false)
  const [cashier, setCashier]             = useState('Staff')
  const [paidAmount, setPaidAmount]       = useState(0)
  const [changeAmt, setChangeAmt]         = useState(0)
  const [discounts, setDiscounts]         = useState<DbDiscount[]>([])
  const [appliedDiscount, setApplied]     = useState<DbDiscount | null>(null)
  const [surcharges, setSurcharges]       = useState<DbSurcharge[]>([])
  const [appliedSurcharge, setAppliedSur] = useState<DbSurcharge | null>(null)
  const [invoiceNote, setInvoiceNote]     = useState('')

  const supabase = createClient()
  const { symbol: cur, decimalPlaces, formatPrice } = useDefaultCurrency()

  // Load payment methods + cashier name
  useEffect(() => {
    supabase
      .from('payment_methods')
      .select('id, name, icon_type, is_default')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => {
        const methods = (data ?? []) as DbPayMethod[]
        setPayMethods(methods)
        const def = methods.find(m => m.is_default) ?? methods[0]
        if (def) setMethod(def.id)
      })
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCashier(user?.user_metadata?.full_name ?? user?.email ?? 'Staff')
    })
    supabase
      .from('discounts')
      .select('id,name,type,value,min_order,active')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setDiscounts((data ?? []) as DbDiscount[]))
    supabase
      .from('surcharges')
      .select('id,name,type,value,applied_to,active')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setSurcharges((data ?? []) as DbSurcharge[]))
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const discountAmount  = appliedDiscount
    ? appliedDiscount.type === 'percentage'
      ? Math.round(total * appliedDiscount.value) / 100
      : Math.min(appliedDiscount.value, total)
    : 0
  const surchargeAmount = appliedSurcharge
    ? appliedSurcharge.type === 'percentage'
      ? Math.round(total * appliedSurcharge.value) / 100
      : appliedSurcharge.value
    : 0
  const finalTotal  = Math.max(0, total - discountAmount + surchargeAmount)

  const enteredNum  = parseFloat(entered || '0') || 0
  const payAmount   = enteredNum > 0 ? enteredNum : finalTotal
  const change      = Math.max(0, enteredNum - finalTotal)
  const shortfall   = Math.max(0, finalTotal - enteredNum)
  const isExact     = enteredNum === finalTotal
  const isReady     = enteredNum >= finalTotal || entered === ''

  const press = (key: string) => {
    if (key === '⌫') { setEntered(v => v.slice(0, -1)); return }
    if (key === 'C')  { setEntered(''); return }
    if (key === 'Exact') { setEntered(finalTotal.toFixed(decimalPlaces)); return }
    // Prevent multiple dots
    if (key === '.' && entered.includes('.')) return
    // Max 2 decimal places
    const dotIdx = entered.indexOf('.')
    if (dotIdx !== -1 && entered.length - dotIdx > 2) return
    setEntered(v => v + key)
  }

  const [payError, setPayError] = useState<string | null>(null)

  const handlePay = async () => {
    if (paying || paid) return
    setPaying(true)
    setPayError(null)

    const amountPaid   = enteredNum > 0 ? enteredNum : finalTotal
    const changeAmount = Math.max(0, amountPaid - finalTotal)
    const now          = new Date().toISOString()

    // Single query: close ALL active orders for this table
    const { error } = await supabase
      .from('orders')
      .update({
        status:        'paid',
        total:         finalTotal,
        updated_at:    now,
      })
      .eq('table_number', parseInt(tableNum))
      .eq('status', 'active')
      .select('id')

    if (error) {
      setPayError(`DB error: ${error.message}`)
      setPaying(false)
      return
    }

    // Save payment details on the specific order
    const methodName = payMethods.find(m => m.id === method)?.name ?? method
    await supabase
      .from('orders')
      .update({ payment_method: methodName, amount_paid: amountPaid, change_amount: changeAmount, note: invoiceNote || null })
      .eq('id', orderId)

    setPaidAmount(amountPaid)
    setChangeAmt(changeAmount)
    setPaid(true)
    setPaying(false)
    // Show invoice modal instead of immediately closing
    setTimeout(() => setShowInvoice(true), 400)
  }

  const now = new Date()
  const timeStr = now.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const invoiceNum = orderId.slice(-5).toUpperCase()

  return (
    <>
    <div className="fixed inset-0 z-50 bg-[#060810] flex flex-col overflow-hidden">

      {/* ── Top action bar ── */}
      <div className="shrink-0 flex items-center border-b border-white/8 bg-[#080b14]">
        <button
          onClick={onClose}
          className="w-14 h-12 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-all active:scale-95 touch-manipulation border-r border-white/8 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {ACTION_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(activeTab === tab.id ? null : tab.id)}
              className={cn(
                'shrink-0 flex-1 min-w-[100px] h-12 text-sm font-semibold border-r border-white/8 transition-all active:scale-95 touch-manipulation',
                activeTab === tab.id ? tab.color : 'text-white/40 hover:text-white/60 hover:bg-white/4'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Receipt ── */}
        <div className="w-80 xl:w-96 shrink-0 flex flex-col border-r border-white/8">

          {/* Order meta */}
          <div className="shrink-0 p-5 border-b border-white/8 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Table {tableNum}{guests > 0 ? ` · ${guests} Guests` : ''}</p>
                <p className="text-xs text-white/30">Dine In</p>
              </div>
            </div>
            <div className="space-y-1 pt-1">
              {[
                ['Invoice', `#${invoiceNum}`],
                ['Order',   `#${invoiceNum}`],
                ['Time',    timeStr],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-xs text-white/30">{k}</span>
                  <span className="text-xs text-white/60 tabular-nums font-mono">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-400/70 tabular-nums w-4 shrink-0">{item.qty}</span>
                      <p className="text-sm text-white/80 truncate">{item.name}</p>
                    </div>
                    <p className="text-xs text-white/25 ml-6">×{formatPrice(item.price)}</p>
                  </div>
                  <span className="text-sm font-semibold text-white/70 tabular-nums shrink-0">
                    {formatPrice(item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="shrink-0 border-t border-white/8 p-4 space-y-2">
            {invoiceNote && (
              <div className="px-3 py-2 rounded-xl bg-cyan-500/8 border border-cyan-500/20 text-xs text-cyan-300/70 italic">
                {invoiceNote}
              </div>
            )}
            <div className="flex justify-between text-sm text-white/40">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatPrice(total)}</span>
            </div>
            {appliedDiscount && (
              <div className="flex justify-between text-sm text-emerald-400">
                <span>{appliedDiscount.name}</span>
                <span className="tabular-nums">−{formatPrice(discountAmount)}</span>
              </div>
            )}
            {appliedSurcharge && (
              <div className="flex justify-between text-sm text-lime-400">
                <span>{appliedSurcharge.name}</span>
                <span className="tabular-nums">+{formatPrice(surchargeAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-white/8">
              <span>Total</span>
              <span className="text-amber-400 tabular-nums">{formatPrice(finalTotal)}</span>
            </div>
          </div>
        </div>

        {/* ── Right: Payment ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Summary row */}
          <div className="shrink-0 grid grid-cols-4 divide-x divide-white/8 border-b border-white/8">
            {[
              { label: 'Total',  value: formatPrice(finalTotal),                                                                  color: 'text-white' },
              { label: 'Pay',    value: formatPrice(payAmount),                                                                   color: 'text-amber-400' },
              { label: 'Paid',   value: enteredNum > 0 ? formatPrice(enteredNum) : formatPrice(0),                               color: enteredNum > 0 ? 'text-white/70' : 'text-white/25' },
              { label: 'Change', value: formatPrice(change),                                                                      color: change > 0 ? 'text-emerald-400' : 'text-white/25' },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center justify-center py-4 gap-1">
                <span className="text-xs text-white/30 uppercase tracking-wider">{s.label}</span>
                <span className={cn('text-lg font-bold tabular-nums', s.color)}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Payment methods */}
          <div className="shrink-0 flex gap-2 px-4 py-3 border-b border-white/8 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {payMethods.length === 0 ? (
              <p className="text-xs text-white/25 italic self-center">No payment methods — add in Settings → Menu → Payment Method</p>
            ) : payMethods.map(m => {
              const colors = ICON_COLORS[m.icon_type] ?? ICON_COLORS.other
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    'shrink-0 flex-1 min-w-[80px] py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95 touch-manipulation',
                    method === m.id
                      ? colors.active
                      : `bg-white/4 border-white/10 ${colors.inactive} opacity-50 hover:opacity-80`
                  )}
                >
                  {m.name}
                </button>
              )
            })}
          </div>

          {/* Surcharge panel */}
          {activeTab === 'surcharge' && (
            <div className="shrink-0 border-b border-white/8 bg-[#080b14] p-4">
              {surcharges.length === 0 ? (
                <p className="text-xs text-white/25 italic text-center py-2">No surcharges — add in Settings → Menu → Surcharge</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {surcharges.map(s => {
                    const selected = appliedSurcharge?.id === s.id
                    return (
                      <button
                        key={s.id}
                        onClick={() => setAppliedSur(selected ? null : s)}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                          selected
                            ? 'bg-lime-500/20 border-lime-500/40 text-lime-300'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-lime-500/10 hover:border-lime-500/20 hover:text-lime-300'
                        )}
                      >
                        <span className="text-xs font-bold">
                          {s.type === 'percentage' ? `${s.value}%` : formatPrice(s.value)}
                        </span>
                        <span>{s.name}</span>
                        {s.applied_to !== 'All' && (
                          <span className="text-[10px] text-white/30">{s.applied_to}</span>
                        )}
                        {selected && <span className="text-xs">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Discount panel */}
          {activeTab === 'discount' && (
            <div className="shrink-0 border-b border-white/8 bg-[#080b14] p-4">
              {discounts.length === 0 ? (
                <p className="text-xs text-white/25 italic text-center py-2">No discounts — add in Settings → Menu → Discount</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {discounts.map(d => {
                    const eligible = total >= d.min_order
                    const selected = appliedDiscount?.id === d.id
                    return (
                      <button
                        key={d.id}
                        disabled={!eligible}
                        onClick={() => setApplied(selected ? null : d)}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                          !eligible
                            ? 'bg-white/3 border-white/5 text-white/20 cursor-not-allowed'
                            : selected
                              ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-yellow-500/10 hover:border-yellow-500/20 hover:text-yellow-300'
                        )}
                      >
                        <span className="text-xs font-bold">
                          {d.type === 'percentage' ? `${d.value}%` : formatPrice(d.value)}
                        </span>
                        <span>{d.name}</span>
                        {!eligible && d.min_order > 0 && (
                          <span className="text-[10px] text-white/25">min {formatPrice(d.min_order)}</span>
                        )}
                        {selected && <span className="text-xs">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Note panel */}
          {activeTab === 'note' && (
            <div className="shrink-0 border-b border-white/8 bg-[#080b14] p-4 space-y-2">
              <p className="text-xs text-white/30 font-medium">Invoice note (printed on receipt)</p>
              <textarea
                value={invoiceNote}
                onChange={e => setInvoiceNote(e.target.value)}
                placeholder="e.g. Thank you for your visit! Special instructions..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/40 resize-none transition-colors"
              />
              {invoiceNote && (
                <button
                  onClick={() => setInvoiceNote('')}
                  className="text-xs text-white/25 hover:text-rose-400 transition-colors"
                >
                  Clear note
                </button>
              )}
            </div>
          )}

          {/* Amount display */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/8">
            <div>
              {entered ? (
                <p className="text-3xl font-bold text-white tabular-nums">{cur}{entered}</p>
              ) : (
                <p className="text-3xl font-bold text-white/20 tabular-nums">{formatPrice(finalTotal)}</p>
              )}
              {entered && shortfall > 0 && (
                <p className="text-xs text-rose-400/70 mt-1">Short by {formatPrice(shortfall)}</p>
              )}
              {entered && change > 0 && (
                <p className="text-xs text-emerald-400/70 mt-1">Change: {formatPrice(change)}</p>
              )}
              {payError && (
                <p className="text-xs text-rose-400 mt-1 font-mono">{payError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => press('Exact')}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/40 hover:bg-white/10 hover:text-white/60 transition-all active:scale-95 touch-manipulation"
              >
                Exact
              </button>
              <button
                onClick={() => press('C')}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-rose-400/50 hover:bg-rose-500/10 hover:text-rose-400 transition-all active:scale-95 touch-manipulation"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Numpad + Pay */}
          <div className="flex-1 grid grid-cols-4 gap-px bg-white/5 overflow-hidden">
            {NUMPAD.map(key => (
              <button
                key={key}
                onClick={() => press(key)}
                className="bg-[#080b14] hover:bg-white/5 active:bg-white/10 active:scale-95 text-xl font-semibold text-white/70 transition-all touch-manipulation flex items-center justify-center"
              >
                {key}
              </button>
            ))}
            {/* Backspace — spans row position after '.' */}
            <button
              onClick={() => press('⌫')}
              className="bg-[#080b14] hover:bg-white/5 active:bg-white/10 text-white/40 hover:text-rose-400 transition-all touch-manipulation flex items-center justify-center"
            >
              <Delete className="w-5 h-5" />
            </button>

            {/* Pay button — spans 2 rows on the right */}
            <button
              onClick={handlePay}
              disabled={paying || paid || (entered !== '' && enteredNum < finalTotal)}
              className={cn(
                'row-span-2 flex flex-col items-center justify-center gap-2 text-lg font-bold transition-all active:scale-95 touch-manipulation',
                paid
                  ? 'bg-emerald-500 text-white'
                  : paying
                    ? 'bg-amber-500/70 text-white cursor-wait'
                    : entered !== '' && enteredNum < finalTotal
                      ? 'bg-white/4 text-white/20 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              )}
            >
              {paid
                ? <><Check className="w-6 h-6" />Paid!</>
                : paying
                  ? <><Loader2 className="w-6 h-6 animate-spin" />Processing</>
                  : 'Pay'}
            </button>
          </div>

          {/* Action buttons row */}
          <div className="shrink-0 grid grid-cols-3 gap-px bg-white/5 border-t border-white/8">
            <button className="h-12 bg-[#080b14] hover:bg-white/5 text-white/35 hover:text-white/60 text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation">
              Drawer
            </button>
            <button
              onClick={() => setShowInvoice(true)}
              className="h-12 bg-[#080b14] hover:bg-white/5 text-white/35 hover:text-white/60 text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation"
            >
              <Printer className="w-4 h-4" />
              Receipt
            </button>
            <button className="h-12 bg-[#080b14] hover:bg-white/5 text-white/35 hover:text-white/60 text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation">
              <Users className="w-4 h-4" />
              Customer
            </button>
          </div>

        </div>
      </div>
    </div>

    {/* Invoice modal — shown after payment */}
    {showInvoice && (
      <InvoiceModal
        orderId={orderId}
        restaurantId={restaurantId}
        tableNum={tableNum}
        guests={guests}
        items={items}
        subtotal={total}
        discount={discountAmount}
        surcharge={surchargeAmount}
        total={finalTotal}
        paymentMethod={payMethods.find(m => m.id === method)?.name ?? method}
        amountPaid={paidAmount}
        changeAmount={changeAmt}
        cashier={cashier}
        note={invoiceNote}
        onClose={() => { setShowInvoice(false); onPaid() }}
      />
    )}
    </>
  )
}
