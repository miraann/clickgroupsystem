'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Sliders, X, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'

interface ModOption { id: string; name: string; price: number; sort_order: number }
interface Modifier {
  id: string
  name: string
  required: boolean
  min_select: number
  max_select: number
  sort_order: number
  modifier_options: ModOption[]
}

const EMPTY_FORM = { name: '', required: false, min_select: 0, max_select: 1 }

export default function ModifierPage() {
  const supabase = createClient()
  const { formatPrice } = useDefaultCurrency()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [mods, setMods]                 = useState<Modifier[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const [modal, setModal]               = useState(false)
  const [editId, setEditId]             = useState<string | null>(null)
  const [form, setForm]                 = useState(EMPTY_FORM)
  // Options edited in-modal (not yet saved)
  const [draftOptions, setDraftOptions] = useState<ModOption[]>([])
  const [newOpt, setNewOpt]             = useState({ name: '', price: 0 })
  const [saving, setSaving]             = useState(false)
  const [deleteId, setDeleteId]         = useState<string | null>(null)

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    const { data, error: err } = await supabase
      .from('menu_modifiers')
      .select('*, modifier_options(*)') // nested select
      .eq('restaurant_id', rest.id)
      .order('sort_order')
      .order('sort_order', { referencedTable: 'modifier_options' })

    if (err) { setError(err.message); setLoading(false); return }
    setMods((data ?? []) as Modifier[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setDraftOptions([])
    setNewOpt({ name: '', price: 0 })
    setModal(true)
  }

  const openEdit = (m: Modifier) => {
    setEditId(m.id)
    setForm({ name: m.name, required: m.required, min_select: m.min_select, max_select: m.max_select })
    setDraftOptions([...m.modifier_options])
    setNewOpt({ name: '', price: 0 })
    setModal(true)
  }

  // ── Add option to draft ────────────────────────────────────
  const addDraftOption = () => {
    if (!newOpt.name.trim()) return
    setDraftOptions(os => [...os, { id: `new-${Date.now()}`, name: newOpt.name, price: newOpt.price, sort_order: os.length }])
    setNewOpt({ name: '', price: 0 })
  }

  // ── Save modifier + options ────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)

    if (editId) {
      // Update modifier
      await supabase.from('menu_modifiers').update({
        name: form.name, required: form.required,
        min_select: form.min_select, max_select: form.max_select,
        updated_at: new Date().toISOString(),
      }).eq('id', editId)

      // Delete all old options, re-insert
      await supabase.from('modifier_options').delete().eq('modifier_id', editId)
      if (draftOptions.length > 0) {
        await supabase.from('modifier_options').insert(
          draftOptions.map((o, i) => ({ modifier_id: editId, name: o.name, price: o.price, sort_order: i }))
        )
      }
    } else {
      const nextOrder = mods.length > 0 ? Math.max(...mods.map(m => m.sort_order)) + 1 : 0
      const { data: newMod, error } = await supabase
        .from('menu_modifiers')
        .insert({ restaurant_id: restaurantId, name: form.name, required: form.required, min_select: form.min_select, max_select: form.max_select, sort_order: nextOrder })
        .select().single()

      if (!error && newMod && draftOptions.length > 0) {
        await supabase.from('modifier_options').insert(
          draftOptions.map((o, i) => ({ modifier_id: newMod.id, name: o.name, price: o.price, sort_order: i }))
        )
      }
    }

    setSaving(false)
    setModal(false)
    load() // reload to get fresh data with options
  }

  // ── Delete modifier ────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id)
      setTimeout(() => setDeleteId(d => d === id ? null : d), 3000)
      return
    }
    // modifier_options cascade on delete
    const { error } = await supabase.from('menu_modifiers').delete().eq('id', id)
    if (!error) setMods(ms => ms.filter(m => m.id !== id))
    setDeleteId(null)
  }

  // ── Render ─────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
    </div>
  )

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
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Sliders className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Modifiers</h1>
            <p className="text-xs text-white/40">Item options and add-ons</p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{mods.length}</span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Modifier
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {mods.map(m => (
          <div key={m.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white">{m.name}</p>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', m.required ? 'bg-rose-500/15 text-rose-400' : 'bg-white/8 text-white/40')}>
                    {m.required ? 'Required' : 'Optional'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/40">
                    Pick {m.min_select}–{m.max_select}
                  </span>
                </div>
              </div>
              <button
                onClick={() => openEdit(m)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(m.id)}
                className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium',
                  deleteId === m.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}
              >
                {deleteId === m.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {m.modifier_options.map(o => (
                <span key={o.id} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-xs text-white/60">
                  {o.name}{o.price > 0 && <span className="text-amber-400 ml-1">+{formatPrice(Number(o.price))}</span>}
                </span>
              ))}
              {m.modifier_options.length === 0 && <span className="text-xs text-white/25">No options</span>}
            </div>
          </div>
        ))}
        {mods.length === 0 && <div className="text-center py-16 text-white/25 text-sm">No modifiers yet.</div>}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? 'Edit Modifier' : 'Add Modifier'}</h2>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Size"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">Required</span>
                <button onClick={() => setForm(f => ({ ...f, required: !f.required }))} className="active:scale-95">
                  {form.required ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Min Select</label>
                  <input type="number" min="0"
                    value={form.min_select}
                    onChange={e => setForm(f => ({ ...f, min_select: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Max Select</label>
                  <input type="number" min="1"
                    value={form.max_select}
                    onChange={e => setForm(f => ({ ...f, max_select: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Options */}
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">Options</label>
                <div className="space-y-2 mb-3">
                  {draftOptions.map((o, idx) => (
                    <div key={o.id} className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl">
                      <span className="flex-1 text-sm text-white">{o.name}</span>
                      {o.price > 0 && <span className="text-xs text-amber-400">+{formatPrice(Number(o.price))}</span>}
                      <button
                        onClick={() => setDraftOptions(os => os.filter((_, i) => i !== idx))}
                        className="w-5 h-5 rounded flex items-center justify-center text-white/30 hover:text-rose-400 transition-colors active:scale-95"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {draftOptions.length === 0 && <p className="text-xs text-white/25 py-1">No options added yet.</p>}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newOpt.name}
                    onChange={e => setNewOpt(n => ({ ...n, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addDraftOption()}
                    placeholder="Option name"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  <input
                    type="number" min="0" step="0.25"
                    value={newOpt.price}
                    onChange={e => setNewOpt(n => ({ ...n, price: parseFloat(e.target.value) || 0 }))}
                    placeholder="+$"
                    className="w-16 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  <button
                    onClick={addDraftOption}
                    className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 rounded-xl text-sm transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Save Changes' : 'Add Modifier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
