'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { AnimatedList, AnimatedItem } from '@/components/ui/AnimatedList'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  Plus, Pencil, Trash2, CreditCard, X,
  ToggleLeft, ToggleRight, Star, Loader2, AlertCircle,
  Coins,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePaymentMethods, type CachedPayMethod, type CachedCurrency } from '@/hooks/usePaymentMethods'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ──────────────────────────────────────────────────────
type IconType = 'cash' | 'card' | 'online' | 'wallet' | 'other'
type PayMethod = CachedPayMethod & { icon_type: IconType }
type Currency  = CachedCurrency

// ── Constants ──────────────────────────────────────────────────
const ICONS: { value: IconType; labelKey: 'pm_cash' | 'pm_card' | 'pm_online' | string; emoji: string }[] = [
  { value: 'cash',   labelKey: 'pm_cash',   emoji: '💵' },
  { value: 'card',   labelKey: 'pm_card',   emoji: '💳' },
  { value: 'online', labelKey: 'pm_online', emoji: '🌐' },
  { value: 'wallet', labelKey: 'wallet',    emoji: '👛' },
  { value: 'other',  labelKey: 'other',     emoji: '🏦' },
]

const DECIMAL_OPTIONS = [
  { value: 0, label: '0', example: '1,000' },
  { value: 2, label: '2', example: '1,000.00' },
  { value: 3, label: '3', example: '1,000.000' },
]

const PRESET_CURRENCIES = [
  { name: 'US Dollar',       symbol: '$',   decimal_places: 2 },
  { name: 'Iraqi Dinar',     symbol: 'IQD', decimal_places: 0 },
  { name: 'Euro',            symbol: '€',   decimal_places: 2 },
  { name: 'British Pound',   symbol: '£',   decimal_places: 2 },
  { name: 'Turkish Lira',    symbol: '₺',   decimal_places: 2 },
  { name: 'Saudi Riyal',     symbol: 'SAR', decimal_places: 2 },
]

const EMPTY_PAY  = { name: '', icon_type: 'cash' as IconType, active: true, is_default: false }
const EMPTY_CUR  = { name: '', symbol: '', decimal_places: 2, is_default: false }

function getEmoji(type: IconType) { return ICONS.find(i => i.value === type)?.emoji ?? '💳' }

function FadeSwitch({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// ── Main Page ──────────────────────────────────────────────────
export default function PaymentMethodPage() {
  const { t } = useLanguage()
  const supabase = createClient()

  const [tab, setTab]                   = useState<'currency' | 'payment'>('currency')
  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrData, isLoading: loading, error: swrError, mutate } = usePaymentMethods(restaurantId)
  const error   = swrError ? (swrError as Error).message : null

  // Payment methods state
  const [methods, setMethods]         = useState<PayMethod[]>([])
  const [payModal, setPayModal]       = useState(false)
  const [editPayId, setEditPayId]     = useState<string | null>(null)
  const [payForm, setPayForm]         = useState(EMPTY_PAY)
  const [paySaving, setPaySaving]     = useState(false)
  const [deletePayId, setDeletePayId] = useState<string | null>(null)

  // Currency state
  const [currencies, setCurrencies]   = useState<Currency[]>([])
  const [curModal, setCurModal]       = useState(false)
  const [editCurId, setEditCurId]     = useState<string | null>(null)
  const [curForm, setCurForm]         = useState(EMPTY_CUR)
  const [curSaving, setCurSaving]     = useState(false)
  const [deleteCurId, setDeleteCurId] = useState<string | null>(null)

  // Sync local state from SWR cache
  useEffect(() => {
    if (!swrData) return
    setMethods(swrData.methods as PayMethod[])
    setCurrencies(swrData.currencies)
  }, [swrData])

  // ── Currency CRUD ──────────────────────────────────────────
  const openAddCur = () => { setEditCurId(null); setCurForm(EMPTY_CUR); setCurModal(true) }
  const openEditCur = (c: Currency) => {
    setEditCurId(c.id)
    setCurForm({ name: c.name, symbol: c.symbol, decimal_places: c.decimal_places, is_default: c.is_default })
    setCurModal(true)
  }

  const applyPreset = (p: typeof PRESET_CURRENCIES[0]) => {
    setCurForm(f => ({ ...f, name: p.name, symbol: p.symbol, decimal_places: p.decimal_places }))
  }

  const saveCurrency = async () => {
    if (!curForm.name.trim() || !curForm.symbol.trim() || !restaurantId) return
    setCurSaving(true)

    if (curForm.is_default) {
      await supabase.from('currencies').update({ is_default: false, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId)
    }

    const payload = {
      name: curForm.name.trim(),
      symbol: curForm.symbol.trim(),
      decimal_places: curForm.decimal_places,
      is_default: curForm.is_default,
      updated_at: new Date().toISOString(),
    }

    if (editCurId) {
      const { error: err } = await supabase.from('currencies').update(payload).eq('id', editCurId)
      if (!err) {
        const updated = currencies.map(c => {
          if (c.id === editCurId) return { ...c, ...payload }
          if (curForm.is_default) return { ...c, is_default: false }
          return c
        })
        setCurrencies(updated)
        mutate(prev => prev ? { ...prev, currencies: updated } : prev, false)
      }
    } else {
      const nextOrder = currencies.length > 0 ? Math.max(...currencies.map(c => c.sort_order)) + 1 : 0
      const { data, error: err } = await supabase
        .from('currencies')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select().single()
      if (!err && data) {
        const updated = [
          ...currencies.map(c => curForm.is_default ? { ...c, is_default: false } : c),
          data as Currency,
        ]
        setCurrencies(updated)
        mutate(prev => prev ? { ...prev, currencies: updated } : prev, false)
      }
    }

    setCurSaving(false)
    setCurModal(false)
  }

  const setDefaultCurrency = async (c: Currency) => {
    if (!restaurantId) return
    await supabase.from('currencies').update({ is_default: false, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId)
    await supabase.from('currencies').update({ is_default: true, updated_at: new Date().toISOString() }).eq('id', c.id)
    const updated = currencies.map(x => ({ ...x, is_default: x.id === c.id }))
    setCurrencies(updated)
    mutate(prev => prev ? { ...prev, currencies: updated } : prev, false)
  }

  const deleteCurrency = async (id: string) => {
    if (deleteCurId !== id) {
      setDeleteCurId(id); setTimeout(() => setDeleteCurId(d => d === id ? null : d), 3000); return
    }
    const { error: err } = await supabase.from('currencies').delete().eq('id', id)
    if (!err) {
      const updated = currencies.filter(c => c.id !== id)
      setCurrencies(updated)
      mutate(prev => prev ? { ...prev, currencies: updated } : prev, false)
    }
    setDeleteCurId(null)
  }

  // ── Payment Method CRUD ────────────────────────────────────
  const openAddPay = () => { setEditPayId(null); setPayForm(EMPTY_PAY); setPayModal(true) }
  const openEditPay = (m: PayMethod) => {
    setEditPayId(m.id)
    setPayForm({ name: m.name, icon_type: m.icon_type, active: m.active, is_default: m.is_default })
    setPayModal(true)
  }

  const savePay = async () => {
    if (!payForm.name.trim() || !restaurantId) return
    setPaySaving(true)

    if (payForm.is_default) {
      await supabase.from('payment_methods').update({ is_default: false, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId)
    }

    const payload = { name: payForm.name, icon_type: payForm.icon_type, active: payForm.active, is_default: payForm.is_default, updated_at: new Date().toISOString() }

    if (editPayId) {
      const { error: err } = await supabase.from('payment_methods').update(payload).eq('id', editPayId)
      if (!err) {
        const updated = methods.map(m => {
          if (m.id === editPayId) return { ...m, ...payload }
          if (payForm.is_default) return { ...m, is_default: false }
          return m
        })
        setMethods(updated)
        mutate(prev => prev ? { ...prev, methods: updated } : prev, false)
      }
    } else {
      const nextOrder = methods.length > 0 ? Math.max(...methods.map(m => m.sort_order)) + 1 : 0
      const { data, error: err } = await supabase
        .from('payment_methods')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select().single()
      if (!err && data) {
        const updated = [
          ...methods.map(m => payForm.is_default ? { ...m, is_default: false } : m),
          data as PayMethod,
        ]
        setMethods(updated)
        mutate(prev => prev ? { ...prev, methods: updated } : prev, false)
      }
    }

    setPaySaving(false)
    setPayModal(false)
  }

  const setDefaultPay = async (m: PayMethod) => {
    if (!restaurantId) return
    await supabase.from('payment_methods').update({ is_default: false, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId)
    await supabase.from('payment_methods').update({ is_default: true, updated_at: new Date().toISOString() }).eq('id', m.id)
    const updated = methods.map(x => ({ ...x, is_default: x.id === m.id }))
    setMethods(updated)
    mutate(prev => prev ? { ...prev, methods: updated } : prev, false)
  }

  const toggleActive = async (m: PayMethod) => {
    const newVal = !m.active
    const updated = methods.map(x => x.id === m.id ? { ...x, active: newVal } : x)
    setMethods(updated)
    mutate(prev => prev ? { ...prev, methods: updated } : prev, false)
    await supabase.from('payment_methods').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', m.id)
  }

  const deletePay = async (id: string) => {
    if (deletePayId !== id) {
      setDeletePayId(id); setTimeout(() => setDeletePayId(d => d === id ? null : d), 3000); return
    }
    const { error: err } = await supabase.from('payment_methods').delete().eq('id', id)
    if (!err) {
      const updated = methods.filter(m => m.id !== id)
      setMethods(updated)
      mutate(prev => prev ? { ...prev, methods: updated } : prev, false)
    }
    setDeletePayId(null)
  }

  // ── Render ─────────────────────────────────────────────────
  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <button onClick={() => mutate()} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto">

      {/* FadeSwitch: skeleton ↔ real content */}
      <FadeSwitch id={loading ? 'skel' : 'data'}>
        {loading ? (
          <SkeletonList rows={4} />
        ) : (<>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl bg-white/4 border border-white/8 w-fit">
        {([
          { key: 'currency', icon: <Coins className="w-4 h-4" />,     label: 'Currency' },
          { key: 'payment',  icon: <CreditCard className="w-4 h-4" />, label: 'Payment Methods' },
        ] as const).map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              tab === key ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-white/50 hover:text-white/70')}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Currency tab ── */}
      {tab === 'currency' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Coins className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Currencies</h1>
                <p className="text-xs text-white/40">Supported currencies and formats</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{currencies.length}</span>
            </div>
            <button onClick={openAddCur}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
              <Plus className="w-4 h-4" /> Add Currency
            </button>
          </div>

          <AnimatedList className="space-y-2">
            {currencies.map(c => (
              <AnimatedItem key={c.id} className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl">
                {/* Symbol badge */}
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <span className="text-base font-extrabold text-amber-400">{c.symbol}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    {c.is_default && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400">
                        <Star className="w-2.5 h-2.5" />Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/35 mt-0.5">
                    {c.decimal_places} decimal place{c.decimal_places !== 1 ? 's' : ''} · e.g. {c.symbol}{(1234).toFixed(c.decimal_places)}
                  </p>
                </div>

                {!c.is_default && (
                  <button onClick={() => setDefaultCurrency(c)}
                    className="text-xs text-white/30 hover:text-amber-400 px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-all active:scale-95 shrink-0">
                    Set default
                  </button>
                )}
                <button onClick={() => openEditCur(c)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteCurrency(c.id)}
                  className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                    deleteCurId === c.id
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
                      : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                  {deleteCurId === c.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </AnimatedItem>
            ))}
            {currencies.length === 0 && (
              <div className="text-center py-16 text-white/25 text-sm">No currencies yet. Add one above.</div>
            )}
          </AnimatedList>
        </div>
      )}

      {/* ── Payment Methods tab ── */}
      {tab === 'payment' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">{t.pm_title}</h1>
                <p className="text-xs text-white/40">{t.pm_subtitle}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{methods.length}</span>
            </div>
            <button onClick={openAddPay}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
              <Plus className="w-4 h-4" /> {t.pm_add}
            </button>
          </div>

          <AnimatedList className="space-y-2">
            {methods.map(m => (
              <AnimatedItem key={m.id} className={cn('flex items-center gap-3 p-4 bg-white/5 border rounded-2xl transition-all', m.active ? 'border-white/10' : 'border-white/5 opacity-60')}>
                <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-xl shrink-0">
                  {getEmoji(m.icon_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{m.name}</p>
                    {m.is_default && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400">
                        <Star className="w-2.5 h-2.5" />Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/35 capitalize mt-0.5">{m.icon_type}</p>
                </div>
                {!m.is_default && (
                  <button onClick={() => setDefaultPay(m)}
                    className="text-xs text-white/30 hover:text-amber-400 px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-all active:scale-95 shrink-0">
                    Set default
                  </button>
                )}
                <button onClick={() => toggleActive(m)} className="active:scale-95 shrink-0">
                  {m.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
                <button onClick={() => openEditPay(m)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deletePay(m.id)}
                  className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                    deletePayId === m.id
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
                      : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                  {deletePayId === m.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </AnimatedItem>
            ))}
            {methods.length === 0 && <div className="text-center py-16 text-white/25 text-sm">{t.pm_no_data}</div>}
          </AnimatedList>
        </div>
      )}

      {/* ── Currency Modal ── */}
      {curModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editCurId ? 'Edit Currency' : 'Add Currency'}</h2>
              <button onClick={() => setCurModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Presets */}
              {!editCurId && (
                <div>
                  <label className="block text-xs text-white/50 mb-2 font-medium">Quick Presets</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESET_CURRENCIES.map(p => (
                      <button key={p.symbol} onClick={() => applyPreset(p)}
                        className={cn(
                          'py-2 px-3 rounded-xl text-xs font-medium text-left transition-all active:scale-95 border',
                          curForm.symbol === p.symbol
                            ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/8'
                        )}>
                        <span className="font-bold">{p.symbol}</span>
                        <span className="block text-white/30 text-[10px] truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Currency Name *</label>
                <input value={curForm.name} onChange={e => setCurForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Iraqi Dinar"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Symbol *</label>
                <input value={curForm.symbol} onChange={e => setCurForm(f => ({ ...f, symbol: e.target.value }))}
                  placeholder="e.g. IQD or $"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors font-mono" />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">Decimal Places</label>
                <div className="grid grid-cols-3 gap-2">
                  {DECIMAL_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setCurForm(f => ({ ...f, decimal_places: opt.value }))}
                      className={cn('py-2.5 rounded-xl text-xs font-medium transition-all active:scale-95 border',
                        curForm.decimal_places === opt.value
                          ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/8')}>
                      <span className="block font-bold text-sm">{opt.label}</span>
                      <span className="block text-white/30 text-[10px] mt-0.5">{curForm.symbol || '$'}{(1234).toFixed(opt.value)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">Set as Default</span>
                <button onClick={() => setCurForm(f => ({ ...f, is_default: !f.is_default }))} className="active:scale-95">
                  {curForm.is_default ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setCurModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={saveCurrency} disabled={!curForm.name.trim() || !curForm.symbol.trim() || curSaving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {curSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editCurId ? 'Save Changes' : 'Add Currency'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Method Modal ── */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editPayId ? t.edit : t.pm_add}</h2>
              <button onClick={() => setPayModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.pm_name} *</label>
                <input value={payForm.name} onChange={e => setPayForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Cash"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">{t.pm_type}</label>
                <div className="grid grid-cols-5 gap-2">
                  {ICONS.map(ic => (
                    <button key={ic.value} onClick={() => setPayForm(f => ({ ...f, icon_type: ic.value }))}
                      className={cn('flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95',
                        payForm.icon_type === ic.value ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-white/5 border border-white/10 hover:bg-white/8')}>
                      <span className="text-xl">{ic.emoji}</span>
                      <span className={cn('text-[10px]', payForm.icon_type === ic.value ? 'text-amber-400' : 'text-white/40')}>{ic.emoji}</span>
                    </button>
                  ))}
                </div>
              </div>

              {([{ k: 'active', label: 'Active' }, { k: 'is_default', label: 'Set as Default' }] as const).map(({ k, label }) => (
                <div key={k} className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                  <span className="text-sm text-white/70">{label}</span>
                  <button onClick={() => setPayForm(f => ({ ...f, [k]: !f[k] }))} className="active:scale-95">
                    {payForm[k] ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setPayModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={savePay} disabled={!payForm.name.trim() || paySaving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {paySaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editPayId ? 'Save Changes' : 'Add Method'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>)}
      </FadeSwitch>
    </div>
  )
}
