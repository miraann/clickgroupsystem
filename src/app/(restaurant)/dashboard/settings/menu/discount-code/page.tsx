'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Pencil, Ticket, Check, X, Loader2, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface DiscountCode {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_order_amount: number
  max_uses: number | null
  used_count: number
  expires_at: string | null
  active: boolean
  created_at: string
}

type CodeForm = {
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_order_amount: number
  max_uses: string
  expires_at: string
  active: boolean
}

const EMPTY_FORM: CodeForm = {
  code: '',
  discount_type: 'percentage',
  discount_value: 10,
  min_order_amount: 0,
  max_uses: '',
  expires_at: '',
  active: true,
}

const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.55, ease: 'circOut' as const } },
  exit:   { opacity: 0, y: -10, transition: { duration: 0.3 } },
}
const LIST: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
}
const ITEM_VAR: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'circOut' as const } },
  show:    { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'circOut' as const } },
}

export default function DiscountCodePage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const [codes, setCodes]     = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<CodeForm>({ ...EMPTY_FORM })
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteId, setDeleteId]   = useState<string | null>(null)

  useEffect(() => {
    if (!restaurantId) { setLoading(false); return }
    supabase
      .from('discount_codes')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          // Table may not exist yet — treat as empty list so page still renders
          if (err.code === '42P01' || err.message?.includes('does not exist')) setCodes([])
          else setError(err.message)
        } else {
          setCodes((data ?? []) as DiscountCode[])
        }
        setLoading(false)
      })
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setSaveError(null)
    setShowModal(true)
  }

  const openEdit = (c: DiscountCode) => {
    setEditId(c.id)
    setForm({
      code:             c.code,
      discount_type:    c.discount_type,
      discount_value:   c.discount_value,
      min_order_amount: c.min_order_amount,
      max_uses:         c.max_uses !== null ? String(c.max_uses) : '',
      expires_at:       c.expires_at ? c.expires_at.split('T')[0] : '',
      active:           c.active,
    })
    setSaveError(null)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.code.trim() || !restaurantId) return
    setSaving(true); setSaveError(null)
    const payload = {
      restaurant_id:    restaurantId,
      code:             form.code.trim().toUpperCase(),
      discount_type:    form.discount_type,
      discount_value:   Number(form.discount_value),
      min_order_amount: Number(form.min_order_amount),
      max_uses:         form.max_uses !== '' ? Number(form.max_uses) : null,
      expires_at:       form.expires_at ? new Date(form.expires_at + 'T23:59:59').toISOString() : null,
      active:           form.active,
    }
    if (editId) {
      const { error: err } = await supabase.from('discount_codes').update(payload).eq('id', editId)
      if (err) { setSaveError(err.message); setSaving(false); return }
      setCodes(cs => cs.map(c => c.id === editId ? { ...c, ...payload } : c))
    } else {
      const { data, error: err } = await supabase
        .from('discount_codes')
        .insert({ ...payload, used_count: 0 })
        .select()
        .single()
      if (err) { setSaveError(err.message); setSaving(false); return }
      if (data) setCodes(cs => [data as DiscountCode, ...cs])
    }
    setSaving(false)
    setShowModal(false)
  }

  const toggle = async (c: DiscountCode) => {
    const newVal = !c.active
    setCodes(cs => cs.map(x => x.id === c.id ? { ...x, active: newVal } : x))
    await supabase.from('discount_codes').update({ active: newVal }).eq('id', c.id)
  }

  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id)
      setTimeout(() => setDeleteId(d => d === id ? null : d), 3000)
      return
    }
    const { error: err } = await supabase.from('discount_codes').delete().eq('id', id)
    if (!err) setCodes(cs => cs.filter(c => c.id !== id))
    setDeleteId(null)
  }

  if (!restaurantId) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-400">Restaurant not found. Please refresh the page or re-login.</p>
    </div>
  )

  if (loading) return (
    <div className="w-full flex justify-center">
      <div className="space-y-3 w-full max-w-2xl">
        {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl animate-pulse bg-white/8" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="w-full flex justify-center">
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 w-full max-w-md">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <p className="text-sm text-rose-400">{error}</p>
      </div>
    </div>
  )

  return (
    <motion.div key="discount-code-page" variants={PAGE} initial="hidden" animate="show" exit="exit" className="w-full flex flex-col items-center">
      <div className="w-full max-w-2xl">

      {/* Header */}
      <motion.div variants={ITEM_VAR} className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Ticket className="w-4 h-4 text-amber-400" /> {t.dc_title}
          </h2>
          <p className="text-xs text-white/40 mt-0.5">{t.dc_subtitle}</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-all active:scale-95 shadow-lg shadow-amber-500/25">
          <Plus className="w-4 h-4" /> {t.dc_add}
        </button>
      </motion.div>

      {/* List */}
      {codes.length === 0 ? (
        <motion.div variants={ITEM_VAR}
          className="rounded-2xl border border-white/10 bg-white/3 px-6 py-14 text-center">
          <Ticket className="w-10 h-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm font-medium">{t.dc_no_data}</p>
          <p className="text-white/25 text-xs mt-1">{t.dc_no_data_desc}</p>
        </motion.div>
      ) : (
        <motion.div variants={LIST} initial="hidden" animate="visible" className="space-y-2">
          {codes.map(c => {
            const expired = c.expires_at ? new Date(c.expires_at) < new Date() : false
            const exhausted = c.max_uses !== null && c.used_count >= c.max_uses
            return (
              <motion.div key={c.id} variants={ITEM_VAR}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 hover:bg-white/6 transition-all">

                {/* Code badge */}
                <div className={cn(
                  'shrink-0 px-2.5 py-1 rounded-lg border',
                  !c.active || expired || exhausted
                    ? 'bg-white/5 border-white/10'
                    : 'bg-amber-500/15 border-amber-500/25',
                )}>
                  <span className={cn(
                    'font-mono text-sm font-bold tracking-wider',
                    !c.active || expired || exhausted ? 'text-white/30' : 'text-amber-400',
                  )}>{c.code}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-sm font-bold',
                      c.discount_type === 'percentage' ? 'text-sky-400' : 'text-emerald-400')}>
                      {c.discount_type === 'percentage' ? `${c.discount_value}${t.dc_pct_off}` : `${c.discount_value} ${t.dc_pct_off}`}
                    </span>
                    {c.min_order_amount > 0 && (
                      <span className="text-[11px] text-white/40">· Min {c.min_order_amount}</span>
                    )}
                    {c.max_uses !== null && (
                      <span className="text-[11px] text-white/40">· {c.used_count}/{c.max_uses} {t.dc_used}</span>
                    )}
                    {c.used_count > 0 && c.max_uses === null && (
                      <span className="text-[11px] text-white/30">· {t.dc_used_times} {c.used_count}×</span>
                    )}
                    {c.expires_at && (
                      <span className={cn('text-[11px]', expired ? 'text-rose-400' : 'text-white/40')}>
                        · {expired ? t.dc_expired : t.dc_expires_label} {new Date(c.expires_at).toLocaleDateString()}
                      </span>
                    )}
                    {exhausted && <span className="text-[11px] text-rose-400">· {t.dc_limit}</span>}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => toggle(c)} className="transition-all">
                    {c.active
                      ? <ToggleRight className="w-6 h-6 text-amber-400" />
                      : <ToggleLeft  className="w-6 h-6 text-white/25" />}
                  </button>
                  <button onClick={() => openEdit(c)}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 flex items-center justify-center transition-all active:scale-90">
                    <Pencil className="w-3.5 h-3.5 text-white/50" />
                  </button>
                  <button onClick={() => handleDelete(c.id)}
                    className={cn('w-8 h-8 rounded-xl border flex items-center justify-center transition-all active:scale-90',
                      deleteId === c.id
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                        : 'bg-white/5 border-white/8 text-white/40 hover:text-rose-400')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: 'circOut' }}
              className="w-full max-w-md rounded-2xl border border-white/15 p-5 space-y-4"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 100%)',
                backdropFilter: 'blur(32px)',
              }}>

              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-amber-400" />
                  {editId ? t.dc_edit_code : t.dc_new}
                </h3>
                <button onClick={() => setShowModal(false)}
                  className="w-7 h-7 rounded-lg bg-white/6 hover:bg-white/10 flex items-center justify-center transition-all">
                  <X className="w-3.5 h-3.5 text-white/50" />
                </button>
              </div>

              {/* Code */}
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">{t.dc_code}</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. SAVE10"
                  className="w-full bg-white/6 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 font-mono tracking-widest focus:outline-none focus:border-amber-500/50 transition-all"
                />
              </div>

              {/* Discount type */}
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">{t.dc_type}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['percentage', 'fixed'] as const).map(type => (
                    <button key={type} onClick={() => setForm(f => ({ ...f, discount_type: type }))}
                      className={cn('py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95',
                        form.discount_type === type
                          ? 'border-amber-500/60 bg-amber-500/12 text-amber-400'
                          : 'border-white/10 bg-white/4 text-white/50 hover:border-white/20')}>
                      {type === 'percentage' ? t.dc_pct : t.dc_fixed}
                    </button>
                  ))}
                </div>
              </div>

              {/* Value + Min order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">
                    {form.discount_type === 'percentage' ? t.dc_value_pct : t.dc_value_fixed}
                  </label>
                  <input
                    type="number"
                    value={form.discount_value}
                    onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))}
                    min={0}
                    max={form.discount_type === 'percentage' ? 100 : undefined}
                    className="w-full bg-white/6 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">{t.dc_min_order}</label>
                  <input
                    type="number"
                    value={form.min_order_amount}
                    onChange={e => setForm(f => ({ ...f, min_order_amount: Number(e.target.value) }))}
                    min={0}
                    className="w-full bg-white/6 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>
              </div>

              {/* Max uses + Expiry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">{t.dc_max_uses}</label>
                  <input
                    type="number"
                    value={form.max_uses}
                    onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                    min={1}
                    placeholder={t.dc_unlimited}
                    className="w-full bg-white/6 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 block">{t.dc_expires}</label>
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                    className="w-full bg-white/6 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm text-white/80 font-medium">{t.active}</p>
                  <p className="text-xs text-white/30">{t.dc_active_desc}</p>
                </div>
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                  {form.active
                    ? <ToggleRight className="w-8 h-8 text-amber-400" />
                    : <ToggleLeft  className="w-8 h-8 text-white/25" />}
                </button>
              </div>

              {saveError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <p className="text-xs text-rose-400">{saveError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/4 text-white/60 text-sm font-medium hover:bg-white/8 transition-all">
                  {t.cancel}
                </button>
                <button onClick={save} disabled={!form.code.trim() || saving}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editId ? t.dc_update : t.dc_create}
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>
    </motion.div>
  )
}
