'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, LayoutGrid, X, Users, Loader2, AlertCircle, QrCode, Download, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface TableGroup { id: string; name: string; color: string; sort_order: number }
interface Table {
  id: string; seq: number; table_number: string; name: string
  capacity: number; group_id: string | null; shape: 'Square' | 'Round' | 'Rectangle'
  active: boolean
}

const SHAPE_ICONS: Record<string, string> = { Square: '⬜', Round: '⭕', Rectangle: '▬' }

const EMPTY_FORM = { table_number: '', name: '', capacity: 4, group_id: '', shape: 'Square' as 'Square' | 'Round' | 'Rectangle' }

export default function TablePage() {
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [groups, setGroups]             = useState<TableGroup[]>([])
  const [tables, setTables]             = useState<Table[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editId, setEditId]             = useState<string | null>(null)
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [deleteId, setDeleteId]         = useState<string | null>(null)
  const [qrTable, setQrTable]           = useState<Table | null>(null)
  const [copied, setCopied]             = useState(false)

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    const [{ data: g }, { data: t }] = await Promise.all([
      supabase.from('table_groups').select('*').eq('restaurant_id', rest.id).order('sort_order'),
      supabase.from('tables').select('*').eq('restaurant_id', rest.id).order('seq'),
    ])
    setGroups((g ?? []) as TableGroup[])
    setTables((t ?? []) as Table[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Open add/edit ──────────────────────────────────────────
  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, group_id: groups[0]?.id ?? '' })
    setModalOpen(true)
  }

  const openEdit = (t: Table) => {
    setEditId(t.id)
    setForm({ table_number: t.table_number, name: t.name ?? '', capacity: t.capacity, group_id: t.group_id ?? '', shape: t.shape })
    setModalOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.table_number.trim() || !restaurantId) return
    setSaving(true)

    if (editId) {
      const { error } = await supabase.from('tables').update({
        table_number: form.table_number,
        name:         form.name,
        capacity:     form.capacity,
        group_id:     form.group_id || null,
        shape:        form.shape,
        updated_at:   new Date().toISOString(),
      }).eq('id', editId)
      if (!error) {
        setTables(ts => ts.map(t => t.id === editId ? { ...t, ...form, group_id: form.group_id || null } : t))
      }
    } else {
      const nextSeq = (tables.length > 0 ? Math.max(...tables.map(t => t.seq)) : 0) + 1
      const { data, error } = await supabase.from('tables').insert({
        restaurant_id: restaurantId,
        seq:          nextSeq,
        table_number: form.table_number,
        name:         form.name,
        capacity:     form.capacity,
        group_id:     form.group_id || null,
        shape:        form.shape,
        sort_order:   nextSeq,
      }).select().single()
      if (!error && data) {
        setTables(ts => [...ts, data as Table])
      }
    }
    setSaving(false)
    setModalOpen(false)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) { setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return }
    const { error } = await supabase.from('tables').delete().eq('id', id)
    if (!error) setTables(ts => ts.filter(t => t.id !== id))
    setDeleteId(null)
  }

  // ── Grouped view ───────────────────────────────────────────
  const ungrouped = tables.filter(t => !t.group_id || !groups.find(g => g.id === t.group_id))
  const grouped = [
    ...groups.map(g => ({ id: g.id, name: g.name, color: g.color, tables: tables.filter(t => t.group_id === g.id) })),
    ...(ungrouped.length > 0 ? [{ id: 'none', name: 'Ungrouped', color: '#6b7280', tables: ungrouped }] : []),
  ].filter(g => g.tables.length > 0)

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
        <p className="text-xs text-white/30 mt-1">Run <code className="text-amber-400">supabase-tables-schema.sql</code> first.</p>
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
            <LayoutGrid className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Tables</h1>
            <p className="text-xs text-white/40">Manage seating layout</p>
          </div>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50 font-medium">{tables.length}</span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 touch-manipulation transition-all"
        >
          <Plus className="w-4 h-4" /> Add Table
        </button>
      </div>

      {/* List */}
      <div className="space-y-6">
        {grouped.map(group => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
              <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{group.name}</span>
              <span className="text-xs text-white/30">({group.tables.length})</span>
            </div>
            <div className="space-y-2">
              {group.tables.map(t => (
                <div key={t.id} className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center text-base shrink-0">
                    {SHAPE_ICONS[t.shape]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{t.table_number}</span>
                      {t.name && <span className="text-xs text-white/40">{t.name}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-white/30 flex items-center gap-1"><Users className="w-3 h-3" /> {t.capacity}</span>
                      <span className="text-xs text-white/25">{t.shape}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setQrTable(t)}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-amber-500/15 flex items-center justify-center text-white/40 hover:text-amber-400 transition-all active:scale-95"
                    title="Show QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEdit(t)}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className={cn(
                      'h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium',
                      deleteId === t.id
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
                        : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400'
                    )}
                  >
                    {deleteId === t.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {tables.length === 0 && (
          <div className="text-center py-16 text-white/25 text-sm">No tables yet. Add your first table.</div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{editId ? 'Edit Table' : 'Add Table'}</h2>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Table Number *</label>
                  <input type="text" value={form.table_number} onChange={e => setForm(f => ({ ...f, table_number: e.target.value }))} placeholder="e.g. T01"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Name</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Optional"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Capacity</label>
                  <input type="number" min={1} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Group</label>
                  <select value={form.group_id} onChange={e => setForm(f => ({ ...f, group_id: e.target.value }))}
                    className="w-full bg-[#0d1220] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors">
                    <option value="">No Group</option>
                    {groups.map(g => <option key={g.id} value={g.id} className="bg-[#0d1220]">{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">Shape</label>
                <div className="flex gap-2">
                  {(['Square', 'Round', 'Rectangle'] as const).map(shape => (
                    <button key={shape} onClick={() => setForm(f => ({ ...f, shape }))}
                      className={cn('flex-1 py-2 rounded-xl text-xs font-medium transition-all active:scale-95',
                        form.shape === shape ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white/80')}>
                      {SHAPE_ICONS[shape]} {shape}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={handleSave} disabled={!form.table_number.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Save Changes' : 'Add Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── QR Code Modal ── */}
      {qrTable && (() => {
        const guestUrl = typeof window !== 'undefined'
          ? `${window.location.origin}/guest/${qrTable.id}`
          : `/guest/${qrTable.id}`
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(guestUrl)}&format=png&margin=12`
        const label = qrTable.name ? `${qrTable.table_number} · ${qrTable.name}` : qrTable.table_number

        const handleCopy = () => {
          navigator.clipboard.writeText(guestUrl)
          setCopied(true); setTimeout(() => setCopied(false), 2000)
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-xs bg-[#0d1220]/98 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Table QR Code</span>
                </div>
                <button onClick={() => setQrTable(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* QR */}
              <div className="flex flex-col items-center px-6 py-6 gap-4">
                <div className="bg-white rounded-2xl p-3 shadow-xl shadow-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrSrc} alt={`QR for ${label}`} width={200} height={200} className="block" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-white">{label}</p>
                  <p className="text-xs text-white/35 mt-0.5">Scan to view digital menu</p>
                </div>

                {/* URL */}
                <div className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
                  <span className="text-[10px] text-white/30 flex-1 truncate font-mono">{guestUrl}</span>
                  <button onClick={handleCopy} className="shrink-0 text-white/40 hover:text-amber-400 transition-colors active:scale-95">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2 w-full">
                  <a href={qrSrc} download={`table-${qrTable.table_number}-qr.png`} target="_blank" rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-all active:scale-95">
                    <Download className="w-4 h-4" /> Download
                  </a>
                  <a href={guestUrl} target="_blank" rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                    Preview
                  </a>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
