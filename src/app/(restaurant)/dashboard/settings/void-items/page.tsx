'use client'
import { useState, useEffect, useCallback } from 'react'
import { Ban, AlertCircle, Search, Calendar, ChevronDown } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { createClient } from '@/lib/supabase/client'

interface VoidItem {
  id: string
  item_name: string
  item_price: number
  qty: number
  void_reason: string | null
  voided_by: string | null
  created_at: string
  orders: { table_number: number } | null
}

type DateFilter = 'today' | '7d' | '30d' | 'all'

export default function VoidItemsPage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [items, setItems]               = useState<VoidItem[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [dateFilter, setDateFilter]     = useState<DateFilter>('today')

  const load = useCallback(async () => {
    setLoading(true); setError(null)

    const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
    if (!rest) { setError('Restaurant not found'); setLoading(false); return }
    setRestaurantId(rest.id)

    // Build date range
    let fromDate: string | null = null
    const now = new Date()
    if (dateFilter === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0)
      fromDate = start.toISOString()
    } else if (dateFilter === '7d') {
      const start = new Date(now); start.setDate(start.getDate() - 7)
      fromDate = start.toISOString()
    } else if (dateFilter === '30d') {
      const start = new Date(now); start.setDate(start.getDate() - 30)
      fromDate = start.toISOString()
    }

    let query = supabase
      .from('order_items')
      .select('id, item_name, item_price, qty, void_reason, voided_by, created_at, orders!inner(table_number, restaurant_id)')
      .eq('status', 'void')
      .eq('orders.restaurant_id', rest.id)
      .order('created_at', { ascending: false })

    if (fromDate) query = query.gte('created_at', fromDate)

    const { data, error: err } = await query
    if (err) { setError(err.message); setLoading(false); return }

    setItems((data ?? []) as unknown as VoidItem[])
    setLoading(false)
  }, [dateFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i =>
    !search || i.item_name.toLowerCase().includes(search.toLowerCase()) ||
    (i.void_reason ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.voided_by ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalLost = filtered.reduce((s, i) => s + i.item_price * i.qty, 0)

  const DATE_OPTS: { label: string; value: DateFilter }[] = [
    { label: 'Today', value: 'today' },
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'All time', value: 'all' },
  ]

  if (loading) return <SkeletonList rows={4} />

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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center">
          <Ban className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{t.vi_title}</h1>
          <p className="text-xs text-white/40">{t.vi_subtitle}</p>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Date filter */}
        <div className="flex rounded-xl bg-white/5 border border-white/8 p-0.5 gap-0.5">
          {DATE_OPTS.map(o => (
            <button key={o.value} onClick={() => setDateFilter(o.value)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                dateFilter === o.value ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-white/40 hover:text-white/70')}>
              {o.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t.search}…`}
            className="w-full bg-white/5 border border-white/8 rounded-xl pl-9 pr-3.5 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40 transition-colors" />
        </div>
      </div>

      {/* Summary strip */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-rose-500/8 border border-rose-500/15 mb-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-white/35">Voided items</p>
              <p className="text-lg font-bold text-white">{filtered.reduce((s, i) => s + i.qty, 0)}</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div>
              <p className="text-xs text-white/35">Value voided</p>
              <p className="text-lg font-bold text-rose-400">${totalLost.toFixed(2)}</p>
            </div>
          </div>
          <span className="text-xs text-white/25">{filtered.length} records</span>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
            <Ban className="w-6 h-6 text-white/15" />
          </div>
          <p className="text-sm text-white/25">{search ? 'No matching void items' : t.vi_no_data}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="flex items-start gap-4 px-4 py-3.5 bg-white/4 border border-white/8 rounded-2xl hover:border-white/12 transition-all">
              {/* Red dot */}
              <div className="mt-1.5 w-2 h-2 rounded-full bg-rose-500/60 shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-white">{item.item_name}</p>
                  {item.orders?.table_number && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/40">
                      Table {item.orders.table_number}
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/40">×{item.qty}</span>
                </div>
                {item.void_reason ? (
                  <p className="text-xs text-rose-400/70 mt-0.5">{t.vi_reason}: {item.void_reason}</p>
                ) : (
                  <p className="text-xs text-white/20 mt-0.5 italic">No reason recorded</p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <p className="text-[11px] text-white/25">
                    {new Date(item.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  <span className="text-white/15">·</span>
                  <span className="text-[11px] text-white/35 font-medium">{item.voided_by ?? 'Staff'}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-rose-400/80">${(item.item_price * item.qty).toFixed(2)}</p>
                <p className="text-xs text-white/30">${item.item_price.toFixed(2)} each</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
