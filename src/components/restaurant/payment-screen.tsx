'use client'
import { useState, useEffect } from 'react'
import { ArrowLeft, Users, Printer, Loader2, Check, Delete, Search, X, Phone, CreditCard, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import InvoiceModal from './invoice-modal'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { usePermissions } from '@/lib/permissions/PermissionsContext'

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
  const { can, isOwner } = usePermissions()
  const p = (key: string) => isOwner || can(key)
  const [payMethods, setPayMethods]       = useState<DbPayMethod[]>([])
  const [method, setMethod]               = useState<string>('')
  const [entered, setEntered]             = useState('')
  const [paying, setPaying]               = useState(false)
  const [paid, setPaid]                   = useState(false)
  const [activeTab, setActiveTab]         = useState<ActionTab | null>(null)
  const [showInvoice, setShowInvoice]     = useState(false)
  const [invoiceMode, setInvoiceMode]     = useState<'receipt' | 'payment'>('payment')
  const [showConfirm, setShowConfirm]     = useState(false)
  const [cashier, setCashier]             = useState('Staff')
  const [paidAmount, setPaidAmount]       = useState(0)
  const [changeAmt, setChangeAmt]         = useState(0)
  const [generatedInvoiceNum, setGeneratedInvoiceNum] = useState('')
  const [generatedOrderNum, setGeneratedOrderNum]     = useState('')
  const [orderNum, setOrderNum]                       = useState('')
  const [previewInvoiceNum, setPreviewInvoiceNum]     = useState('')
  const [discounts, setDiscounts]         = useState<DbDiscount[]>([])
  const [appliedDiscount, setApplied]     = useState<DbDiscount | null>(null)
  const [surcharges, setSurcharges]       = useState<DbSurcharge[]>([])
  const [appliedSurcharge, setAppliedSur] = useState<DbSurcharge | null>(null)
  const [invoiceNote, setInvoiceNote]     = useState('')
  const [plName, setPlName]               = useState('')
  const [plPhone, setPlPhone]             = useState('')
  const [plDueDate, setPlDueDate]         = useState('')
  const [plNote, setPlNote]               = useState('')
  const [payingLater, setPayingLater]     = useState(false)
  const [paidLater, setPaidLater]         = useState(false)
  const CUSTOMER_KEY = `pos_customer_table_${tableNum}`
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(() => {
    try {
      const s = localStorage.getItem(`pos_customer_table_${tableNum}`)
      if (s) { const c = JSON.parse(s); setPlName(c.name ?? ''); setPlPhone(c.phone ?? ''); return c }
      return null
    } catch { return null }
  })
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [customerList, setCustomerList]   = useState<{ id: string; name: string; phone: string | null; email: string | null }[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; phone: string | null; points: number; tier: string } | null>(null)
  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const [memberList, setMemberList]       = useState<{ id: string; name: string; phone: string | null; points: number; tier: string }[]>([])
  const [memberSearch, setMemberSearch]   = useState('')

  const persistCustomer = (c: typeof selectedCustomer) => {
    setSelectedCustomer(c)
    if (c) { setPlName(c.name); setPlPhone(c.phone ?? '') }
    try {
      if (c) localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c))
      else localStorage.removeItem(CUSTOMER_KEY)
    } catch { }
  }

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
    supabase
      .from('orders')
      .select('order_num')
      .eq('id', orderId)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => { if (data) setOrderNum((data as any).order_num ?? '') })
    supabase
      .from('invoice_number_settings')
      .select('prefix, current_num, start_num')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => {
        if (data) {
          const num = (data as any).current_num ?? (data as any).start_num ?? 1001
          setPreviewInvoiceNum(`${(data as any).prefix ?? 'INV-'}${num}`)
        }
      })
  }, [restaurantId, orderId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const openCustomerPicker = async () => {
    if (customerList.length === 0) {
      const { data } = await supabase.from('customers').select('id,name,phone,email')
        .eq('restaurant_id', restaurantId).eq('status', 'active').eq('blacklisted', false).order('name')
      setCustomerList((data ?? []) as typeof customerList)
    }
    setCustomerSearch('')
    setShowCustomerPicker(true)
  }

  const openMemberPicker = async () => {
    if (memberList.length === 0) {
      const { data } = await supabase.from('members').select('id,name,phone,points,tier')
        .eq('restaurant_id', restaurantId).eq('status', 'active').order('name')
      setMemberList((data ?? []) as typeof memberList)
    }
    setMemberSearch('')
    setShowMemberPicker(true)
  }

  const handlePayLater = async () => {
    if (!plName.trim()) { setPayError('Customer name is required'); return }
    setPayingLater(true)
    setPayError(null)
    const now = new Date().toISOString()

    // Mark orders as closed (pay_later is tracked separately)
    const { error: orderErr } = await supabase
      .from('orders')
      .update({ status: 'closed', total: finalTotal, updated_at: now })
      .eq('id', orderId)
    if (orderErr) {
      setPayError(`Order error: ${orderErr.message}`)
      setPayingLater(false)
      return
    }

    // Fetch order number for reference
    const { data: orderRecord } = await supabase.from('orders').select('order_num').eq('id', orderId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ordNum = (orderRecord as any)?.order_num ?? ''

    // Save to pay_later table
    const { error: plErr } = await supabase.from('pay_later').insert({
      restaurant_id:   restaurantId,
      customer_name:   plName.trim(),
      customer_phone:  plPhone.trim() || null,
      order_ref:       ordNum || null,
      table_num:       tableNum,
      original_amount: finalTotal,
      paid_amount:     0,
      due_date:        plDueDate || null,
      note:            plNote.trim() || null,
      status:          'pending',
      created_by:      cashier,
    })
    if (plErr) {
      setPayError(`Save error: ${plErr.message}`)
      setPayingLater(false)
      return
    }

    try { localStorage.removeItem(CUSTOMER_KEY) } catch { }
    setPayingLater(false)
    setPaidLater(true)
    setTimeout(() => onPaid(), 1500)
  }

  const handlePay = async () => {
    if (paying || paid) return
    setPaying(true)
    setPayError(null)

    const amountPaid   = enteredNum > 0 ? enteredNum : finalTotal
    const changeAmount = Math.max(0, amountPaid - finalTotal)
    const now          = new Date().toISOString()
    const methodName   = payMethods.find(m => m.id === method)?.name ?? method

    // Close active orders for this table (use orderId directly when tableNum is non-numeric)
    const tableNumInt = parseInt(tableNum)
    const closeQ = isNaN(tableNumInt)
      ? supabase.from('orders').update({ status: 'paid', total: finalTotal, updated_at: now }).eq('id', orderId)
      : supabase.from('orders').update({ status: 'paid', total: finalTotal, updated_at: now }).eq('table_number', tableNumInt).eq('status', 'active')
    const { error } = await closeQ.select('id')

    if (error) {
      setPayError(`DB error: ${error.message}`)
      setPaying(false)
      return
    }

    // Save payment details on the specific order
    await supabase
      .from('orders')
      .update({ payment_method: methodName, amount_paid: amountPaid, change_amount: changeAmount, note: invoiceNote || null })
      .eq('id', orderId)

    // Fetch order number + invoice settings in parallel
    const [{ data: orderRecord }, { data: invData }] = await Promise.all([
      supabase.from('orders').select('order_num').eq('id', orderId).maybeSingle(),
      supabase.from('invoice_number_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
    ])

    const ordNum = orderRecord?.order_num ?? ''
    setGeneratedOrderNum(ordNum)

    // Generate invoice number + increment counter
    let invNum: string
    if (invData) {
      const num = invData.current_num ?? invData.start_num ?? 1001
      invNum = `${invData.prefix ?? 'INV-'}${num}`
      await supabase
        .from('invoice_number_settings')
        .update({ current_num: num + 1, updated_at: new Date().toISOString() })
        .eq('restaurant_id', restaurantId)
    } else {
      // No settings row yet — create one with defaults and use 1001
      invNum = 'INV-1001'
      await supabase.from('invoice_number_settings').insert({
        restaurant_id: restaurantId,
        prefix:        'INV-',
        start_num:     1001,
        current_num:   1002,
        reset_period:  'never',
      })
    }
    setGeneratedInvoiceNum(invNum)

    // Save invoice — try with all optional fields, fall back on column errors
    const fullPayload = {
      restaurant_id:  restaurantId,
      invoice_num:    invNum,
      order_num:      ordNum,
      table_num:      tableNum,
      guests,
      cashier,
      payment_method: methodName,
      items,
      subtotal:       total,
      discount:       discountAmount,
      total:          finalTotal,
      amount_paid:    amountPaid,
      change_amount:  changeAmount,
      customer_id:    selectedCustomer?.id ?? null,
      customer_name:  selectedMember?.name ?? selectedCustomer?.name ?? null,
      customer_phone: selectedMember?.phone ?? selectedCustomer?.phone ?? null,
    }
    const { error: e1 } = await supabase.from('invoices').insert(fullPayload)
    if (e1) {
      // Strip any unrecognised columns and retry with minimal safe set
      const { error: e2 } = await supabase.from('invoices').insert({
        restaurant_id:  restaurantId,
        invoice_num:    invNum,
        order_num:      ordNum,
        table_num:      tableNum,
        guests,
        cashier,
        payment_method: methodName,
        items,
        subtotal:       total,
        total:          finalTotal,
        amount_paid:    amountPaid,
        change_amount:  changeAmount,
      })
      if (e2) console.error('[Invoice save failed]', e2.message)
    }

    // Update customer visit count + total spent
    if (selectedCustomer) {
      const { data: cust } = await supabase.from('customers').select('visit_count,total_spent').eq('id', selectedCustomer.id).maybeSingle()
      if (cust) {
        await supabase.from('customers').update({
          visit_count: (cust.visit_count ?? 0) + 1,
          total_spent: (cust.total_spent ?? 0) + finalTotal,
          updated_at: now,
        }).eq('id', selectedCustomer.id)
      }
    }

    // ── Inventory auto-deduct ─────────────────────────────────
    const { data: restSettings } = await supabase
      .from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
    const autoDeduct = (restSettings?.settings as Record<string, unknown> | null)?.inventory_auto_deduct === true
    if (autoDeduct) {
      // Get all non-voided order items with menu_item_id
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('menu_item_id, qty')
        .eq('order_id', orderId)
        .neq('status', 'void')
        .not('menu_item_id', 'is', null)

      if (orderItems && orderItems.length > 0) {
        const menuItemIds = [...new Set(orderItems.map((r: { menu_item_id: string; qty: number }) => r.menu_item_id))]

        // Get all ingredients for these menu items
        const { data: ingredients } = await supabase
          .from('menu_item_ingredients')
          .select('menu_item_id, inventory_item_id, quantity')
          .in('menu_item_id', menuItemIds)

        if (ingredients && ingredients.length > 0) {
          // Calculate total deduction per inventory item
          const deductMap = new Map<string, number>()
          for (const oi of orderItems as { menu_item_id: string; qty: number }[]) {
            const ings = ingredients.filter((g: { menu_item_id: string; inventory_item_id: string; quantity: number }) => g.menu_item_id === oi.menu_item_id)
            for (const ing of ings) {
              const prev = deductMap.get(ing.inventory_item_id) ?? 0
              deductMap.set(ing.inventory_item_id, prev + ing.quantity * oi.qty)
            }
          }

          // Fetch current stock and update
          const invIds = [...deductMap.keys()]
          const { data: invItems } = await supabase
            .from('inventory_items')
            .select('id, current_stock')
            .in('id', invIds)

          if (invItems) {
            await Promise.all(
              (invItems as { id: string; current_stock: number }[]).map(inv => {
                const deduct = deductMap.get(inv.id) ?? 0
                const newStock = Math.max(0, inv.current_stock - deduct)
                return supabase.from('inventory_items').update({ current_stock: newStock }).eq('id', inv.id)
              })
            )
          }
        }
      }
    }

    setPaidAmount(amountPaid)
    setChangeAmt(changeAmount)
    setPaid(true)
    setPaying(false)
    try { localStorage.removeItem(CUSTOMER_KEY) } catch { }
    setInvoiceMode('payment')
    setTimeout(() => setShowInvoice(true), 400)
  }

  const now = new Date()
  const timeStr = now.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

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
          {ACTION_TABS.filter(tab =>
            tab.id === 'surcharge' ? p('dashboard.surcharge') :
            tab.id === 'gratuity'  ? p('dashboard.gratuity')  :
            tab.id === 'discount'  ? p('dashboard.discount')  :
            tab.id === 'note'      ? p('dashboard.note')      :
            tab.id === 'split'     ? p('dashboard.split_bill'):
            tab.id === 'paylater'  ? p('dashboard.pay_later') : true
          ).map(tab => (
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
                <p className="text-sm font-bold text-white">{isNaN(parseInt(tableNum)) ? tableNum : `Table ${tableNum}`}{guests > 0 ? ` · ${guests} Guests` : ''}</p>
                <p className="text-xs text-white/30">{isNaN(parseInt(tableNum)) ? tableNum : 'Dine In'}</p>
              </div>
            </div>
            <div className="space-y-1 pt-1">
              {[
                ['Invoice', generatedInvoiceNum || previewInvoiceNum || '—'],
                ['Order',   orderNum ? orderNum : '—'],
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

          {/* Pay Later panel */}
          {activeTab === 'paylater' && (
            <div className="shrink-0 border-b border-white/8 bg-[#080b14] p-4 space-y-3">
              <p className="text-xs text-rose-400/70 font-semibold uppercase tracking-wider">Pay Later — {formatPrice(finalTotal)}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-white/35 mb-1">Customer Name <span className="text-rose-400">*</span></p>
                  <input
                    value={plName}
                    onChange={e => setPlName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/40 transition-colors"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-white/35 mb-1">Phone</p>
                  <input
                    value={plPhone}
                    onChange={e => setPlPhone(e.target.value)}
                    placeholder="07xx…"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/40 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-white/35 mb-1">Due Date <span className="text-white/20">(optional)</span></p>
                  <input
                    type="date"
                    value={plDueDate}
                    onChange={e => setPlDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-rose-500/40 transition-colors [color-scheme:dark] cursor-pointer"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-white/35 mb-1">Note <span className="text-white/20">(optional)</span></p>
                  <input
                    value={plNote}
                    onChange={e => setPlNote(e.target.value)}
                    placeholder="Reason…"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/40 transition-colors"
                  />
                </div>
              </div>
              {selectedCustomer && plName === selectedCustomer.name && (
                <p className="text-[10px] text-violet-400/70">Pre-filled from selected customer</p>
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

          {/* Numpad — 3 cols × 4 rows (12 keys, no gaps) */}
          <div className="flex-1 grid grid-cols-3 gap-px bg-white/5 overflow-hidden">
            {NUMPAD.map(key => (
              <button
                key={key}
                onClick={() => press(key)}
                className="bg-[#080b14] hover:bg-white/5 active:bg-white/10 active:scale-95 text-xl font-semibold text-white/70 transition-all touch-manipulation flex items-center justify-center"
              >
                {key}
              </button>
            ))}
          </div>

          {/* Backspace | Receipt | Pay  —OR—  Confirm Pay Later */}
          {activeTab === 'paylater' ? (
            <div className="shrink-0 flex gap-px h-20 bg-white/5">
              <button
                onClick={() => setActiveTab(null)}
                className="flex-1 bg-[#080b14] hover:bg-white/5 active:bg-white/10 text-white/40 hover:text-white/60 text-xs font-medium transition-all touch-manipulation flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                onClick={handlePayLater}
                disabled={payingLater || paidLater}
                className={cn(
                  'flex-[3] flex flex-col items-center justify-center gap-1 text-base font-bold transition-all active:scale-95 touch-manipulation',
                  paidLater
                    ? 'bg-emerald-500 text-white'
                    : payingLater
                      ? 'bg-rose-500/70 text-white cursor-wait'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                )}
              >
                {paidLater
                  ? <><Check className="w-5 h-5" />Saved to Pay Later!</>
                  : payingLater
                    ? <><Loader2 className="w-5 h-5 animate-spin" />Saving…</>
                    : <><CreditCard className="w-5 h-5" />Confirm Pay Later · {formatPrice(finalTotal)}</>
                }
              </button>
            </div>
          ) : (
            <div className="shrink-0 flex gap-px h-20 bg-white/5">
              <button
                onClick={() => press('⌫')}
                className="flex-1 bg-[#080b14] hover:bg-white/5 active:bg-white/10 text-white/40 hover:text-rose-400 transition-all touch-manipulation flex items-center justify-center"
              >
                <Delete className="w-5 h-5" />
              </button>
              {p('dashboard.receipt') && (
                <button
                  onClick={() => { setInvoiceMode('receipt'); setShowInvoice(true) }}
                  className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 touch-manipulation"
                >
                  <Printer className="w-4 h-4" />Receipt
                </button>
              )}
              {p('dashboard.pay') && (
                <button
                  onClick={() => !paying && !paid && !(entered !== '' && enteredNum < finalTotal) && setShowConfirm(true)}
                  disabled={paying || paid || (entered !== '' && enteredNum < finalTotal)}
                  className={cn(
                    'flex-[2] flex flex-col items-center justify-center gap-2 text-lg font-bold transition-all active:scale-95 touch-manipulation',
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
              )}
            </div>
          )}

          {/* Action buttons row */}
          {(p('dashboard.drawer') || p('dashboard.member') || p('dashboard.customer')) && (
            <div className="shrink-0 flex gap-px bg-white/5 border-t border-white/8">
              {p('dashboard.drawer') && (
                <button className="flex-1 h-12 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation">
                  Drawer
                </button>
              )}
              {p('dashboard.member') && (
                <button onClick={openMemberPicker} className="flex-1 h-12 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation px-2 overflow-hidden">
                  <Star className="w-4 h-4 shrink-0" />
                  <span className="truncate">{selectedMember ? selectedMember.name : 'Member'}</span>
                  {selectedMember && (
                    <span role="button" onClick={e => { e.stopPropagation(); setSelectedMember(null) }} className="shrink-0 text-white/60 hover:text-white cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              )}
              {p('dashboard.customer') && (
                <button onClick={openCustomerPicker} className="flex-1 h-12 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation px-2 overflow-hidden">
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="truncate">{selectedCustomer ? selectedCustomer.name : 'Customer'}</span>
                  {selectedCustomer && (
                    <span role="button" onClick={e => { e.stopPropagation(); persistCustomer(null) }} className="shrink-0 text-white/60 hover:text-white cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>

    {/* Confirm Pay dialog */}
    {showConfirm && (
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
              onClick={() => setShowConfirm(false)}
              className="flex-1 py-3 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 text-sm font-medium transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowConfirm(false); handlePay() }}
              className="flex-[2] py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-all active:scale-95 shadow-lg shadow-amber-500/20"
            >
              Confirm Payment
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Invoice modal — shown after payment or when Receipt is clicked */}
    {showInvoice && (
      <InvoiceModal
        mode={invoiceMode}
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
        customerId={selectedCustomer?.id ?? null}
        customerName={selectedMember?.name ?? selectedCustomer?.name ?? null}
        customerPhone={selectedMember?.phone ?? selectedCustomer?.phone ?? null}
        invoiceNum={generatedInvoiceNum || previewInvoiceNum}
        orderNum={generatedOrderNum || orderNum}
        autoPrint={true}
        onClose={() => { setShowInvoice(false); if (invoiceMode === 'payment') onPaid() }}
      />
    )}

    {/* Member Picker */}
    {showMemberPicker && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-[#0d1220] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <h3 className="text-base font-bold text-white">Select Member</h3>
            <button onClick={() => setShowMemberPicker(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search name or phone…" autoFocus
                className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
            {memberList
              .filter(m => {
                const q = memberSearch.toLowerCase()
                return !q || m.name.toLowerCase().includes(q) || m.phone?.includes(q)
              })
              .map(m => (
                <button key={m.id} onClick={() => { setSelectedMember(m); setShowMemberPicker(false) }}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-95',
                    selectedMember?.id === m.id ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-white/4 hover:bg-white/8 border border-transparent')}>
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 shrink-0">{m.tier}</span>
                    </div>
                    {m.phone && <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{m.phone}</p>}
                    <p className="text-xs text-amber-400/60 mt-0.5">{m.points} pts</p>
                  </div>
                  {selectedMember?.id === m.id && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                </button>
              ))}
            {memberList.length === 0 && (
              <p className="text-center text-white/30 text-sm py-8">No active members found</p>
            )}
          </div>
        </div>
      </div>
    )}

    {/* Customer Picker */}
    {showCustomerPicker && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-[#0d1220] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <h3 className="text-base font-bold text-white">Select Customer</h3>
            <button onClick={() => setShowCustomerPicker(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search name or phone…" autoFocus
                className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 transition-colors" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
            {customerList
              .filter(c => {
                const q = customerSearch.toLowerCase()
                return !q || c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
              })
              .map(c => (
                <button key={c.id} onClick={() => { persistCustomer({ id: c.id, name: c.name, phone: c.phone }); setShowCustomerPicker(false) }}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-95',
                    selectedCustomer?.id === c.id ? 'bg-violet-500/20 border border-violet-500/30' : 'bg-white/4 hover:bg-white/8 border border-transparent')}>
                  <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                    {c.phone && <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{c.phone}</p>}
                  </div>
                  {selectedCustomer?.id === c.id && <Check className="w-4 h-4 text-violet-400 ml-auto shrink-0" />}
                </button>
              ))}
            {customerList.length === 0 && (
              <p className="text-center text-white/30 text-sm py-8">No active customers found</p>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
