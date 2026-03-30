'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Gift, X, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Combo {
  id: string
  name: string
  description: string
  buy_qty: number
  get_qty: number
  discount_pct: number
  active: boolean
  sort_order: number
}

const EMPTY_FORM = { name: '', description: '', buy_qty: 2, get_qty: 1, discount_pct: 100, active: true }

export default function ComboDiscountPage() {
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [combos, setCombos]             = useState<Combo[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const [modal, setModal]               = useState(false)
  const [editId, setEditId]             = useState<string | null>(null)
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [deleteId, setDeleteId]         = useState<string | null>(null)

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    const { data, error: err } = await supabase
      .from('combo_discounts')
      .select('*')
      .eq('restaurant_id', rest.id)
      .order('sort_order')

    if (err) { setError(err.message); setLoading(false); return }
    setCombos((data ?? []) as Combo[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setModal(true) }
  const openEdit = (c: Combo) => {
    setEditId(c.id)
    setForm({ name: c.name, description: c.description ?? '', buy_qty: c.buy_qty, get_qty: c.get_qty, discount_pct: c.discount_pct, active: c.active })
    setModal(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)
    const payload = { name: form.name, description: form.description, buy_qty: form.buy_qty, get_qty: form.get_qty, discount_pct: form.discount_pct, active: form.active, updated_at: new Date().toISOString() }

    if (editId) {
      const { error } = await supabase.from('combo_discounts').update(payload).eq('id', editId)
      if (!error) setCombos(cs => cs.map(c => c.id === editId ? { ...c, ...payload } : c))
    } else {
      const nextOrder = combos.length > 0 ? Math.max(...combos.map(c => c.sort_order)) + 1 : 0
      const { data, error } = await supabase
        .from('combo_discounts')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
        .select().single()
      if (!error && data) setCombos(cs => [...cs, data as Combo])
    }
    setSaving(false)
    setModal(false)
  }

  // ── Toggle active ──────────────────────────────────────────
  const toggleActive = async (c: Combo) => {
    const newVal = !c.active
    setCombos(cs => cs.map(x => x.id === c.id ? { ...x, active: newVal } : x))
    await supabase.from('combo_discounts').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', c.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return
    }
    const { error } = await supabase.from('combo_discounts').delete().eq('id', id)
    if (!error) setCombos(cs => cs.filter(c => c.id !== id))
    setDeleteId(null)
  }

  // ── Render ─────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>

  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Run <code className="text-amber-400">supabase-menu-schema.sql</code> first.</p>
        <button onClick={load} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <Gift className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Combo Discounts</h1>
            <p className="text-xs text-white/40">Buy X get Y promotions</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{combos.length}</span>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
          <Plus className="w-4 h-4" /> Add Combo
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {combos.map(c => (
          <div key={c.id} className={cn('p-4 bg-white/5 border rounded-2xl transition-all', c.active ? 'border-white/10' : 'border-white/5 opacity-60')}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{c.name}</p>
                {c.description && <p className="text-xs text-white/40 mt-0.5">{c.description}</p>}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400">Buy {c.buy_qty}</span>
                  {c.get_qty > 0 && <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">Get {c.get_qty} free</span>}
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-400">{c.discount_pct}% off</span>
                </div>
              </div>
              <button onClick={() => toggleActive(c)} className="active:scale-95 shrink-0">
                {c.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
              </button>
              <button onClick={() => openEdit(c)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(c.id)} className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                deleteId === c.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                {deleteId === c.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ))}
        {combos.length === 0 && <div className="text-center py-16 text-white/25 text-sm">No combo discounts yet.</div>}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? 'Edit Combo' : 'Add Combo Discount'}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Buy 2 Get 1 Free"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {([{ k: 'buy_qty', label: 'Buy Qty' }, { k: 'get_qty', label: 'Get Qty' }, { k: 'discount_pct', label: 'Discount %' }] as const).map(({ k, label }) => (
                  <div key={k}>
                    <label className="block text-xs text-white/50 mb-1.5 font-medium">{label}</label>
                    <input type="number" min="0" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">Active</span>
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))} className="active:scale-95">
                  {form.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
              <button onClick={handleSave} disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Save Changes' : 'Add Combo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
