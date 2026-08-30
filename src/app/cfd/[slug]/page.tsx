'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Monitor, ArrowRight, Maximize2, LayoutDashboard, MonitorCheck, MonitorOff } from 'lucide-react'
import { useWakeLock } from '@/hooks/useWakeLock'

const KEEP_AWAKE_KEY = 'cfd_keep_awake'

// The [slug] segment may be a menu_slug or a restaurant UUID.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function CFDSetup() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string>('')
  const [tableNum, setTableNum] = useState('')
  const [restName, setRestName] = useState('')
  const [tables, setTables] = useState<number[]>([])

  // Keep the display awake — defaults ON, persisted for the CFD screens + the
  // native shell to read. Toggle it off only if the tablet should sleep.
  const [keepAwake, setKeepAwake] = useState(true)
  useEffect(() => { setKeepAwake(localStorage.getItem(KEEP_AWAKE_KEY) !== '0') }, [])
  const toggleKeepAwake = () => {
    setKeepAwake(v => {
      const next = !v
      localStorage.setItem(KEEP_AWAKE_KEY, next ? '1' : '0')
      return next
    })
  }
  useWakeLock(keepAwake)

  // Resolve slug → real UUID, then load restaurant + tables
  useEffect(() => {
    if (!slug) return
    const load = async () => {
      const { data: slugRow } = await supabase.from('restaurant_public')
        .select('id, name')
        .eq(UUID_RE.test(slug) ? 'id' : 'menu_slug', slug)
        .maybeSingle()
      if (!slugRow) return
      setRestaurantId(slugRow.id)
      setRestName(slugRow.name ?? '')
      const { data: tbls } = await supabase.from('tables').select('table_number').eq('restaurant_id', slugRow.id).order('table_number')
      if (tbls) setTables(tbls.map((t: { table_number: number }) => t.table_number))
    }
    load()
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to POS broadcasts — auto-navigate when staff opens payment screen
  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase
      .channel(`cfd-sync-${restaurantId}`)
      .on('broadcast', { event: 'table_change' }, ({ payload }) => {
        if (payload?.table) router.push(`/cfd/${slug}/${payload.table}`)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const launch = () => {
    if (!tableNum.trim()) return
    const url = `/cfd/${slug}/${tableNum.trim()}`
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
            onClick={() => window.open(`/cfd/${slug}/idle`, 'CFD', 'fullscreen=yes,menubar=no,toolbar=no,location=no,status=no')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/6 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white font-semibold transition-all active:scale-[0.98]"
          >
            <LayoutDashboard className="w-4 h-4" />
            Show Welcome Screen
          </button>

          {/* Keep screen awake toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={keepAwake}
            onClick={toggleKeepAwake}
            className={`w-full flex items-center gap-3 py-3 px-4 rounded-2xl border transition-all active:scale-[0.98] ${
              keepAwake
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-200'
                : 'bg-white/5 border-white/10 text-white/45'
            }`}
          >
            {keepAwake ? <MonitorCheck className="w-4 h-4 shrink-0" /> : <MonitorOff className="w-4 h-4 shrink-0" />}
            <span className="flex-1 text-left text-sm font-semibold leading-tight">
              Keep screen awake
              <span className="block text-[11px] font-normal opacity-60">
                {keepAwake ? "Display won't sleep · شاشە ناخەوێت" : 'Display may sleep · شاشە دەخەوێت'}
              </span>
            </span>
            <span className={`w-9 h-5 rounded-full p-0.5 shrink-0 transition-colors ${keepAwake ? 'bg-blue-500' : 'bg-white/15'}`}>
              <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${keepAwake ? 'translate-x-4' : 'translate-x-0'}`} />
            </span>
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
