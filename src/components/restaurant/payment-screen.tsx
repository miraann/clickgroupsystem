'use client'
import { useState, useEffect } from 'react'
import { ArrowLeft, Users, Printer, Loader2, Check, Delete, X, CreditCard, Star, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import InvoiceModal from './invoice-modal'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import { logAudit } from '@/lib/logAudit'
import { ConfirmPayDialog } from './payment/ConfirmPayDialog'
import { MemberPicker }     from './payment/MemberPicker'
import { CustomerPicker }   from './payment/CustomerPicker'
import type { Item, DbDiscount, DbSurcharge, ActionTab } from './payment/types'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { mutate as swrMutate } from 'swr'
import { SWR_KEY } from '@/hooks/useDashboardTables'
import type { DashboardFullData } from '@/hooks/useDashboardTables'
import { useCheckoutData } from '@/hooks/useCheckoutData'

interface Props {
  orderId:      string
  restaurantId: string
  orderNum?:    string | null
  tableNum:     string
  guests:       number
  items:        Item[]
  total:        number
  onClose:      () => void
  onPaid:       () => void
}

const ICON_COLORS: Record<string, { inactive: string; active: string }> = {
  cash:   { inactive: 'text-emerald-400', active: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' },
  card:   { inactive: 'text-orange-400',  active: 'bg-orange-500/20 border-orange-500/40 text-orange-300'   },
  online: { inactive: 'text-violet-400',  active: 'bg-violet-500/20 border-violet-500/40 text-violet-300'   },
  wallet: { inactive: 'text-blue-400',    active: 'bg-blue-500/20 border-blue-500/40 text-blue-300'         },
  other:  { inactive: 'text-pink-400',    active: 'bg-pink-500/20 border-pink-500/40 text-pink-300'         },
}

const ACTION_TABS: { id: ActionTab; labelKey: 'pay_tab_surcharge' | 'pay_tab_gratuity' | 'pay_tab_discount' | 'pay_tab_note' | 'pay_tab_split' | 'pay_tab_paylater'; inactive: string; active: string }[] = [
  { id: 'surcharge', labelKey: 'pay_tab_surcharge', inactive: 'text-orange-400/80  bg-orange-500/15  hover:bg-orange-500/25', active: 'text-white bg-orange-500' },
  { id: 'gratuity',  labelKey: 'pay_tab_gratuity',  inactive: 'text-violet-400/80  bg-violet-500/15  hover:bg-violet-500/25', active: 'text-white bg-violet-600' },
  { id: 'discount',  labelKey: 'pay_tab_discount',  inactive: 'text-yellow-400/80  bg-yellow-500/15  hover:bg-yellow-500/25', active: 'text-white bg-amber-500'  },
  { id: 'note',      labelKey: 'pay_tab_note',      inactive: 'text-sky-400/80     bg-sky-500/15     hover:bg-sky-500/25',    active: 'text-white bg-sky-500'    },
  { id: 'split',     labelKey: 'pay_tab_split',     inactive: 'text-emerald-400/80 bg-emerald-500/15 hover:bg-emerald-500/25',active: 'text-white bg-emerald-500'},
  { id: 'paylater',  labelKey: 'pay_tab_paylater',  inactive: 'text-rose-400/80    bg-rose-500/15    hover:bg-rose-500/25',   active: 'text-white bg-rose-500'   },
]

const NUMPAD = ['7','8','9','4','5','6','1','2','3','0','00','.']

export default function PaymentScreen({ orderId, restaurantId, orderNum: orderNumProp, tableNum, guests, items, total, onClose, onPaid }: Props) {
  const { can, isOwner, isPinStaff, staffName, roleName } = usePermissions()
  const { t } = useLanguage()
  const p = (key: string) => isOwner || can(key)
  const { checkout } = useCheckoutData(restaurantId)
  const [method, setMethod]               = useState<string>('')
  const [entered, setEntered]             = useState('')
  const [paying, setPaying]               = useState(false)
  const [paid, setPaid]                   = useState(false)
  const [activeTab, setActiveTab]         = useState<ActionTab | null>(null)
  const [showInvoice, setShowInvoice]     = useState(false)
  const [invoiceMode, setInvoiceMode]     = useState<'receipt' | 'payment'>('payment')
  const [showConfirm, setShowConfirm]     = useState(false)
  const [authFullName, setAuthFullName]   = useState<string | null>(null)
  const [paidAmount, setPaidAmount]       = useState(0)
  const [changeAmt, setChangeAmt]         = useState(0)
  const [generatedInvoiceNum, setGeneratedInvoiceNum] = useState('')
  const [generatedOrderNum, setGeneratedOrderNum]     = useState('')
  const orderNum          = orderNumProp ?? ''
  const previewInvoiceNum = checkout.invoicePreview
  const payMethods        = checkout.payMethods
  const discounts         = checkout.discounts
  const surcharges        = checkout.surcharges
  const [appliedDiscount, setApplied]     = useState<DbDiscount | null>(null)
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
  const [selectedMember, setSelectedMember]         = useState<{ id: string; name: string; phone: string | null; points: number; tier: string } | null>(null)
  const [showMemberPicker, setShowMemberPicker]     = useState(false)
  const [showWaModal, setShowWaModal]               = useState(false)
  const [waPhone, setWaPhone]                       = useState('+964')
  const [waTemplates, setWaTemplates]               = useState<{id:string;name:string;message:string}[]>([])
  const [waTemplatesLoaded, setWaTemplatesLoaded]   = useState(false)
  const [selectedWaTemplateId, setSelectedWaTemplateId] = useState<string|null>(null)

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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAuthFullName((user?.user_metadata?.full_name as string) ?? null)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cashier label for the receipt / invoice. Never a login email: the owner
  // signs in with one and it must not be printed on a customer receipt.
  const cashier =
    isOwner                     ? 'SuperAdmin'
    : (isPinStaff && staffName)  ? staffName
    : (authFullName || staffName || roleName || 'Staff')

  // Reference data (methods / discounts / surcharges / invoice #) comes from
  // the shared `useCheckoutData` SWR cache, prewarmed by the order screen.
  // Pick the default payment method once it arrives.
  useEffect(() => {
    if (method || payMethods.length === 0) return
    const def = payMethods.find(m => m.is_default) ?? payMethods[0]
    if (def) setMethod(def.id)
  }, [payMethods, method])

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

  const press = (key: string) => {
    if (key === '⌫') { setEntered(v => v.slice(0, -1)); return }
    if (key === 'C')  { setEntered(''); return }
    if (key === 'Exact') { setEntered(finalTotal.toFixed(decimalPlaces)); return }
    if (key === '.' && entered.includes('.')) return
    const dotIdx = entered.indexOf('.')
    if (dotIdx !== -1 && entered.length - dotIdx > 2) return
    setEntered(v => v + key)
  }

  const [payError, setPayError] = useState<string | null>(null)

  const handlePayLater = async () => {
    if (!plName.trim()) { setPayError(t.pay_name_required); return }
    setPayingLater(true)
    setPayError(null)
    const now = new Date().toISOString()

    // Re-calculate total server-side before saving to pay_later
    const { data: liveItems } = await supabase
      .from('order_items')
      .select('item_price, qty')
      .eq('order_id', orderId)
      .neq('status', 'void')
    const verifiedTotal = liveItems
      ? Math.max(0, liveItems.reduce((s, i) => s + (i.item_price ?? 0) * (i.qty ?? 1), 0) - discountAmount + surchargeAmount)
      : finalTotal

    const { error: orderErr } = await supabase
      .from('orders')
      .update({ status: 'closed', total: verifiedTotal, updated_at: now })
      .eq('id', orderId)
    if (orderErr) {
      setPayError(`${t.pay_order_error} ${orderErr.message}`)
      setPayingLater(false)
      return
    }

    const { data: orderRecord } = await supabase.from('orders').select('order_num').eq('id', orderId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ordNum = (orderRecord as any)?.order_num ?? ''

    const { error: plErr } = await supabase.from('pay_later').insert({
      restaurant_id:   restaurantId,
      customer_name:   plName.trim(),
      customer_phone:  plPhone.trim() || null,
      order_ref:       ordNum || null,
      table_num:       tableNum,
      original_amount: verifiedTotal,
      paid_amount:     0,
      due_date:        plDueDate || null,
      note:            plNote.trim() || null,
      status:          'pending',
      created_by:      cashier,
    })
    if (plErr) {
      setPayError(`${t.pay_save_error} ${plErr.message}`)
      setPayingLater(false)
      return
    }

    try { localStorage.removeItem(CUSTOMER_KEY) } catch { }
    logAudit(restaurantId, 'pay_later', { customer: plName.trim(), table: tableNum, amount: verifiedTotal, order_num: ordNum || undefined })
    setPayingLater(false)
    setPaidLater(true)
    setTimeout(() => onPaid(), 1500)
  }

  const handlePay = async () => {
    if (paying || paid) return
    setPaying(true)
    setPayError(null)

    const res = await fetch('/api/payment/finalize', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        restaurantId,
        discountId:      appliedDiscount?.id   ?? null,
        surchargeId:     appliedSurcharge?.id  ?? null,
        paymentMethodId: method,
        amountPaid:      enteredNum > 0 ? enteredNum : 0,
        note:            invoiceNote || null,
        customerId:      selectedCustomer?.id  ?? null,
        customerName:    selectedMember?.name  ?? selectedCustomer?.name  ?? null,
        customerPhone:   selectedMember?.phone ?? selectedCustomer?.phone ?? null,
        tableNum,
        guests,
        staffId:         typeof window !== 'undefined' ? (localStorage.getItem('pos_staff_id') ?? null) : null,
        isOwner:         typeof window !== 'undefined' ? localStorage.getItem('owner_session') === 'true' : false,
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.ok) {
      setPayError(data.error ?? t.pay_failed)
      setPaying(false)
      return
    }

    const {
      finalTotal:    verifiedTotal,
      invoiceNum:    invNum,
      orderNum:      ordNum,
      amountPaid:    paidAmt,
      changeAmount:  serverChange,
    } = data as {
      finalTotal: number; invoiceNum: string; orderNum: string
      amountPaid: number; changeAmount: number
    }

    setGeneratedInvoiceNum(invNum)
    setGeneratedOrderNum(ordNum)

    logAudit(restaurantId, 'payment', {
      table:       tableNum,
      order_id:    orderId,
      total:       verifiedTotal,
      amount_paid: paidAmt,
      change:      serverChange,
      method:      data.paymentMethodName,
    })

    // Update customer stats using the server-verified total
    if (selectedCustomer) {
      const now = new Date().toISOString()
      const { data: cust } = await supabase.from('customers').select('visit_count,total_spent').eq('id', selectedCustomer.id).maybeSingle()
      if (cust) {
        await supabase.from('customers').update({
          visit_count: (cust.visit_count ?? 0) + 1,
          total_spent: (cust.total_spent ?? 0) + verifiedTotal,
          updated_at:  now,
        }).eq('id', selectedCustomer.id)
      }
    }

    // Inventory auto-deduct now happens atomically, server-side, inside
    // /api/payment/finalize (fn_deduct_inventory_for_order RPC) — this avoids
    // the read-then-write race that existed here when two payments for
    // overlapping menu items landed at the same time. Low-stock / out-of-stock /
    // rapid-depletion notifications are generated by a DB trigger on that update.

    // Optimistically mark table as dirty in the dashboard SWR cache so it
    // shows red immediately when the user navigates back — no hard refresh needed.
    const tableSeq = parseInt(tableNum)
    if (!isNaN(tableSeq)) {
      swrMutate(
        SWR_KEY(restaurantId),
        (prev: DashboardFullData | undefined) => {
          if (!prev) return prev
          return {
            ...prev,
            tables: prev.tables.map(t =>
              t.number === tableSeq
                ? { id: t.id, number: t.number, label: t.label, capacity: t.capacity, shape: t.shape, group_id: t.group_id, status: 'dirty' as const }
                : t
            ),
          }
        },
        false,
      )
    }

    setPaidAmount(paidAmt)
    setChangeAmt(serverChange)
    setPaid(true)
    setPaying(false)
    try { localStorage.removeItem(CUSTOMER_KEY) } catch { }
    setInvoiceMode('payment')
    setTimeout(() => setShowInvoice(true), 400)
  }

  const loadWaTemplates = async () => {
    if (waTemplatesLoaded) return
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('id, name, message')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as {id:string;name:string;message:string}[]
    setWaTemplates(rows)
    setWaTemplatesLoaded(true)
    if (rows.length > 0) setSelectedWaTemplateId(rows[0].id)
  }

  const resolveMessage = (msg: string) => {
    const slug = typeof window !== 'undefined' ? localStorage.getItem('restaurant_slug') : null
    const menuLink = typeof window !== 'undefined'
      ? `${window.location.origin}/r/${slug ?? restaurantId}`
      : ''
    return msg
      .replace(/\{\{total\}\}/g, formatPrice(finalTotal))
      .replace(/\{\{table\}\}/g, tableNum)
      .replace(/\{\{menu_link\}\}/g, menuLink)
  }

  const selectedWaTemplate = waTemplates.find(t => t.id === selectedWaTemplateId) ?? null
  const waMessage = selectedWaTemplate ? resolveMessage(selectedWaTemplate.message) : ''

  const sendWhatsApp = (phone: string) => {
    const cleaned = phone.replace(/[\s\-()]/g, '')
    window.open(`https://wa.me/${cleaned}?text=${encodeURIComponent(waMessage)}`, '_blank')
  }

  const handleWaButton = () => {
    setWaPhone(selectedMember?.phone ?? selectedCustomer?.phone ?? '+964')
    setShowWaModal(true)
    loadWaTemplates()
  }

  const now = new Date()
  const timeStr = now.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: 'var(--app-bg, #022658)' }}>

      {/* ── Top action bar ── */}
      <div className="shrink-0 flex items-center border-b border-white/8 bg-[#080b14]">
        <button
          onClick={onClose}
          className="w-12 md:w-14 h-11 md:h-12 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-all active:scale-95 touch-manipulation border-r border-white/8 shrink-0"
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
                'shrink-0 flex-1 min-w-[72px] h-11 text-xs md:text-sm font-semibold border-r border-white/8 transition-all active:scale-95 touch-manipulation',
                activeTab === tab.id ? tab.active : tab.inactive
              )}
            >
              {t[tab.labelKey]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Receipt (desktop only) ── */}
        <div className="hidden md:flex md:w-80 xl:w-96 shrink-0 flex-col border-r border-white/8">

          {/* Order meta */}
          <div className="shrink-0 p-5 border-b border-white/8 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{isNaN(parseInt(tableNum)) ? tableNum : `${t.kds_table} ${tableNum}`}{guests > 0 ? ` · ${guests} ${t.pay_guests}` : ''}</p>
                <p className="text-xs text-white/30">{isNaN(parseInt(tableNum)) ? tableNum : t.pay_dine_in}</p>
              </div>
            </div>
            <div className="space-y-1 pt-1">
              {[
                [t.pay_invoice, generatedInvoiceNum || previewInvoiceNum || '—'],
                [t.pay_order,   orderNum ? orderNum : '—'],
                [t.pay_time,    timeStr],
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
              <span>{t.pay_subtotal}</span>
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
              <span>{t.pay_total}</span>
              <span className="text-amber-400 tabular-nums">{formatPrice(finalTotal)}</span>
            </div>
          </div>
        </div>

        {/* ── Right: Payment ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Mobile-only: compact order info (receipt panel is hidden on mobile) */}
          <div className="md:hidden shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/8 bg-black/20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-tight">{isNaN(parseInt(tableNum)) ? tableNum : `${t.kds_table} ${tableNum}`}{guests > 0 ? ` · ${guests} ${t.pay_guests}` : ''}</p>
                <p className="text-[11px] text-white/35">{items.length} {t.pay_items} · {isNaN(parseInt(tableNum)) ? tableNum : t.pay_dine_in}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/30 uppercase tracking-wide">{t.pay_total}</p>
              <p className="text-base font-bold text-amber-400 tabular-nums">{formatPrice(finalTotal)}</p>
            </div>
          </div>

          {/* Summary row */}
          <div className="shrink-0 grid grid-cols-4 divide-x divide-white/8 border-b border-white/8">
            {[
              { label: t.pay_total,  value: formatPrice(finalTotal),                                              color: 'text-white' },
              { label: t.pay_pay,    value: formatPrice(payAmount),                                                color: 'text-amber-400' },
              { label: t.pay_paid,   value: enteredNum > 0 ? formatPrice(enteredNum) : formatPrice(0),            color: enteredNum > 0 ? 'text-white/70' : 'text-white/25' },
              { label: t.pay_change, value: formatPrice(change),                                                   color: change > 0 ? 'text-emerald-400' : 'text-white/25' },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center justify-center py-2 md:py-4 gap-0.5 md:gap-1">
                <span className="text-[10px] md:text-xs text-white/30 uppercase tracking-wider">{s.label}</span>
                <span className={cn('text-sm md:text-lg font-bold tabular-nums', s.color)}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Payment methods */}
          <div className="shrink-0 flex gap-2 px-4 py-3 border-b border-white/8 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {payMethods.length === 0 ? (
              <p className="text-xs text-white/25 italic self-center">{t.pay_no_methods}</p>
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
                <p className="text-xs text-white/25 italic text-center py-2">{t.pay_no_surcharges}</p>
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
                <p className="text-xs text-white/25 italic text-center py-2">{t.pay_no_discounts}</p>
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
                          <span className="text-[10px] text-white/25">{t.pay_min} {formatPrice(d.min_order)}</span>
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
              <p className="text-xs text-white/30 font-medium">{t.pay_note_label}</p>
              <textarea
                value={invoiceNote}
                onChange={e => setInvoiceNote(e.target.value)}
                placeholder={t.pay_note_ph}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/40 resize-none transition-colors"
              />
              {invoiceNote && (
                <button
                  onClick={() => setInvoiceNote('')}
                  className="text-xs text-white/25 hover:text-rose-400 transition-colors"
                >
                  {t.pay_clear_note}
                </button>
              )}
            </div>
          )}

          {/* Pay Later panel */}
          {activeTab === 'paylater' && (
            <div className="shrink-0 border-b border-white/8 bg-[#080b14] p-4 space-y-3">
              <p className="text-xs text-rose-400/70 font-semibold uppercase tracking-wider">{t.pay_tab_paylater} — {formatPrice(finalTotal)}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-white/35 mb-1">{t.pay_cust_name} <span className="text-rose-400">*</span></p>
                  <input
                    value={plName}
                    onChange={e => setPlName(e.target.value)}
                    placeholder={t.pay_full_name_ph}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/40 transition-colors"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-white/35 mb-1">{t.pay_phone}</p>
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
                  <p className="text-[10px] text-white/35 mb-1">{t.pay_due_date} <span className="text-white/20">{t.pay_optional}</span></p>
                  <input
                    type="date"
                    value={plDueDate}
                    onChange={e => setPlDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 focus:outline-none focus:border-rose-500/40 transition-colors [color-scheme:dark] cursor-pointer"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-white/35 mb-1">{t.pay_tab_note} <span className="text-white/20">{t.pay_optional}</span></p>
                  <input
                    value={plNote}
                    onChange={e => setPlNote(e.target.value)}
                    placeholder={t.pay_reason_ph}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/40 transition-colors"
                  />
                </div>
              </div>
              {selectedCustomer && plName === selectedCustomer.name && (
                <p className="text-[10px] text-violet-400/70">{t.pay_prefilled_cust}</p>
              )}
            </div>
          )}

          {/* Amount display */}
          <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-white/8">
            <div>
              {entered ? (
                <p className="text-3xl font-bold text-white tabular-nums">{cur}{entered}</p>
              ) : (
                <p className="text-3xl font-bold text-white/20 tabular-nums">{formatPrice(finalTotal)}</p>
              )}
              {entered && shortfall > 0 && (
                <p className="text-xs text-rose-400/70 mt-1">{t.pay_short_by} {formatPrice(shortfall)}</p>
              )}
              {entered && change > 0 && (
                <p className="text-xs text-emerald-400/70 mt-1">{t.pay_change_label} {formatPrice(change)}</p>
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
                {t.pay_exact}
              </button>
              <button
                onClick={() => press('C')}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-rose-400/50 hover:bg-rose-500/10 hover:text-rose-400 transition-all active:scale-95 touch-manipulation"
              >
                {t.clear}
              </button>
            </div>
          </div>

          {/* Numpad */}
          <div className="flex-1 grid grid-cols-3 gap-px bg-white/5 overflow-hidden" dir="ltr">
            {NUMPAD.map(key => (
              <button
                key={key}
                onClick={() => press(key)}
                className="bg-transparent hover:bg-white/5 active:bg-white/10 active:scale-95 text-xl font-semibold text-white/70 transition-all touch-manipulation flex items-center justify-center"
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
                className="flex-1 bg-transparent hover:bg-white/5 active:bg-white/10 text-white/40 hover:text-white/60 text-xs font-medium transition-all touch-manipulation flex items-center justify-center"
              >
                {t.cancel}
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
                  ? <><Check className="w-5 h-5" />{t.pay_saved_paylater}</>
                  : payingLater
                    ? <><Loader2 className="w-5 h-5 animate-spin" />{t.pay_saving}</>
                    : <><CreditCard className="w-5 h-5" />{t.pay_confirm_paylater} · {formatPrice(finalTotal)}</>
                }
              </button>
            </div>
          ) : (
            <div className="shrink-0 flex gap-px h-20 bg-white/5">
              <button
                onClick={() => press('⌫')}
                className="flex-1 bg-transparent hover:bg-white/5 active:bg-white/10 text-white/40 hover:text-rose-400 transition-all touch-manipulation flex items-center justify-center"
              >
                <Delete className="w-5 h-5" />
              </button>
              {p('dashboard.receipt') && (
                <button
                  onClick={() => { setInvoiceMode('receipt'); setShowInvoice(true) }}
                  className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 touch-manipulation"
                >
                  <Printer className="w-4 h-4" />{t.pay_receipt}
                </button>
              )}
              {p('payment_screen.wa') && (
                <button
                  onClick={handleWaButton}
                  className="flex-1 bg-green-600/20 hover:bg-green-600/35 text-green-400 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 touch-manipulation"
                  title={t.pay_wa_send_invoice}
                >
                  <MessageCircle className="w-4 h-4" />WA
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
                    ? <><Check className="w-6 h-6" />{t.pay_paid_excl}</>
                    : paying
                      ? <><Loader2 className="w-6 h-6 animate-spin" />{t.pay_processing}</>
                      : t.pay_pay}
                </button>
              )}
            </div>
          )}

          {/* Action buttons row */}
          {(p('dashboard.drawer') || p('dashboard.member') || p('dashboard.customer')) && (
            <div className="shrink-0 flex gap-px bg-white/5 border-t border-white/8">
              {p('dashboard.drawer') && (
                <button className="flex-1 h-12 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation">
                  {t.pay_drawer}
                </button>
              )}
              {p('dashboard.member') && (
                <button onClick={() => setShowMemberPicker(true)} className="flex-1 h-12 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation px-2 overflow-hidden">
                  <Star className="w-4 h-4 shrink-0" />
                  <span className="truncate">{selectedMember ? selectedMember.name : t.pay_member}</span>
                  {selectedMember && (
                    <span role="button" onClick={e => { e.stopPropagation(); setSelectedMember(null) }} className="shrink-0 text-white/60 hover:text-white cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              )}
              {p('dashboard.customer') && (
                <button onClick={() => setShowCustomerPicker(true)} className="flex-1 h-12 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation px-2 overflow-hidden">
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="truncate">{selectedCustomer ? selectedCustomer.name : t.pay_customer}</span>
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

    <ConfirmPayDialog
      open={showConfirm}
      onCancel={() => setShowConfirm(false)}
      onConfirm={() => { setShowConfirm(false); handlePay() }}
      tableNum={tableNum}
      guests={guests}
      items={items}
      total={total}
      finalTotal={finalTotal}
      appliedDiscount={appliedDiscount}
      discountAmount={discountAmount}
      appliedSurcharge={appliedSurcharge}
      surchargeAmount={surchargeAmount}
      payMethods={payMethods}
      method={method}
      enteredNum={enteredNum}
      change={change}
      selectedMember={selectedMember}
      selectedCustomer={selectedCustomer}
      formatPrice={formatPrice}
    />

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
        paymentMethodType={payMethods.find(m => m.id === method)?.icon_type ?? null}
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

    <MemberPicker
      open={showMemberPicker}
      restaurantId={restaurantId}
      selectedId={selectedMember?.id ?? null}
      onSelect={setSelectedMember}
      onClose={() => setShowMemberPicker(false)}
    />

    <CustomerPicker
      open={showCustomerPicker}
      restaurantId={restaurantId}
      selectedId={selectedCustomer?.id ?? null}
      onSelect={persistCustomer}
      onClose={() => setShowCustomerPicker(false)}
    />

    {showWaModal && (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-[#0d1220] border border-white/15 rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
            <div className="w-9 h-9 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{t.pay_wa_send}</p>
              <p className="text-[11px] text-white/35">{t.pay_wa_subtitle}</p>
            </div>
            <button onClick={() => setShowWaModal(false)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-5 space-y-4">

            {/* Template selector */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">{t.pay_wa_template}</p>
              {!waTemplatesLoaded ? (
                <div className="flex items-center gap-2 text-xs text-white/30 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.pay_wa_loading}
                </div>
              ) : waTemplates.length === 0 ? (
                <p className="text-xs text-white/30 py-2">{t.pay_wa_no_templates}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {waTemplates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedWaTemplateId(t.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95',
                        selectedWaTemplateId === t.id
                          ? 'bg-green-500/20 border-green-500/40 text-green-300'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Message preview */}
            {waMessage && (
              <div className="rounded-xl bg-[#0b141a] border border-white/8 p-3">
                <p className="text-[10px] text-white/25 mb-2 uppercase tracking-wider">{t.pay_wa_preview}</p>
                <div className="flex justify-end">
                  <div className="max-w-[90%] rounded-xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words" style={{ background: '#d9fdd3', color: '#111b21' }}>
                    {waMessage}
                  </div>
                </div>
              </div>
            )}

            {/* Phone input */}
            <div>
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">{t.pay_wa_phone}</p>
              <input
                value={waPhone}
                onChange={e => setWaPhone(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && waPhone.trim() && waMessage) { sendWhatsApp(waPhone.trim()); setShowWaModal(false) } }}
                placeholder="+964 750 123 4567"
                type="tel"
                autoFocus
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-green-500/40 transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowWaModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/50 text-sm font-medium transition-all active:scale-95">
                {t.cancel}
              </button>
              <button
                onClick={() => { if (waPhone.trim() && waMessage) { sendWhatsApp(waPhone.trim()); setShowWaModal(false) } }}
                disabled={!waPhone.trim() || !waMessage}
                className="flex-[2] py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" />{t.pay_wa_send}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
