'use client'
import { useState } from 'react'
import { useDeliverySettings, type CachedDeliveryZone, type ZoneDraft } from '@/hooks/useDeliverySettings'
import { Plus, Trash2, MapPin, Loader2, Hexagon, Circle, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ShapeMode = 'radius' | 'polygon'

const EMPTY_DRAFT: ZoneDraft = {
  name: '', area: null, delivery_fee: 0, min_order: 0, estimated_time: 30,
  active: true, sort_order: 0, center_lat: null, center_lng: null, radius_meters: 1500, polygon: null,
}

const inputCls = 'px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent text-sm'

function polygonToJsonText(polygon: { lat: number; lng: number }[] | null | undefined): string {
  if (!polygon || polygon.length === 0) return ''
  return JSON.stringify(polygon, null, 2)
}

/**
 * Drop into dashboard/settings/delivery/page.tsx (e.g. as a new tab/section).
 * Supports both zone shapes the matcher understands (zoneCalculator.ts /
 * fn_match_delivery_zone): a circular radius around a center point, or an
 * arbitrary polygon of {lat,lng} vertices for irregular delivery areas.
 * Only one shape is stored per zone — switching modes clears the other.
 */
export default function DeliveryZoneManager({ restaurantId }: { restaurantId: string | null }) {
  const { data, isLoading, addZone, updateZone, deleteZone, toggleZone } = useDeliverySettings(restaurantId)
  const [draft, setDraft]     = useState<ZoneDraft>(EMPTY_DRAFT)
  const [shape, setShape]     = useState<ShapeMode>('radius')
  const [polyText, setPolyText] = useState('')
  const [polyError, setPolyError] = useState<string | null>(null)
  const [adding, setAdding]   = useState(false)
  const [busyId, setBusyId]   = useState<string | null>(null)

  const zones = data?.zones ?? []

  function resetDraft() {
    setDraft(EMPTY_DRAFT)
    setPolyText('')
    setPolyError(null)
    setShape('radius')
  }

  // ── Polygon vertex helpers ───────────────────────────────────
  function addVertexRow() {
    const current = draft.polygon ?? []
    const next = [...current, { lat: 0, lng: 0 }]
    setDraft(d => ({ ...d, polygon: next }))
    setPolyText(polygonToJsonText(next))
  }

  function updateVertex(i: number, key: 'lat' | 'lng', value: number) {
    const current = [...(draft.polygon ?? [])]
    current[i] = { ...current[i], [key]: value }
    setDraft(d => ({ ...d, polygon: current }))
    setPolyText(polygonToJsonText(current))
  }

  function removeVertex(i: number) {
    const current = (draft.polygon ?? []).filter((_, idx) => idx !== i)
    setDraft(d => ({ ...d, polygon: current }))
    setPolyText(polygonToJsonText(current))
  }

  // Paste/edit raw GeoJSON-style [{lat,lng}, ...] directly
  function applyPolyText(text: string) {
    setPolyText(text)
    if (!text.trim()) { setDraft(d => ({ ...d, polygon: null })); setPolyError(null); return }
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed) || !parsed.every(p => typeof p?.lat === 'number' && typeof p?.lng === 'number')) {
        throw new Error('Expected an array of {"lat": number, "lng": number}')
      }
      if (parsed.length > 0 && parsed.length < 3) {
        setPolyError('A polygon needs at least 3 vertices')
      } else {
        setPolyError(null)
      }
      setDraft(d => ({ ...d, polygon: parsed }))
    } catch (e) {
      setPolyError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  async function handleAdd() {
    if (!draft.name.trim()) return
    if (shape === 'polygon' && (!draft.polygon || draft.polygon.length < 3)) {
      setPolyError('A polygon needs at least 3 vertices'); return
    }
    setAdding(true)
    try {
      const payload: ZoneDraft = shape === 'radius'
        ? { ...draft, polygon: null }
        : { ...draft, center_lat: null, center_lng: null, radius_meters: null }
      await addZone({ ...payload, sort_order: zones.length })
      resetDraft()
    } finally { setAdding(false) }
  }

  async function handleDelete(id: string) {
    setBusyId(id)
    try { await deleteZone(id) } finally { setBusyId(null) }
  }

  async function handleToggle(z: CachedDeliveryZone) {
    setBusyId(z.id)
    try { await toggleZone(z.id, !z.active) } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4" /> Delivery Zones</h3>
        <p className="text-xs text-gray-500 mt-1">
          Zones override the default fee/minimum/ETA for customers whose pinned location falls inside them.
          Matching happens automatically at checkout (polygon zones take priority over radius zones when both match).
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <div className="space-y-2">
          {zones.map(z => {
            const isPolygon = !!z.polygon && z.polygon.length >= 3
            return (
              <div key={z.id} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/10 px-3 py-2">
                <button
                  onClick={() => handleToggle(z)}
                  disabled={busyId === z.id}
                  className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${z.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/15'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${z.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {isPolygon ? <Hexagon className="w-3.5 h-3.5 text-violet-400 shrink-0" /> : <Circle className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                    {z.name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Fee {z.delivery_fee} · Min {z.min_order} · ~{z.estimated_time}min
                    {isPolygon
                      ? ` · polygon (${z.polygon!.length} pts)`
                      : z.radius_meters ? ` · ${(z.radius_meters / 1000).toFixed(1)}km radius` : ''}
                  </p>
                </div>
                <button onClick={() => handleDelete(z.id)} disabled={busyId === z.id} className="text-rose-500 hover:text-rose-600 p-1.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
          {zones.length === 0 && <p className="text-xs text-gray-400">No zones yet — falls back to the general settings above.</p>}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/15 p-3 space-y-3">
        <input placeholder="Zone name" value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          className={cn(inputCls, 'w-full')} />

        {/* Shape mode toggle */}
        <div className="flex gap-1.5 rounded-lg bg-gray-100 dark:bg-white/5 p-1 w-fit">
          <button
            onClick={() => setShape('radius')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
              shape === 'radius' ? 'bg-white dark:bg-white/15 shadow-sm' : 'text-gray-500')}
          >
            <Circle className="w-3.5 h-3.5" /> Radius
          </button>
          <button
            onClick={() => setShape('polygon')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
              shape === 'polygon' ? 'bg-white dark:bg-white/15 shadow-sm' : 'text-gray-500')}
          >
            <Hexagon className="w-3.5 h-3.5" /> Polygon
          </button>
        </div>

        {shape === 'radius' ? (
          <div className="grid grid-cols-3 gap-2">
            <input type="number" placeholder="Center lat" value={draft.center_lat ?? ''}
              onChange={e => setDraft(d => ({ ...d, center_lat: e.target.value ? parseFloat(e.target.value) : null }))}
              className={inputCls} />
            <input type="number" placeholder="Center lng" value={draft.center_lng ?? ''}
              onChange={e => setDraft(d => ({ ...d, center_lng: e.target.value ? parseFloat(e.target.value) : null }))}
              className={inputCls} />
            <input type="number" placeholder="Radius (m)" value={draft.radius_meters ?? ''}
              onChange={e => setDraft(d => ({ ...d, radius_meters: e.target.value ? parseFloat(e.target.value) : null }))}
              className={inputCls} />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Vertex row editor */}
            <div className="space-y-1.5">
              {(draft.polygon ?? []).map((pt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400 w-4 shrink-0">{i + 1}</span>
                  <input type="number" placeholder="lat" value={pt.lat}
                    onChange={e => updateVertex(i, 'lat', parseFloat(e.target.value) || 0)}
                    className={cn(inputCls, 'flex-1')} />
                  <input type="number" placeholder="lng" value={pt.lng}
                    onChange={e => updateVertex(i, 'lng', parseFloat(e.target.value) || 0)}
                    className={cn(inputCls, 'flex-1')} />
                  <button onClick={() => removeVertex(i)} className="text-rose-500 p-1 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addVertexRow}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
            >
              <Plus className="w-3.5 h-3.5" /> Add vertex
            </button>

            {/* Raw JSON editor — round-trips with the row editor above */}
            <div>
              <label className="text-[11px] text-gray-500">Or paste GeoJSON-style vertices</label>
              <textarea
                value={polyText}
                onChange={e => applyPolyText(e.target.value)}
                rows={4}
                placeholder='[{"lat": 33.315, "lng": 44.366}, {"lat": 33.320, "lng": 44.370}, {"lat": 33.310, "lng": 44.372}]'
                className={cn(inputCls, 'w-full resize-none font-mono text-[11px]')}
              />
              {polyError && (
                <p className="text-[11px] text-rose-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {polyError}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <input type="number" placeholder="Fee" value={draft.delivery_fee}
            onChange={e => setDraft(d => ({ ...d, delivery_fee: parseFloat(e.target.value) || 0 }))}
            className={inputCls} />
          <input type="number" placeholder="Min order" value={draft.min_order}
            onChange={e => setDraft(d => ({ ...d, min_order: parseFloat(e.target.value) || 0 }))}
            className={inputCls} />
          <input type="number" placeholder="ETA (min)" value={draft.estimated_time}
            onChange={e => setDraft(d => ({ ...d, estimated_time: parseFloat(e.target.value) || 0 }))}
            className={inputCls} />
        </div>

        <button
          onClick={handleAdd}
          disabled={adding || !draft.name.trim() || !!polyError}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Zone
        </button>
      </div>
    </div>
  )
}
