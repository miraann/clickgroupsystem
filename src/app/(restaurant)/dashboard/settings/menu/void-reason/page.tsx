'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Trash2, XCircle, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface VoidReason { id: string; text: string; active: boolean; sort_order: number }

export default function VoidReasonPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [reasons, setReasons]           = useState<VoidReason[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [newText, setNewText]           = useState('')
  const [adding, setAdding]             = useState(false)
  const [deleteId, setDeleteId]         = useState<string | null>(null)

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    const { data, error: err } = await supabase
      .from('void_reasons')
      .select('*')
      .eq('restaurant_id', rest.id)
      .order('sort_order')

    if (err) { setError(err.message); setLoading(false); return }
    setReasons((data ?? []) as VoidReason[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Add ────────────────────────────────────────────────────
  const add = async () => {
    if (!newText.trim() || !restaurantId) return
    setAdding(true)
    const nextOrder = reasons.length > 0 ? Math.max(...reasons.map(r => r.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('void_reasons')
      .insert({ restaurant_id: restaurantId, text: newText.trim(), active: true, sort_order: nextOrder })
      .select().single()
    if (!error && data) setReasons(rs => [...rs, data as VoidReason])
    setNewText('')
    setAdding(false)
  }

  // ── Toggle ─────────────────────────────────────────────────
  const toggle = async (r: VoidReason) => {
    const newVal = !r.active
    setReasons(rs => rs.map(x => x.id === r.id ? { ...x, active: newVal } : x))
    await supabase.from('void_reasons').update({ active: newVal }).eq('id', r.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return
    }
    const { error } = await supabase.from('void_reasons').delete().eq('id', id)
    if (!error) setReasons(rs => rs.filter(r => r.id !== id))
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
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center">
          <XCircle className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.vr_title}</h1>
          <p className="text-xs text-white/40">{t.vr_subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{reasons.length}</span>
      </div>

      {/* Add row */}
      <div className="flex gap-2 mb-5">
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Type a void reason and press Enter..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
        />
        <button
          onClick={add}
          disabled={!newText.trim() || adding}
          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium rounded-xl active:scale-95 transition-all flex items-center gap-1.5"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t.vr_add}
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {reasons.map(r => (
          <div
            key={r.id}
            className={cn('flex items-center gap-3 px-4 py-3 bg-white/5 border rounded-2xl transition-all',
              r.active ? 'border-white/10' : 'border-white/5 opacity-50')}
          >
            <p className={cn('flex-1 text-sm', r.active ? 'text-white' : 'text-white/40')}>{r.text}</p>
            <button onClick={() => toggle(r)} className="active:scale-95 shrink-0">
              {r.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
            </button>
            <button
              onClick={() => handleDelete(r.id)}
              className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                deleteId === r.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}
            >
              {deleteId === r.id ? t.confirm : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}
        {reasons.length === 0 && <div className="text-center py-12 text-white/25 text-sm">{t.vr_no_data}</div>}
      </div>
    </div>
  )
}
