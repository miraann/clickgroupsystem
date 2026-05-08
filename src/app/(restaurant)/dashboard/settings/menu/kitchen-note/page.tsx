'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ChefHat, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useKitchenNotes, type CachedKNote } from '@/hooks/useKitchenNotes'
import { motion, type Variants } from 'framer-motion'

type KNote = CachedKNote

const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.55, ease: 'circOut' as const } },
  exit:   { opacity: 0, y: -10, transition: { duration: 0.3 } },
}
const LIST: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const ITEM_VAR: Variants = {
  hidden:  { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'circOut' as const } },
}

export default function KitchenNotePage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('restaurant_id') : null
  )

  const { data: swrNotes, error: swrError, mutate } = useKitchenNotes(restaurantId)

  const notes = swrNotes ?? []
  const error = swrError ? (swrError as Error).message : null

  const [newText, setNewText]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── Add ────────────────────────────────────────────────────
  const add = async () => {
    if (!newText.trim() || !restaurantId) return
    setAdding(true)
    const nextOrder = notes.length > 0 ? Math.max(...notes.map(n => n.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('kitchen_notes')
      .insert({ restaurant_id: restaurantId, text: newText.trim(), active: true, sort_order: nextOrder })
      .select().single()
    if (!error && data) mutate([...notes, data as KNote], false)
    setNewText('')
    setAdding(false)
  }

  // ── Toggle ─────────────────────────────────────────────────
  const toggle = async (n: KNote) => {
    const newVal = !n.active
    mutate(notes.map(x => x.id === n.id ? { ...x, active: newVal } : x), false)
    await supabase.from('kitchen_notes').update({ active: newVal }).eq('id', n.id)
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deleteId !== id) {
      setDeleteId(id); setTimeout(() => setDeleteId(d => d === id ? null : d), 3000); return
    }
    const { error } = await supabase.from('kitchen_notes').delete().eq('id', id)
    if (!error) mutate(notes.filter(n => n.id !== id), false)
    setDeleteId(null)
  }

  // ── Render ─────────────────────────────────────────────────
  if (error) return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 max-w-md">
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-rose-400 font-semibold">Failed to load</p>
        <p className="text-xs text-white/40 mt-1 font-mono">{error}</p>
        <p className="text-xs text-white/30 mt-1">Run <code className="text-amber-400">supabase-menu-schema.sql</code> first.</p>
        <button onClick={() => mutate()} className="mt-2 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <motion.div key="menu-kitchen-note-page" variants={PAGE} initial="hidden" animate="show" exit="exit" className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <ChefHat className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.kn_title}</h1>
          <p className="text-xs text-white/40">{t.kn_subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{notes.length}</span>
      </div>

      {/* Add row */}
      <div className="flex gap-2 mb-5">
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={t.kn_name}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
        />
        <button
          onClick={add}
          disabled={!newText.trim() || adding}
          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium rounded-xl active:scale-95 transition-all flex items-center gap-1.5"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t.kn_add}
        </button>
      </div>

      <motion.div variants={LIST} initial="hidden" animate="visible" className="space-y-2">
        {notes.map(n => (
          <motion.div
            key={n.id}
            variants={ITEM_VAR}
            className={cn('flex items-center gap-3 px-4 py-3 bg-white/5 border rounded-2xl transition-all',
              n.active ? 'border-white/10' : 'border-white/5 opacity-50')}
          >
            <p className={cn('flex-1 text-sm', n.active ? 'text-white' : 'text-white/40')}>{n.text}</p>
            <button onClick={() => toggle(n)} className="active:scale-95 shrink-0">
              {n.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
            </button>
            <button
              onClick={() => handleDelete(n.id)}
              className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                deleteId === n.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}
            >
              {deleteId === n.id ? t.delete : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </motion.div>
        ))}
        {notes.length === 0 && <div className="text-center py-12 text-white/25 text-sm">{t.kn_no_data}</div>}
      </motion.div>
    </motion.div>
  )
}
