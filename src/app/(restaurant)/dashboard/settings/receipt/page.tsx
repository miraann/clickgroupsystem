'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Receipt, Save, Loader2, AlertCircle, Upload,
  Check, ImageIcon, QrCode, Eye,
  FileText, Search, ChevronDown, ChevronUp,
  Hash, CheckCircle2, ToggleLeft, ToggleRight,
  RotateCcw, X, User, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import InvoiceViewModal from '@/components/restaurant/invoice-view-modal'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface RS {
  id?: string
  shop_name: string
  logo_url: string
  phone: string
  address: string
  thank_you_msg: string
  currency_symbol: string
  show_qr: boolean
  qr_url: string
  show_logo: boolean
  show_address: boolean
  show_phone: boolean
}

const DEFAULTS: RS = {
  shop_name: '',
  logo_url: '',
  phone: '',
  address: '',
  thank_you_msg: 'Thank you for your visit!',
  currency_symbol: '$',
  show_qr: true,
  qr_url: '',
  show_logo: true,
  show_address: true,
  show_phone: true,
}

const SAMPLE_ITEMS = [
  { name: 'Sample Item One', qty: 2, price: 10.00 },
  { name: 'Sample Item Two', qty: 1, price: 15.00 },
]
const SAMPLE_SUBTOTAL = SAMPLE_ITEMS.reduce((s, i) => s + i.price * i.qty, 0)
const SAMPLE_DISCOUNT = 2.00
const SAMPLE_TOTAL = SAMPLE_SUBTOTAL - SAMPLE_DISCOUNT

// ── Live Preview ───────────────────────────────────────────────
function InvoicePreview({ s, restaurantName }: { s: RS; restaurantName: string }) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  const displayName = s.shop_name || restaurantName || 'Restaurant Name'

  return (
    <div className="bg-white rounded-2xl shadow-2xl shadow-black/40 w-[320px] text-[11px] font-sans overflow-hidden border border-gray-100 select-none">

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between mb-3">
          {/* Left: date/time/cashier */}
          <div className="space-y-0.5 text-[10px]">
            <div className="font-bold text-black">{dateStr}</div>
            <div className="font-bold text-black">{timeStr}</div>
            <div className="font-bold text-black mt-1">Cashier</div>
            <div className="font-bold text-black">Staff</div>
          </div>

          {/* Center: logo + name */}
          <div className="flex flex-col items-center gap-1.5 px-2">
            {s.show_logo && s.logo_url ? (
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-gray-200 shadow-sm shrink-0">
                <img src={s.logo_url} alt="logo" className="w-full h-full object-cover" />
              </div>
            ) : s.show_logo ? (
              <div className="w-14 h-14 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center shrink-0">
                <ImageIcon className="w-6 h-6 text-gray-300" />
              </div>
            ) : null}
            <div className="text-center">
              <p className="font-extrabold text-black text-[13px] leading-tight">{displayName}</p>
            </div>
          </div>

          {/* Right: invoice number + employee */}
          <div className="space-y-0.5 text-[10px] text-right">
            <div className="font-bold text-black">Invoice No.</div>
            <div className="font-extrabold text-black">#12345</div>
            <div className="font-bold text-black mt-1">Employee</div>
            <div className="font-bold text-black">Sample User</div>
          </div>
        </div>

        {/* Contact info */}
        {(s.show_phone && s.phone) || (s.show_address && s.address) ? (
          <div className="text-center text-[10px] mt-1 space-y-0.5 pb-2 border-b border-dashed border-gray-300">
            {s.show_phone && s.phone && <div className="font-bold text-black">{s.phone}</div>}
            {s.show_address && s.address && <div className="font-semibold text-black/70">{s.address}</div>}
          </div>
        ) : (
          <div className="border-b border-dashed border-gray-300 mb-1" />
        )}
      </div>

      {/* Payment method */}
      <div className="px-4 py-2 text-center border-b border-dashed border-gray-300">
        <p className="text-[10px] font-bold text-black">Payment Method</p>
        <p className="font-extrabold text-black text-[13px]">Cash</p>
      </div>

      {/* Items table */}
      <div className="px-4 py-2">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-1 font-extrabold text-black">Item</th>
              <th className="text-center py-1 font-extrabold text-black w-8">Qty</th>
              <th className="text-right py-1 font-extrabold text-black">Price</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ITEMS.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1.5 font-bold text-black">{item.name}</td>
                <td className="py-1.5 text-center font-bold text-black">{item.qty}</td>
                <td className="py-1.5 text-right font-bold text-black tabular-nums">
                  {s.currency_symbol}{(item.price * item.qty).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="px-4 py-2 space-y-1 border-t border-dashed border-gray-300">
        <div className="flex justify-between font-bold text-black">
          <span>Subtotal</span>
          <span className="tabular-nums">{s.currency_symbol}{SAMPLE_SUBTOTAL.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-red-600">
          <span>Discount</span>
          <span className="tabular-nums">-{s.currency_symbol}{SAMPLE_DISCOUNT.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-extrabold text-black text-[12px]">
          <span>Total</span>
          <span className="tabular-nums">{s.currency_symbol}{SAMPLE_TOTAL.toFixed(2)}</span>
        </div>
      </div>

      {/* Big total box */}
      <div className="mx-4 my-2 rounded-xl bg-gray-50 border border-gray-200 py-3 text-center">
        <p className="text-[10px] font-bold text-black mb-0.5">Total Amount</p>
        <p className="text-[17px] font-extrabold text-black tabular-nums">
          {s.currency_symbol}{SAMPLE_TOTAL.toFixed(2)}
        </p>
      </div>

      {/* QR */}
      {s.show_qr && (
        <div className="flex justify-center py-3 border-t border-dashed border-gray-300">
          {s.qr_url ? (
            <img src={s.qr_url} alt="QR" className="w-16 h-16 object-contain" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center">
              <QrCode className="w-8 h-8 text-gray-300" />
            </div>
          )}
        </div>
      )}

      {/* Thank you + footer */}
      <div className="px-4 pb-4 text-center border-t border-dashed border-gray-300 pt-3 space-y-1">
        {s.thank_you_msg && (
          <p className="font-extrabold text-black text-[12px]">{s.thank_you_msg}</p>
        )}
        <p className="text-[9px] font-bold text-black">Powered by ClickGroup · 07701466787</p>
      </div>
    </div>
  )
}

// ── Toggle ─────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'w-10 h-5.5 rounded-full transition-all relative shrink-0',
        value ? 'bg-amber-500' : 'bg-white/15'
      )}
      style={{ height: '22px' }}
    >
      <span className={cn(
        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
        value ? 'left-5' : 'left-0.5'
      )} />
    </button>
  )
}

// ── Field ──────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const INPUT = 'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 transition-colors'

// ── Stored Invoice type ────────────────────────────────────────
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
  customer_name: string | null
  customer_phone: string | null
  created_at: string
}

// ── All Invoices tab ───────────────────────────────────────────
function AllInvoices({ restaurantId }: { restaurantId: string }) {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()
  const [invoices, setInvoices]       = useState<StoredInvoice[]>([])
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [viewInvoice, setViewInvoice] = useState<StoredInvoice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('invoices')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    if (search.trim()) {
      const s = `%${search.trim()}%`
      query = query.or(`invoice_num.ilike.${s},customer_name.ilike.${s},customer_phone.ilike.${s}`)
    }
    if (dateFrom)       query = query.gte('created_at', `${dateFrom}T00:00:00`)
    if (dateTo)         query = query.lte('created_at', `${dateTo}T23:59:59`)

    const { data } = await query.limit(200)
    setInvoices(data ?? [])
    setLoading(false)
  }, [restaurantId, search, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when window/tab regains focus
  useEffect(() => {
    const onFocus = () => load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  return (
    <div className="space-y-4 max-w-4xl">

      {/* Search / Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-white/40 mb-1.5">Invoice Number / Customer Name / Phone</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="Search INV-…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors [color-scheme:dark]"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>

      {/* Count */}
      <p className="text-xs text-white/30">
        {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} found
      </p>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No invoices found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const date = new Date(inv.created_at)
            const isOpen = expanded === inv.id
            return (
              <div key={inv.id} className="rounded-2xl bg-white/4 border border-white/8 overflow-hidden">

                {/* Row */}
                <div
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/3 transition-colors cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : inv.id)}
                >
                  {/* Invoice # */}
                  <div className="w-28 shrink-0">
                    <p className="text-[10px] text-white/40">Invoice</p>
                    <p className="text-sm font-bold text-amber-400">{inv.invoice_num}</p>
                  </div>

                  {/* Order # */}
                  <div className="w-24 shrink-0 hidden sm:block">
                    <p className="text-[10px] text-white/40">Order</p>
                    <p className="text-sm font-semibold text-white">{inv.order_num || '—'}</p>
                  </div>

                  {/* Table */}
                  <div className="w-20 shrink-0">
                    <p className="text-[10px] text-white/40">Table</p>
                    <p className="text-sm font-semibold text-white">{inv.table_num || '—'}</p>
                  </div>

                  {/* Customer */}
                  <div className="flex-1 min-w-0 hidden md:block">
                    <p className="text-[10px] text-white/40">Customer</p>
                    <p className="text-sm font-semibold text-white truncate">{inv.customer_name || '—'}</p>
                    {inv.customer_phone && <p className="text-[10px] text-white/35">{inv.customer_phone}</p>}
                  </div>

                  {/* Cashier */}
                  <div className="w-24 shrink-0 hidden lg:block">
                    <p className="text-[10px] text-white/40">Cashier</p>
                    <p className="text-sm font-semibold text-white truncate">{inv.cashier || '—'}</p>
                  </div>

                  {/* Payment */}
                  <div className="w-24 shrink-0 hidden lg:block">
                    <p className="text-[10px] text-white/40">Payment</p>
                    <p className="text-sm font-semibold text-white">{inv.payment_method || '—'}</p>
                  </div>

                  {/* Total */}
                  <div className="w-24 shrink-0 text-right">
                    <p className="text-[10px] text-white/40">Total</p>
                    <p className="text-sm font-bold text-white tabular-nums">{formatPrice(Number(inv.total))}</p>
                  </div>

                  {/* Date */}
                  <div className="w-28 shrink-0 text-right hidden sm:block">
                    <p className="text-[10px] text-white/50">{date.toLocaleDateString()}</p>
                    <p className="text-[10px] text-white/40">
                      {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* View button */}
                  <button
                    onClick={e => { e.stopPropagation(); setViewInvoice(inv) }}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[11px] font-semibold hover:bg-amber-500/25 transition-colors"
                  >
                    View
                  </button>

                  {/* Expand icon */}
                  <div className="shrink-0 text-white/30">
                    {isOpen
                      ? <ChevronUp className="w-4 h-4" />
                      : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-white/8">
                    <table className="w-full text-sm mt-3">
                      <thead>
                        <tr className="text-white/40 text-xs border-b border-white/8">
                          <th className="text-left pb-2 font-semibold">Item</th>
                          <th className="text-center pb-2 font-semibold w-12">Qty</th>
                          <th className="text-right pb-2 font-semibold">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(inv.items ?? []).map((item, i) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="py-1.5 text-white/80">{item.name}</td>
                            <td className="py-1.5 text-center text-white/60">{item.qty}</td>
                            <td className="py-1.5 text-right text-white/80 tabular-nums">
                              {formatPrice(item.price * item.qty)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5 text-sm">
                      <div className="flex justify-between text-white/60">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{formatPrice(Number(inv.subtotal))}</span>
                      </div>
                      {Number(inv.discount) > 0 && (
                        <div className="flex justify-between text-rose-400">
                          <span>Discount</span>
                          <span className="tabular-nums">-{formatPrice(Number(inv.discount))}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-white">
                        <span>Total</span>
                        <span className="tabular-nums">{formatPrice(Number(inv.total))}</span>
                      </div>
                      {Number(inv.amount_paid) > 0 && Number(inv.amount_paid) > Number(inv.total) && (
                        <>
                          <div className="flex justify-between text-white/60">
                            <span>Paid</span>
                            <span className="tabular-nums">{formatPrice(Number(inv.amount_paid))}</span>
                          </div>
                          <div className="flex justify-between text-white/60">
                            <span>Change</span>
                            <span className="tabular-nums">{formatPrice(Number(inv.change_amount))}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Invoice view modal */}
      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          restaurantId={restaurantId}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  )
}

// ── Invoice Number Tab ─────────────────────────────────────────
type InvResetPeriod = 'never' | 'daily' | 'monthly' | 'yearly'
interface InvSettings { prefix: string; start_num: number; current_num: number; reset_period: InvResetPeriod }
const INV_DEFAULTS: InvSettings = { prefix: 'INV-', start_num: 1001, current_num: 1001, reset_period: 'never' }

function InvoiceNumberTab({ restaurantId }: { restaurantId: string }) {
  const supabase = createClient()
  const [settings, setSettings] = useState<InvSettings>(INV_DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('invoice_number_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle()
    if (err) { setError(err.message); setLoading(false); return }
    if (data) setSettings({ prefix: data.prefix, start_num: data.start_num, current_num: data.current_num, reset_period: data.reset_period })
    setLoading(false)
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('invoice_number_settings')
      .upsert({ restaurant_id: restaurantId, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'restaurant_id' })
    if (err) setError(err.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>

  const preview = `${settings.prefix}${settings.start_num}`

  return (
    <div className="max-w-lg space-y-5">
      {/* Preview */}
      <div className="p-5 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl text-center">
        <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Preview</p>
        <p className="text-4xl font-bold text-white font-mono tracking-wide">{preview}</p>
        <p className="text-xs text-white/25 mt-2">This is how invoice numbers will appear</p>
      </div>

      {/* Fields */}
      <div className="space-y-5 bg-white/5 border border-white/10 rounded-2xl p-5">
        <div>
          <label className="block text-xs text-white/50 mb-1.5 font-medium">Prefix</label>
          <input value={settings.prefix} onChange={e => setSettings(s => ({ ...s, prefix: e.target.value }))} placeholder="INV-"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors font-mono" />
          <p className="text-xs text-white/25 mt-1">e.g. INV-, #, REC-</p>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5 font-medium">Starting Number</label>
          <input type="number" min="1" value={settings.start_num}
            onChange={e => setSettings(s => ({ ...s, start_num: parseInt(e.target.value) || 1 }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors font-mono" />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5 font-medium">Current Number</label>
          <div className="px-3.5 py-2.5 bg-white/3 border border-white/8 rounded-xl text-sm text-white/40 font-mono">
            {settings.prefix}{settings.current_num} <span className="text-xs text-white/20">(read-only)</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-2 font-medium">Reset Period</label>
          <div className="grid grid-cols-4 gap-2">
            {(['never', 'daily', 'monthly', 'yearly'] as InvResetPeriod[]).map(r => (
              <button key={r} onClick={() => setSettings(s => ({ ...s, reset_period: r }))}
                className={cn('py-2 rounded-xl text-xs font-medium capitalize transition-all active:scale-95',
                  settings.reset_period === r
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-white/5 text-white/40 border border-white/8 hover:bg-white/8')}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className={cn('w-full h-12 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95',
          saved ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20')}>
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
          : <><Save className="w-4 h-4" /> Save Invoice Number Settings</>}
      </button>
    </div>
  )
}

// ── Order Number Tab ───────────────────────────────────────────
type OrdResetPeriod = 'never' | 'daily' | 'shift'
interface OrdSettings { prefix: string; start_num: number; current_num: number; reset_period: OrdResetPeriod; show_receipt: boolean; show_kds: boolean }
const ORD_DEFAULTS: OrdSettings = { prefix: 'ORD-', start_num: 1, current_num: 1, reset_period: 'daily', show_receipt: true, show_kds: true }

function OrderNumberTab({ restaurantId }: { restaurantId: string }) {
  const supabase = createClient()
  const [settings, setSettings] = useState<OrdSettings>(ORD_DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('order_number_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle()
    if (err) { setError(err.message); setLoading(false); return }
    if (data) setSettings({ prefix: data.prefix, start_num: data.start_num, current_num: data.current_num, reset_period: data.reset_period, show_receipt: data.show_receipt, show_kds: data.show_kds })
    setLoading(false)
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('order_number_settings')
      .upsert({ restaurant_id: restaurantId, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'restaurant_id' })
    if (err) setError(err.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>

  const preview = `${settings.prefix}${String(settings.start_num).padStart(3, '0')}`

  return (
    <div className="max-w-lg space-y-5">
      {/* Preview */}
      <div className="p-5 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 rounded-2xl text-center">
        <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Preview</p>
        <p className="text-4xl font-bold text-white font-mono tracking-wide">{preview}</p>
        <p className="text-xs text-white/25 mt-2">Next order will be numbered</p>
      </div>

      {/* Fields */}
      <div className="space-y-5 bg-white/5 border border-white/10 rounded-2xl p-5">
        <div>
          <label className="block text-xs text-white/50 mb-1.5 font-medium">Prefix</label>
          <input value={settings.prefix} onChange={e => setSettings(s => ({ ...s, prefix: e.target.value }))} placeholder="ORD-"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors font-mono" />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5 font-medium">Starting Number</label>
          <input type="number" min="1" value={settings.start_num}
            onChange={e => setSettings(s => ({ ...s, start_num: parseInt(e.target.value) || 1 }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors font-mono" />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5 font-medium">Current Number</label>
          <div className="px-3.5 py-2.5 bg-white/3 border border-white/8 rounded-xl text-sm text-white/40 font-mono">
            {settings.prefix}{String(settings.current_num).padStart(3, '0')} <span className="text-xs text-white/20">(read-only)</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-2 font-medium">Reset Period</label>
          <div className="grid grid-cols-3 gap-2">
            {(['never', 'daily', 'shift'] as OrdResetPeriod[]).map(r => (
              <button key={r} onClick={() => setSettings(s => ({ ...s, reset_period: r }))}
                className={cn('py-2 rounded-xl text-xs font-medium capitalize transition-all active:scale-95',
                  settings.reset_period === r
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-white/5 text-white/40 border border-white/8 hover:bg-white/8')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {([
          { k: 'show_receipt' as const, label: 'Show on Receipt' },
          { k: 'show_kds'     as const, label: 'Show on Kitchen Display (KDS)' },
        ]).map(({ k, label }) => (
          <div key={k} className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
            <span className="text-sm text-white/70">{label}</span>
            <button onClick={() => setSettings(s => ({ ...s, [k]: !s[k] }))} className="active:scale-95">
              {settings[k] ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className={cn('w-full h-12 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95',
          saved ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20')}>
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
          : <><Save className="w-4 h-4" /> Save Order Number Settings</>}
      </button>
    </div>
  )
}

// ── Recover Table tab ─────────────────────────────────────────
interface RecoveryLog {
  id: string
  invoice_num: string
  order_num: string | null
  table_num: string
  recovered_by: string
  reason: string | null
  created_at: string
}

function RecoverTableTab({ restaurantId }: { restaurantId: string }) {
  const supabase = createClient()
  const [logs, setLogs]           = useState<RecoveryLog[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [invInput, setInvInput]   = useState('')
  const [reason, setReason]       = useState('')
  const [recovering, setRecovering] = useState(false)
  const [recoverError, setRecoverError] = useState<string | null>(null)
  const [recoverSuccess, setRecoverSuccess] = useState<string | null>(null)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('table_recoveries')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
    setLogs((data ?? []) as RecoveryLog[])
    setLoading(false)
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadLogs() }, [loadLogs])

  const handleRecover = async () => {
    const inv = invInput.trim()
    if (!inv) return
    setRecovering(true); setRecoverError(null); setRecoverSuccess(null)

    // 1. Find invoice
    const { data: invoice, error: e1 } = await supabase
      .from('invoices').select('*').eq('restaurant_id', restaurantId).eq('invoice_num', inv).maybeSingle()
    if (e1 || !invoice) { setRecoverError('Invoice not found. Check the invoice number and try again.'); setRecovering(false); return }

    // 2. Find the order — try by order_num first, fallback to table_number
    let order: { id: string; order_num: string | null; status: string } | null = null
    if (invoice.order_num) {
      const { data } = await supabase
        .from('orders')
        .select('id, order_num, status')
        .eq('restaurant_id', restaurantId)
        .eq('order_num', invoice.order_num)
        .neq('status', 'active')
        .limit(1).maybeSingle()
      order = data ?? null
    }
    if (!order) {
      const { data } = await supabase
        .from('orders')
        .select('id, order_num, status')
        .eq('restaurant_id', restaurantId)
        .eq('table_number', invoice.table_num)
        .neq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1).maybeSingle()
      order = data ?? null
    }
    if (!order) { setRecoverError('Order not found or is already active. Check the invoice number.'); setRecovering(false); return }

    // 3. Reopen order
    const { error: e3 } = await supabase
      .from('orders').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', order.id)
    if (e3) { setRecoverError(`Failed to reopen order: ${e3.message}`); setRecovering(false); return }

    // 4. Reopen voided items → set back to 'sent'
    await supabase.from('order_items').update({ status: 'sent' }).eq('order_id', order.id).eq('status', 'void')

    // 5. Get current user name
    const { data: { user } } = await supabase.auth.getUser()
    const recoveredBy = user?.user_metadata?.full_name ?? user?.email ?? 'Staff'

    // 6. Log the recovery
    await supabase.from('table_recoveries').insert({
      restaurant_id: restaurantId,
      invoice_num:   inv,
      order_num:     invoice.order_num ?? order.order_num ?? null,
      table_num:     invoice.table_num,
      recovered_by:  recoveredBy,
      reason:        reason.trim() || null,
    })

    setRecoverSuccess(`Table ${invoice.table_num} recovered successfully!`)
    setInvInput(''); setReason('')
    setShowModal(false)
    loadLogs()
    setRecovering(false)
  }

  return (
    <div className="max-w-2xl space-y-4">

      {/* Header + button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Recover Table</h2>
          <p className="text-xs text-white/40 mt-0.5">Reopen a table that was closed by mistake</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setRecoverError(null); setRecoverSuccess(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all"
        >
          <RotateCcw className="w-4 h-4" /> Recover Table
        </button>
      </div>

      {recoverSuccess && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400">{recoverSuccess}</p>
        </div>
      )}

      {/* Recovery log list */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-14 text-white/25 text-sm">No recoveries yet</div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-4 p-4 bg-white/4 border border-white/8 rounded-2xl">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-amber-400">{log.invoice_num}</span>
                  {log.order_num && <span className="text-xs text-white/40">{log.order_num}</span>}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-white/50">Table {log.table_num}</span>
                </div>
                {log.reason && <p className="text-xs text-white/50 mt-1 italic">"{log.reason}"</p>}
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-white/30">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{log.recovered_by}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d1220] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-white">Recover Table</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Invoice Number *</label>
                <input
                  value={invInput}
                  onChange={e => setInvInput(e.target.value)}
                  placeholder="e.g. INV-1039"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Reason</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Why is this table being recovered?"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                />
              </div>

              {recoverError && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-400">{recoverError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button
                onClick={handleRecover}
                disabled={!invInput.trim() || recovering}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {recovering ? <><Loader2 className="w-4 h-4 animate-spin" />Recovering…</> : <><RotateCcw className="w-4 h-4" />Recover</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────
export default function ReceiptSettingsPage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const fileRef   = useRef<HTMLInputElement>(null)
  const qrFileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab]                           = useState<'invoices' | 'settings' | 'invoice-num' | 'order-num' | 'recover'>('invoices')
  const [restaurantId, setRestaurantId]         = useState<string | null>(null)
  const [restaurantName, setRestaurantName]     = useState('')
  const [form, setForm]                         = useState<RS>(DEFAULTS)
  const [loading, setLoading]                   = useState(true)
  const [saving, setSaving]                     = useState(false)
  const [uploading, setUploading]               = useState(false)
  const [uploadingQr, setUploadingQr]           = useState(false)
  const [saved, setSaved]                       = useState(false)
  const [error, setError]                       = useState<string | null>(null)
  const [uploadError, setUploadError]           = useState<string | null>(null)
  const [uploadQrError, setUploadQrError]       = useState<string | null>(null)

  const set = (key: keyof RS, val: unknown) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rest } = await supabase
      .from('restaurants').select('id, name').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
    if (!rest) { setLoading(false); return }
    setRestaurantId(rest.id)
    setRestaurantName(rest.name)

    const { data } = await supabase
      .from('receipt_settings')
      .select('*')
      .eq('restaurant_id', rest.id)
      .maybeSingle()

    if (data) {
      setForm({
        id:               data.id,
        shop_name:        data.shop_name        ?? '',
        logo_url:         data.logo_url         ?? '',
        phone:            data.phone            ?? '',
        address:          data.address          ?? '',
        thank_you_msg:    data.thank_you_msg    ?? DEFAULTS.thank_you_msg,
        currency_symbol:  data.currency_symbol  ?? '$',
        show_qr:          data.show_qr          ?? true,
        qr_url:           data.qr_url           ?? '',
        show_logo:        data.show_logo        ?? true,
        show_address:     data.show_address     ?? true,
        show_phone:       data.show_phone       ?? true,
      })
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const uploadImage = async (file: File, type: 'logo' | 'qr'): Promise<string> => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('restaurantId', restaurantId!)
    fd.append('type', type)
    const res  = await fetch('/api/upload/receipt-image', { method: 'POST', body: fd })
    const json = await res.json() as { ok: boolean; url?: string; error?: string }
    if (!json.ok) throw new Error(json.error ?? 'Upload failed')
    return json.url!
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !restaurantId) return
    setUploadError(null)
    set('logo_url', URL.createObjectURL(file))
    setUploading(true)
    try {
      const url = await uploadImage(file, 'logo')
      set('logo_url', url)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
  }

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !restaurantId) return
    setUploadQrError(null)
    set('qr_url', URL.createObjectURL(file))
    setUploadingQr(true)
    try {
      const url = await uploadImage(file, 'qr')
      set('qr_url', url)
    } catch (err: unknown) {
      setUploadQrError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploadingQr(false)
  }

  const handleSave = async () => {
    if (!restaurantId) return
    setSaving(true); setError(null)

    const payload = {
      restaurant_id:   restaurantId,
      shop_name:       form.shop_name       || null,
      logo_url:        (form.logo_url && !form.logo_url.startsWith('blob:')) ? form.logo_url : null,
      phone:           form.phone           || null,
      address:         form.address         || null,
      thank_you_msg:   form.thank_you_msg   || null,
      currency_symbol: form.currency_symbol || '$',
      show_qr:         form.show_qr,
      qr_url:          (form.qr_url && !form.qr_url.startsWith('blob:')) ? form.qr_url : null,
      show_logo:       form.show_logo,
      show_address:    form.show_address,
      show_phone:      form.show_phone,
      updated_at:      new Date().toISOString(),
    }

    const { error: err } = form.id
      ? await supabase.from('receipt_settings').update(payload).eq('id', form.id)
      : await supabase.from('receipt_settings').insert(payload)

    if (err) { setError(err.message); setSaving(false); return }

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    setSaving(false)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
    </div>
  )

  return (
    <div>

      {/* ── Tab bar ── */}
      <div className="flex flex-wrap gap-1 mb-6 p-1 rounded-2xl bg-white/4 border border-white/8 w-fit">
        {([
          { key: 'invoices',    icon: <FileText    className="w-4 h-4" />,  label: t.rec_recent },
          { key: 'settings',   icon: <Receipt     className="w-4 h-4" />,  label: t.rec_title },
          { key: 'invoice-num',icon: <FileText    className="w-4 h-4" />,  label: t.in_title },
          { key: 'order-num',  icon: <Hash        className="w-4 h-4" />,  label: t.on_title },
          { key: 'recover',    icon: <RotateCcw   className="w-4 h-4" />,  label: 'Recover Table' },
        ] as const).map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              tab === key
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                : 'text-white/50 hover:text-white/70'
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Settings tab ── */}
      {tab === 'settings' && (
        <div className="flex gap-6 items-start">

          {/* Left: Settings Form */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Branding */}
            <section className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-4">
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Branding</p>

              {/* Logo upload */}
              <div>
                <label className="block text-xs text-white/50 mb-2">{t.rec_logo}</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    {form.logo_url
                      ? <img src={form.logo_url} alt="logo" className="w-full h-full object-cover" />
                      : <ImageIcon className="w-6 h-6 text-white/20" />}
                  </div>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/8 border border-white/12 text-xs text-white/60 hover:bg-white/12 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploading ? t.saving_ : t.rec_upload_logo}
                    </button>
                    {form.logo_url && (
                      <button
                        type="button"
                        onClick={() => set('logo_url', '')}
                        className="block text-[11px] text-rose-400/60 hover:text-rose-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    {uploadError && <p className="text-[11px] text-rose-400">{uploadError}</p>}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
              </div>

              <Field label={t.rec_shop_name}>
                <input
                  value={form.shop_name}
                  onChange={e => set('shop_name', e.target.value)}
                  placeholder={restaurantName || 'Restaurant Name'}
                  className={INPUT}
                />
              </Field>

              <Field label={t.rec_currency}>
                <input
                  value={form.currency_symbol}
                  onChange={e => set('currency_symbol', e.target.value)}
                  placeholder="$"
                  className={cn(INPUT, 'max-w-[100px]')}
                />
              </Field>
            </section>

            {/* Contact */}
            <section className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-4">
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Contact Info</p>

              <Field label={t.rec_phone}>
                <input
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="+1 234 567 8900"
                  className={INPUT}
                />
              </Field>

              <Field label={t.rec_address}>
                <textarea
                  value={form.address}
                  onChange={e => set('address', e.target.value)}
                  placeholder="123 Main St, City"
                  rows={2}
                  className={cn(INPUT, 'resize-none')}
                />
              </Field>
            </section>

            {/* Content */}
            <section className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-4">
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Receipt Content</p>

              <Field label={t.rec_thank_you}>
                <input
                  value={form.thank_you_msg}
                  onChange={e => set('thank_you_msg', e.target.value)}
                  placeholder="Thank you for your visit!"
                  className={INPUT}
                />
              </Field>

              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/3 border border-white/8">
                <span className="text-xs text-white/35">Footer Note</span>
                <span className="text-xs text-white/25 italic">Powered by ClickGroup · 07701466787</span>
              </div>
            </section>

            {/* QR Code */}
            <section className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-white/40" />
                  <p className="text-xs font-bold text-white/40 uppercase tracking-widest">QR Code</p>
                </div>
                <Toggle value={form.show_qr} onChange={v => set('show_qr', v)} />
              </div>

              {form.show_qr && (
                <div>
                  <label className="block text-xs text-white/50 mb-2">QR Code Image</label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                      {form.qr_url
                        ? <img src={form.qr_url} alt="QR" className="w-full h-full object-contain" />
                        : <QrCode className="w-7 h-7 text-white/20" />}
                    </div>
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => qrFileRef.current?.click()}
                        disabled={uploadingQr}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/8 border border-white/12 text-xs text-white/60 hover:bg-white/12 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {uploadingQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {uploadingQr ? 'Uploading…' : 'Upload QR Image'}
                      </button>
                      {form.qr_url && (
                        <button
                          type="button"
                          onClick={() => set('qr_url', '')}
                          className="block text-[11px] text-rose-400/60 hover:text-rose-400 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                      {uploadQrError && <p className="text-[11px] text-rose-400">{uploadQrError}</p>}
                    </div>
                    <input ref={qrFileRef} type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                  </div>
                </div>
              )}
            </section>

            {/* Display toggles */}
            <section className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-3">
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Show / Hide</p>

              {([
                ['show_logo',    t.rec_show_logo],
                ['show_phone',   t.rec_show_phone],
                ['show_address', t.rec_show_address],
              ] as [keyof RS, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-white/70">{label}</span>
                  <Toggle value={form[key] as boolean} onChange={v => set(key, v)} />
                </div>
              ))}
            </section>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-400">{error}</p>
              </div>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="w-full h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.saving_}</>
                : saved
                  ? <><Check className="w-4 h-4" /> {t.saved_}</>
                  : <><Save className="w-4 h-4" /> {t.save_changes}</>}
            </button>
          </div>

          {/* Right: Live Preview */}
          <div className="shrink-0 sticky top-6">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-white/30" />
              <p className="text-xs font-bold text-white/30 uppercase tracking-widest">{t.rec_preview}</p>
            </div>
            <InvoicePreview s={form} restaurantName={restaurantName} />
          </div>

        </div>
      )}

      {/* ── All Invoices tab ── */}
      {tab === 'invoices' && restaurantId && (
        <AllInvoices restaurantId={restaurantId} />
      )}

      {/* ── Invoice Number tab ── */}
      {tab === 'invoice-num' && restaurantId && (
        <InvoiceNumberTab restaurantId={restaurantId} />
      )}

      {/* ── Order Number tab ── */}
      {tab === 'order-num' && restaurantId && (
        <OrderNumberTab restaurantId={restaurantId} />
      )}

      {/* ── Recover Table tab ── */}
      {tab === 'recover' && restaurantId && (
        <RecoverTableTab restaurantId={restaurantId} />
      )}

    </div>
  )
}
