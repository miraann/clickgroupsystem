'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Monitor, ArrowRight, Maximize2, LayoutDashboard } from 'lucide-react'

export default function CFDSetup() {
  const { restaurantId } = useParams<{ restaurantId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [tableNum, setTableNum] = useState('')
  const [restName, setRestName] = useState('')
  const [tables, setTables] = useState<number[]>([])

  useEffect(() => {
    const load = async () => {
      const [{ data: rest }, { data: tbls }] = await Promise.all([
        supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
        supabase.from('tables').select('table_number').eq('restaurant_id', restaurantId).order('table_number'),
      ])
      if (rest) setRestName(rest.name ?? '')
      if (tbls) setTables(tbls.map((t: { table_number: number }) => t.table_number))
    }
    load()
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to POS broadcasts — auto-navigate when staff opens payment screen
  useEffect(() => {
    const channel = supabase
      .channel(`cfd-sync-${restaurantId}`)
      .on('broadcast', { event: 'table_change' }, ({ payload }) => {
        if (payload?.table) router.push(`/cfd/${restaurantId}/${payload.table}`)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const launch = () => {
    if (!tableNum.trim()) return
    const url = `/cfd/${restaurantId}/${tableNum.trim()}`
    // Open in a new fullscreen window (customer-facing tablet)
    window.open(url, 'CFD', 'fullscreen=yes,menubar=no,toolbar=no,location=no,status=no')
  }

  return (
    <div className="min-h-screen bg-[#022658] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Icon + title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-500/10">
            <Monitor className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">Customer Facing Display</h1>
          <p className="text-white/40 text-sm">
            {restName ? `${restName} · ` : ''}Launch CFD for a table
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/4 border border-white/10 rounded-3xl p-6 space-y-5">

          {/* Table number input */}
          <div>
            <label className="block text-xs text-white/50 font-medium mb-2">Table Number · ژمارەی مێز</label>
            <input
              type="text"
              value={tableNum}
              onChange={e => setTableNum(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && launch()}
              placeholder="e.g. 5"
              className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-lg font-bold text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors text-center"
            />
          </div>

          {/* Quick select from existing tables */}
          {tables.length > 0 && (
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Quick select</p>
              <div className="flex flex-wrap gap-2">
                {tables.map(t => (
                  <button
                    key={t}
                    onClick={() => setTableNum(String(t))}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all active:scale-95 ${
                      tableNum === String(t)
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/8'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Welcome screen button */}
          <button
            onClick={() => window.open(`/cfd/${restaurantId}/idle`, 'CFD', 'fullscreen=yes,menubar=no,toolbar=no,location=no,status=no')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/6 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white font-semibold transition-all active:scale-[0.98]"
          >
            <LayoutDashboard className="w-4 h-4" />
            Show Welcome Screen
          </button>

          {/* Launch button */}
          <button
            onClick={launch}
            disabled={!tableNum.trim()}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20"
          >
            <Maximize2 className="w-4 h-4" />
            Launch CFD Display
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="text-center text-white/15 text-xs mt-5">
          Opens in a new window — place on customer-facing tablet
        </p>
      </div>
    </div>
  )
}
