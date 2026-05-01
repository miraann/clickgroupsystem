'use client'
import { useState } from 'react'
import { X, Star, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Member } from './types'

interface Props {
  member:  Member
  onClose: () => void
  onSaved: (id: string, newPoints: number) => void
}

export function PointsModal({ member, onClose, onSaved }: Props) {
  const supabase = createClient()
  const { t } = useLanguage()

  const [adj, setAdj]       = useState('')
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)

  const adjNum  = parseInt(adj)
  const preview = !isNaN(adjNum) ? Math.max(0, member.points + adjNum) : null

  const handleSave = async () => {
    if (isNaN(adjNum)) return
    setSaving(true)
    const newPoints = Math.max(0, member.points + adjNum)
    const { error } = await supabase.from('members')
      .update({ points: newPoints, updated_at: new Date().toISOString() }).eq('id', member.id)
    setSaving(false)
    if (!error) onSaved(member.id, newPoints)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xs bg-[#0d1220]/95 border border-white/15 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Adjust Points</h2>
            <p className="text-xs text-white/40 mt-0.5">{member.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 py-4 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <Star className="w-5 h-5 text-amber-400" />
          <span className="text-2xl font-bold text-amber-400">{member.points.toLocaleString()}</span>
          <span className="text-sm text-white/40">pts</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Adjustment (+ to add, − to deduct)</label>
            <input type="number" value={adj} onChange={e => setAdj(e.target.value)} placeholder="e.g. +100 or -50"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
            {preview !== null && (
              <p className="text-xs text-white/40 mt-1">
                New total: <span className="text-amber-400 font-bold">{preview.toLocaleString()} pts</span>
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Reason (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Birthday bonus"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">{t.cancel}</button>
          <button onClick={handleSave} disabled={!adj || isNaN(adjNum) || saving}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
