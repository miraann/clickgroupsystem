'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Layers, X, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface TableGroup { id: string; name: string; color: string; sort_order: number }

const COLOR_PRESETS = [
  { value: '#f59e0b', label: 'Amber' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#f97316', label: 'Orange' },
]

const EMPTY_FORM = { name: '', color: '#f59e0b' }

export default function TableGroupPage() {
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [groups, setGroups]             = useState<TableGroup[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const [modalOpen, setModalOpen]       = useState(false)
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
      .from('table_groups')
      .select('*')
      .eq('restaurant_id', rest.id)
      .order('sort_order')

    if (err) { setError(err.message); setLoading(false); return }
    setGroups((data ?? []) as TableGroup[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (g: TableGroup) => {
    setEditId(g.id)
    setForm({ name: g.name, color: g.color })
    setModalOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !restaurantId) return
    setSaving(true)

    if (editId) {
      const { error } = await supabase
        .from('table_groups')
        .update({ name: form.name, color: form.color })
        .eq('id', editId)
      if (!error) {
        setGroups(gs => gs.map(g => g.id === editId ? { ...g, name: form.name, color: form.color } : g))
      }
    } else {
      const nextOrder = groups.length > 0 ? Math.max(...groups.map(g => g.sort_order)) + 1 : 0
      const { data, error } = await supabase
        .from('table_groups')
        .insert({ restaurant_id: restaurantId, name: form.name, color: form.color, sort_order: nextOrder })
        .select()
        .single()
      if (!error && data) {
        setGroups(gs => [...gs, data as TableGroup])
      }
    }

    setSaving(false)
    setModalOpen(false)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id)
      setTimeout(() => setDeleteId(d => d === id ? null : d), 3000)
      return
    }
    const { error } = await supabase.from('table_groups').delete().eq('id', id)
    if (!error) setGroups(gs => gs.filter(g => g.id !== id))
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
            <Layers className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Table Groups</h1>
            <p className="text-xs text-white/40">Organize tables into zones</p>
          </div>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50 font-medium">{groups.length}</span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 touch-manipulation transition-all"
        >
          <Plus className="w-4 h-4" /> Add Group
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.id} className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
            <div
              className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
              style={{ backgroundColor: g.color + '22', border: `1.5px solid ${g.color}44` }}
            >
              <Layers className="w-5 h-5" style={{ color: g.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{g.name}</p>
            </div>
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
            <button
              onClick={() => openEdit(g)}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDelete(g.id)}
              className={cn(
                'h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium',
                deleteId === g.id
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
                  : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400'
              )}
            >
              {deleteId === g.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="text-center py-16 text-white/25 text-sm">No table groups yet. Add your first group.</div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? 'Edit Group' : 'Add Group'}</h2>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Ground Floor"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={cn(
                        'w-8 h-8 rounded-full transition-all active:scale-95',
                        form.color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d1220] scale-110' : ''
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Save Changes' : 'Add Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
