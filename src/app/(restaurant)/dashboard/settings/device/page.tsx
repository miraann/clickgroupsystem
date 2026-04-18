'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  Monitor, MonitorCheck, Plus, Pencil, Trash2,
  X, Loader2, ToggleLeft, ToggleRight, Check,
  ChefHat, Tag, Printer, Wifi, Bluetooth, Cable,
  Usb, Receipt, UtensilsCrossed, Tag as LabelIcon,
  Wine, Activity, AlertCircle, CheckCircle2, WifiOff, Ruler,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────
interface KdsStation {
  id: string
  name: string
  color: string
  active: boolean
  sort_order: number
  category_ids: string[]
}

interface Category {
  id: string
  name: string
  color: string
}

type PrinterPurpose = 'receipt' | 'kitchen' | 'label' | 'bar'
type ConnectionType = 'ip' | 'bluetooth' | 'usb'

interface PrinterDevice {
  id: string
  name: string
  purpose: PrinterPurpose
  connection_type: ConnectionType
  ip_address: string | null
  port: number | null
  bt_address: string | null
  usb_path: string | null
  paper_width: number | null
  active: boolean
  sort_order: number
}

// ── Constants ──────────────────────────────────────────────────
const COLOR_PRESETS = [
  '#f59e0b', '#ef4444', '#10b981', '#3b82f6',
  '#8b5cf6', '#ec4899', '#f97316', '#14b8a6',
]

const EMPTY_KDS_FORM = { name: '', color: '#f59e0b', active: true, category_ids: [] as string[] }

const PAPER_WIDTHS = [
  { mm: 48,  label: '48 mm',  desc: 'Mini' },
  { mm: 58,  label: '58 mm',  desc: 'Small' },
  { mm: 72,  label: '72 mm',  desc: 'Medium' },
  { mm: 80,  label: '80 mm',  desc: 'Standard' },
  { mm: 104, label: '104 mm', desc: 'Wide' },
  { mm: 112, label: '112 mm', desc: 'Extra Wide' },
]

const EMPTY_PRINTER_FORM = {
  name: '',
  purpose: 'receipt' as PrinterPurpose,
  connection_type: 'ip' as ConnectionType,
  ip_address: '',
  port: 9100,
  bt_address: '',
  usb_path: '',
  paper_width: 80,
  active: true,
}

const PURPOSE_OPTIONS: { value: PrinterPurpose; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'receipt',  label: 'Receipt / Cashier', icon: <Receipt className="w-4 h-4" />,          color: '#10b981' },
  { value: 'kitchen',  label: 'Kitchen / Order',   icon: <UtensilsCrossed className="w-4 h-4" />,   color: '#f59e0b' },
  { value: 'label',    label: 'Label Printer',      icon: <LabelIcon className="w-4 h-4" />,          color: '#3b82f6' },
  { value: 'bar',      label: 'Bar / Drinks',       icon: <Wine className="w-4 h-4" />,               color: '#8b5cf6' },
]

const CONNECTION_OPTIONS: { value: ConnectionType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'ip',        label: 'IP / Network',  icon: <Wifi      className="w-4 h-4" />, desc: 'Connect via IP address over LAN/WiFi' },
  { value: 'bluetooth', label: 'Bluetooth',      icon: <Bluetooth className="w-4 h-4" />, desc: 'Pair via Bluetooth' },
  { value: 'usb',       label: 'USB / Serial',   icon: <Usb       className="w-4 h-4" />, desc: 'Connect via USB or serial cable' },
]

function purposeInfo(p: PrinterPurpose) {
  return PURPOSE_OPTIONS.find(o => o.value === p) ?? PURPOSE_OPTIONS[0]
}
function connInfo(c: ConnectionType) {
  return CONNECTION_OPTIONS.find(o => o.value === c) ?? CONNECTION_OPTIONS[0]
}

// ── Main Page ──────────────────────────────────────────────────
export default function DevicePage() {
  const supabase = createClient()
  const { t } = useLanguage()

  const [tab, setTab] = useState<'kds' | 'printers' | 'other'>('kds')
  const [restaurantId, setRestaurantId] = useState<string | null>(null)

  // KDS state
  const [stations, setStations]       = useState<KdsStation[]>([])
  const [categories, setCategories]   = useState<Category[]>([])
  const [kdsLoading, setKdsLoading]   = useState(true)
  const [kdsError, setKdsError]       = useState<string | null>(null)
  const [kdsModal, setKdsModal]       = useState(false)
  const [kdsEditId, setKdsEditId]     = useState<string | null>(null)
  const [kdsForm, setKdsForm]         = useState(EMPTY_KDS_FORM)
  const [kdsSaving, setKdsSaving]     = useState(false)
  const [kdsDeleteId, setKdsDeleteId] = useState<string | null>(null)

  // Printer state
  const [printers, setPrinters]           = useState<PrinterDevice[]>([])
  const [prtLoading, setPrtLoading]       = useState(true)
  const [prtError, setPrtError]           = useState<string | null>(null)
  const [prtModal, setPrtModal]           = useState(false)
  const [prtEditId, setPrtEditId]         = useState<string | null>(null)
  const [prtForm, setPrtForm]             = useState(EMPTY_PRINTER_FORM)
  const [prtSaving, setPrtSaving]         = useState(false)
  const [prtDeleteId, setPrtDeleteId]     = useState<string | null>(null)

  // Test connection state: id → { status, message }
  const [testResults, setTestResults] = useState<Record<string, { status: 'testing' | 'ok' | 'fail'; message?: string }>>({})

  // ── Load KDS ──────────────────────────────────────────────
  const loadKds = useCallback(async (restId: string) => {
    setKdsLoading(true); setKdsError(null)
    const [{ data: sts }, { data: cats }, { data: assignments }] = await Promise.all([
      supabase.from('kds_stations').select('*').eq('restaurant_id', restId).order('sort_order'),
      supabase.from('menu_categories').select('id, name, color').eq('restaurant_id', restId).eq('active', true).order('sort_order'),
      supabase.from('kds_station_categories').select('station_id, category_id'),
    ])
    const assignMap = new Map<string, string[]>()
    for (const a of (assignments ?? [])) {
      const arr = assignMap.get(a.station_id) ?? []
      arr.push(a.category_id)
      assignMap.set(a.station_id, arr)
    }
    setStations((sts ?? []).map(s => ({ ...s, category_ids: assignMap.get(s.id) ?? [] })))
    setCategories((cats ?? []) as Category[])
    setKdsLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load Printers ─────────────────────────────────────────
  const loadPrinters = useCallback(async (restId: string) => {
    setPrtLoading(true); setPrtError(null)
    const { data, error } = await supabase
      .from('printers')
      .select('*')
      .eq('restaurant_id', restId)
      .order('sort_order')
    if (error) { setPrtError(error.message); setPrtLoading(false); return }
    setPrinters((data ?? []) as PrinterDevice[])
    setPrtLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: rest } = await supabase.from('restaurants').select('id').eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '').maybeSingle()
      if (!rest) { setKdsError('Restaurant not found'); setKdsLoading(false); setPrtLoading(false); return }
      setRestaurantId(rest.id)
      await Promise.all([loadKds(rest.id), loadPrinters(rest.id)])
    }
    init()
  }, [loadKds, loadPrinters]) // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════════════════
  // KDS handlers
  // ══════════════════════════════════════════════════════════
  const openKdsAdd = () => { setKdsEditId(null); setKdsForm(EMPTY_KDS_FORM); setKdsModal(true) }
  const openKdsEdit = (s: KdsStation) => {
    setKdsEditId(s.id)
    setKdsForm({ name: s.name, color: s.color, active: s.active, category_ids: [...s.category_ids] })
    setKdsModal(true)
  }
  const toggleCategory = (catId: string) => {
    setKdsForm(f => ({
      ...f,
      category_ids: f.category_ids.includes(catId)
        ? f.category_ids.filter(id => id !== catId)
        : [...f.category_ids, catId],
    }))
  }
  const handleKdsSave = async () => {
    if (!kdsForm.name.trim() || !restaurantId) return
    setKdsSaving(true)
    const payload = { name: kdsForm.name.trim(), color: kdsForm.color, active: kdsForm.active, updated_at: new Date().toISOString() }
    let stationId = kdsEditId
    if (kdsEditId) {
      await supabase.from('kds_stations').update(payload).eq('id', kdsEditId)
    } else {
      const nextOrder = stations.length > 0 ? Math.max(...stations.map(s => s.sort_order)) + 1 : 0
      const { data } = await supabase.from('kds_stations')
        .insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder }).select('id').single()
      stationId = data?.id ?? null
    }
    if (stationId) {
      await supabase.from('kds_station_categories').delete().eq('station_id', stationId)
      if (kdsForm.category_ids.length > 0) {
        await supabase.from('kds_station_categories').insert(
          kdsForm.category_ids.map(category_id => ({ station_id: stationId!, category_id }))
        )
      }
    }
    setKdsSaving(false); setKdsModal(false)
    if (restaurantId) loadKds(restaurantId)
  }
  const toggleKdsActive = async (s: KdsStation) => {
    const newVal = !s.active
    setStations(ss => ss.map(x => x.id === s.id ? { ...x, active: newVal } : x))
    await supabase.from('kds_stations').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', s.id)
  }
  const handleKdsDelete = async (id: string) => {
    if (kdsDeleteId !== id) {
      setKdsDeleteId(id)
      setTimeout(() => setKdsDeleteId(d => d === id ? null : d), 3000)
      return
    }
    await supabase.from('kds_stations').delete().eq('id', id)
    setStations(ss => ss.filter(s => s.id !== id))
    setKdsDeleteId(null)
  }

  // ══════════════════════════════════════════════════════════
  // Printer handlers
  // ══════════════════════════════════════════════════════════
  const openPrtAdd = () => { setPrtEditId(null); setPrtForm(EMPTY_PRINTER_FORM); setPrtModal(true) }
  const openPrtEdit = (p: PrinterDevice) => {
    setPrtEditId(p.id)
    setPrtForm({
      name:            p.name,
      purpose:         p.purpose,
      connection_type: p.connection_type,
      ip_address:      p.ip_address ?? '',
      port:            p.port ?? 9100,
      bt_address:      p.bt_address ?? '',
      usb_path:        p.usb_path ?? '',
      paper_width:     p.paper_width ?? 80,
      active:          p.active,
    })
    setPrtModal(true)
  }
  const handlePrtSave = async () => {
    if (!prtForm.name.trim() || !restaurantId) return
    setPrtSaving(true)
    const payload = {
      name:            prtForm.name.trim(),
      purpose:         prtForm.purpose,
      connection_type: prtForm.connection_type,
      ip_address:      prtForm.connection_type === 'ip'        ? (prtForm.ip_address || null)  : null,
      port:            prtForm.connection_type === 'ip'        ? (prtForm.port || 9100)         : null,
      bt_address:      prtForm.connection_type === 'bluetooth' ? (prtForm.bt_address || null)   : null,
      usb_path:        prtForm.connection_type === 'usb'       ? (prtForm.usb_path || null)     : null,
      paper_width:     prtForm.paper_width || 80,
      active:          prtForm.active,
      updated_at:      new Date().toISOString(),
    }
    if (prtEditId) {
      await supabase.from('printers').update(payload).eq('id', prtEditId)
    } else {
      const nextOrder = printers.length > 0 ? Math.max(...printers.map(p => p.sort_order)) + 1 : 0
      await supabase.from('printers').insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
    }
    setPrtSaving(false); setPrtModal(false)
    if (restaurantId) loadPrinters(restaurantId)
  }
  const togglePrtActive = async (p: PrinterDevice) => {
    const newVal = !p.active
    setPrinters(ps => ps.map(x => x.id === p.id ? { ...x, active: newVal } : x))
    await supabase.from('printers').update({ active: newVal, updated_at: new Date().toISOString() }).eq('id', p.id)
  }
  const handlePrtDelete = async (id: string) => {
    if (prtDeleteId !== id) {
      setPrtDeleteId(id)
      setTimeout(() => setPrtDeleteId(d => d === id ? null : d), 3000)
      return
    }
    await supabase.from('printers').delete().eq('id', id)
    setPrinters(ps => ps.filter(p => p.id !== id))
    setPrtDeleteId(null)
  }

  // ── Test printer connection ────────────────────────────────
  const testPrinter = async (p: PrinterDevice) => {
    setTestResults(prev => ({ ...prev, [p.id]: { status: 'testing' } }))

    if (p.connection_type === 'ip') {
      try {
        const res = await fetch('/api/printer/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: p.ip_address, port: p.port ?? 9100 }),
        })
        const json = await res.json()
        setTestResults(prev => ({
          ...prev,
          [p.id]: json.ok
            ? { status: 'ok',   message: `Reachable at ${p.ip_address}:${p.port ?? 9100}` }
            : { status: 'fail', message: json.error ?? 'Could not connect' },
        }))
      } catch {
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'fail', message: 'Network error' } }))
      }

    } else if (p.connection_type === 'bluetooth') {
      if (!('bluetooth' in navigator)) {
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'fail', message: 'Web Bluetooth not supported (use Chrome/Edge)' } }))
        return
      }
      try {
        // Request any Bluetooth device — user will see the OS picker
        const device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true })
        setTestResults(prev => ({
          ...prev,
          [p.id]: { status: 'ok', message: `Found: ${device.name ?? 'Unknown device'}` },
        }))
      } catch (e: any) {
        const msg = e?.message?.includes('cancelled') || e?.message?.includes('cancel')
          ? 'Pairing cancelled'
          : (e?.message ?? 'Bluetooth error')
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'fail', message: msg } }))
      }

    } else if (p.connection_type === 'usb') {
      if (!('usb' in navigator)) {
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'fail', message: 'WebUSB not supported (use Chrome/Edge)' } }))
        return
      }
      try {
        const device = await (navigator as any).usb.requestDevice({ filters: [] })
        setTestResults(prev => ({
          ...prev,
          [p.id]: { status: 'ok', message: `Found: ${device.productName ?? 'USB device'} (${device.manufacturerName ?? ''})` },
        }))
      } catch (e: any) {
        const msg = e?.message?.includes('No device selected') || e?.message?.includes('cancelled')
          ? 'No device selected'
          : (e?.message ?? 'USB error')
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'fail', message: msg } }))
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto">

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl bg-white/4 border border-white/8 w-fit">
        {([
          { key: 'kds',      icon: <MonitorCheck className="w-4 h-4" />, label: t.dev_kds },
          { key: 'printers', icon: <Printer      className="w-4 h-4" />, label: t.dev_printers },
          { key: 'other',    icon: <Monitor      className="w-4 h-4" />, label: 'Other Devices' },
        ] as const).map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              tab === key ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-white/50 hover:text-white/70')}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ══ KDS Stations tab ══ */}
      {tab === 'kds' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <MonitorCheck className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">{t.dev_kds}</h1>
                <p className="text-xs text-white/40">{t.dev_subtitle}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{stations.length}</span>
            </div>
            <button onClick={openKdsAdd}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
              <Plus className="w-4 h-4" /> {t.dev_add_station}
            </button>
          </div>

          {kdsLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
          ) : kdsError ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">{kdsError}</div>
          ) : stations.length === 0 ? (
            <div className="text-center py-20 text-white/25">
              <MonitorCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{t.dev_no_stations}</p>
              <p className="text-xs mt-1">Add stations like &quot;Salad Kitchen&quot;, &quot;Pizza Kitchen&quot;, &quot;Grill&quot;…</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stations.map(s => {
                const assignedCats = categories.filter(c => s.category_ids.includes(c.id))
                return (
                  <div key={s.id} className={cn(
                    'flex items-center gap-4 p-4 rounded-2xl border transition-all',
                    s.active ? 'bg-white/5 border-white/10' : 'bg-white/2 border-white/5 opacity-60'
                  )}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: s.color + '22', border: `1.5px solid ${s.color}55` }}>
                      <ChefHat className="w-5 h-5" style={{ color: s.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <p className="text-sm font-semibold text-white">{s.name}</p>
                      </div>
                      {assignedCats.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {assignedCats.map(c => (
                            <span key={c.id}
                              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: c.color + '22', color: c.color }}>
                              <Tag className="w-2.5 h-2.5" />{c.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-white/25 mt-0.5">No categories assigned — shows all items</p>
                      )}
                    </div>
                    <button onClick={() => toggleKdsActive(s)} className="active:scale-95 shrink-0">
                      {s.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                    </button>
                    <button onClick={() => openKdsEdit(s)}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleKdsDelete(s.id)}
                      className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                        kdsDeleteId === s.id
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
                          : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                      {kdsDeleteId === s.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Printers tab ══ */}
      {tab === 'printers' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <Printer className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">{t.dev_printers}</h1>
                <p className="text-xs text-white/40">{t.dev_subtitle}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{printers.length}</span>
            </div>
            <button onClick={openPrtAdd}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
              <Plus className="w-4 h-4" /> {t.dev_add_printer}
            </button>
          </div>

          {prtLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
          ) : prtError ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">{prtError}</div>
          ) : printers.length === 0 ? (
            <div className="text-center py-20 text-white/25">
              <Printer className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{t.dev_no_printers}</p>
              <p className="text-xs mt-1">Add a receipt printer, kitchen printer, or label printer</p>
            </div>
          ) : (
            <div className="space-y-3">
              {printers.map(p => {
                const purpose = purposeInfo(p.purpose)
                const conn    = connInfo(p.connection_type)
                const connDetail = p.connection_type === 'ip'
                  ? `${p.ip_address ?? '—'}:${p.port ?? 9100}`
                  : p.connection_type === 'bluetooth'
                  ? (p.bt_address ?? '—')
                  : (p.usb_path ?? '—')

                return (
                  <div key={p.id} className={cn(
                    'flex items-center gap-4 p-4 rounded-2xl border transition-all',
                    p.active ? 'bg-white/5 border-white/10' : 'bg-white/2 border-white/5 opacity-60'
                  )}>
                    {/* Purpose icon */}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: purpose.color + '22', border: `1.5px solid ${purpose.color}55` }}>
                      <span style={{ color: purpose.color }}>{purpose.icon}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {/* Purpose badge */}
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: purpose.color + '20', color: purpose.color }}>
                          {purpose.label}
                        </span>
                        {/* Connection badge */}
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-white/8 text-white/50">
                          {conn.icon}
                          {conn.label}
                        </span>
                        {/* Connection detail */}
                        <span className="text-[10px] text-white/30 font-mono">{connDetail}</span>
                        {/* Paper width badge */}
                        {p.paper_width && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400/70">
                            <Ruler className="w-2.5 h-2.5" />{p.paper_width} mm
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Test result inline */}
                    {testResults[p.id] && (
                      <div className={cn(
                        'flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-lg shrink-0 max-w-[140px]',
                        testResults[p.id].status === 'ok'      ? 'bg-emerald-500/15 text-emerald-400'
                        : testResults[p.id].status === 'fail'  ? 'bg-rose-500/15 text-rose-400'
                        : 'bg-white/8 text-white/40'
                      )}>
                        {testResults[p.id].status === 'testing' && <Loader2 className="w-3 h-3 shrink-0 animate-spin" />}
                        {testResults[p.id].status === 'ok'      && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                        {testResults[p.id].status === 'fail'    && <WifiOff className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{testResults[p.id].message ?? 'Testing…'}</span>
                      </div>
                    )}

                    {/* Test button */}
                    <button
                      onClick={() => testPrinter(p)}
                      disabled={testResults[p.id]?.status === 'testing'}
                      title="Test connection"
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-blue-500/15 border border-white/8 hover:border-blue-500/30 flex items-center justify-center text-white/40 hover:text-blue-400 transition-all active:scale-95 disabled:opacity-40 shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                    </button>

                    {/* Active toggle */}
                    <button onClick={() => togglePrtActive(p)} className="active:scale-95 shrink-0">
                      {p.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                    </button>

                    {/* Edit */}
                    <button onClick={() => openPrtEdit(p)}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button onClick={() => handlePrtDelete(p.id)}
                      className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                        prtDeleteId === p.id
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2'
                          : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                      {prtDeleteId === p.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Other Devices tab ══ */}
      {tab === 'other' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Other Devices</h1>
              <p className="text-xs text-white/40">POS terminals and peripherals</p>
            </div>
          </div>
          <div className="space-y-3">
            {['POS Terminals', 'Cash Drawer', 'Card Reader / Payment Terminal', 'Barcode Scanner', 'Device Pairing'].map(item => (
              <div key={item} className="flex items-center justify-between px-4 py-3.5 rounded-2xl bg-white/3 border border-white/8">
                <span className="text-sm text-white/50">{item}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/30 font-medium uppercase tracking-wider">
                  Coming Soon
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ KDS Modal ══ */}
      {kdsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{kdsEditId ? t.edit : t.dev_add_station}</h2>
              <button onClick={() => setKdsModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.dev_station_name} *</label>
                <input value={kdsForm.name} onChange={e => setKdsForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Pizza Kitchen, Salad Station…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>
              {/* Color */}
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">Color</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button key={c} onClick={() => setKdsForm(f => ({ ...f, color: c }))}
                      className="w-7 h-7 rounded-lg transition-all active:scale-95 flex items-center justify-center"
                      style={{ backgroundColor: c }}>
                      {kdsForm.color === c && <Check className="w-4 h-4 text-white drop-shadow" />}
                    </button>
                  ))}
                  <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-white/20">
                    <input type="color" value={kdsForm.color} onChange={e => setKdsForm(f => ({ ...f, color: e.target.value }))}
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0" />
                    <div className="w-full h-full rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center text-white/40 text-[10px]">+</div>
                  </div>
                  <div className="w-7 h-7 rounded-lg border border-white/20" style={{ backgroundColor: kdsForm.color }} />
                </div>
              </div>
              {/* Categories */}
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">
                  Assigned Categories <span className="text-white/25">(empty = show all)</span>
                </label>
                {categories.length === 0 ? (
                  <p className="text-xs text-white/30 italic">No categories — add them in Menu → Category</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map(c => {
                      const selected = kdsForm.category_ids.includes(c.id)
                      return (
                        <button key={c.id} onClick={() => toggleCategory(c.id)}
                          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 border',
                            selected ? 'border-transparent' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/8')}
                          style={selected ? { backgroundColor: c.color + '25', borderColor: c.color + '60', color: c.color } : {}}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                          {selected && <Check className="w-3 h-3 ml-0.5" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Active */}
              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">{t.dev_active}</span>
                <button onClick={() => setKdsForm(f => ({ ...f, active: !f.active }))} className="active:scale-95">
                  {kdsForm.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setKdsModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                {t.cancel}
              </button>
              <button onClick={handleKdsSave} disabled={!kdsForm.name.trim() || kdsSaving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {kdsSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {kdsEditId ? t.save_changes : t.dev_add_station}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Printer Modal ══ */}
      {prtModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{prtEditId ? t.edit : t.dev_add_printer}</h2>
              <button onClick={() => setPrtModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">

              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">{t.dev_printer_name} *</label>
                <input value={prtForm.name} onChange={e => setPrtForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Kitchen Printer, Cashier Receipt…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>

              {/* Purpose */}
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">{t.dev_purpose}</label>
                <div className="grid grid-cols-2 gap-2">
                  {PURPOSE_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPrtForm(f => ({ ...f, purpose: opt.value }))}
                      className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 border text-left',
                        prtForm.purpose === opt.value ? 'border-transparent' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/8')}
                      style={prtForm.purpose === opt.value ? { backgroundColor: opt.color + '20', borderColor: opt.color + '50', color: opt.color } : {}}>
                      {opt.icon}
                      <span className="text-xs">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Connection type */}
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">{t.dev_connection}</label>
                <div className="space-y-2">
                  {CONNECTION_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPrtForm(f => ({ ...f, connection_type: opt.value }))}
                      className={cn('w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all active:scale-95 border text-left',
                        prtForm.connection_type === opt.value
                          ? 'bg-amber-500/15 border-amber-500/40 text-white'
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/8')}>
                      <span className={prtForm.connection_type === opt.value ? 'text-amber-400' : 'text-white/30'}>
                        {opt.icon}
                      </span>
                      <div>
                        <p className="font-medium text-xs">{opt.label}</p>
                        <p className="text-[10px] text-white/35 mt-0.5">{opt.desc}</p>
                      </div>
                      {prtForm.connection_type === opt.value && (
                        <Check className="w-4 h-4 text-amber-400 ml-auto shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* IP fields */}
              {prtForm.connection_type === 'ip' && (
                <div className="space-y-3 p-4 rounded-2xl bg-white/3 border border-white/8">
                  <p className="text-xs font-medium text-white/50 flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-blue-400" /> IP / Network Settings
                  </p>
                  <div>
                    <label className="block text-xs text-white/40 mb-1">{t.dev_ip_address}</label>
                    <input value={prtForm.ip_address} onChange={e => setPrtForm(f => ({ ...f, ip_address: e.target.value }))}
                      placeholder="192.168.1.100"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 font-mono focus:outline-none focus:border-amber-500/50 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1">{t.dev_port} <span className="text-white/25">(default 9100)</span></label>
                    <input type="number" value={prtForm.port} onChange={e => setPrtForm(f => ({ ...f, port: parseInt(e.target.value) || 9100 }))}
                      placeholder="9100"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 font-mono focus:outline-none focus:border-amber-500/50 transition-colors" />
                  </div>
                </div>
              )}

              {/* Bluetooth fields */}
              {prtForm.connection_type === 'bluetooth' && (
                <div className="space-y-3 p-4 rounded-2xl bg-white/3 border border-white/8">
                  <p className="text-xs font-medium text-white/50 flex items-center gap-1.5">
                    <Bluetooth className="w-3.5 h-3.5 text-blue-400" /> Bluetooth Settings
                  </p>
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Device Address / Name</label>
                    <input value={prtForm.bt_address} onChange={e => setPrtForm(f => ({ ...f, bt_address: e.target.value }))}
                      placeholder="00:11:22:33:44:55 or BT-Printer"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 font-mono focus:outline-none focus:border-amber-500/50 transition-colors" />
                  </div>
                  <p className="text-[11px] text-white/25 leading-relaxed">
                    Pair the printer in your device's Bluetooth settings first, then enter the device address or name here.
                  </p>
                </div>
              )}

              {/* USB fields */}
              {prtForm.connection_type === 'usb' && (
                <div className="space-y-3 p-4 rounded-2xl bg-white/3 border border-white/8">
                  <p className="text-xs font-medium text-white/50 flex items-center gap-1.5">
                    <Usb className="w-3.5 h-3.5 text-blue-400" /> USB / Serial Settings
                  </p>
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Port / Device Path</label>
                    <input value={prtForm.usb_path} onChange={e => setPrtForm(f => ({ ...f, usb_path: e.target.value }))}
                      placeholder="COM3  or  /dev/ttyUSB0"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 font-mono focus:outline-none focus:border-amber-500/50 transition-colors" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {['COM1', 'COM2', 'COM3', 'COM4', '/dev/ttyUSB0', '/dev/usb/lp0'].map(preset => (
                      <button key={preset} onClick={() => setPrtForm(f => ({ ...f, usb_path: preset }))}
                        className="text-[10px] px-2 py-1 rounded-lg bg-white/8 text-white/40 hover:bg-white/12 hover:text-white/60 font-mono transition-all active:scale-95">
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Paper Width */}
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5" /> Paper Width
                  <span className="text-white/25 font-normal">(fits invoice to printer roll)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PAPER_WIDTHS.map(pw => (
                    <button key={pw.mm} onClick={() => setPrtForm(f => ({ ...f, paper_width: pw.mm }))}
                      className={cn(
                        'flex flex-col items-center px-2 py-2.5 rounded-xl text-xs font-medium transition-all active:scale-95 border',
                        prtForm.paper_width === pw.mm
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-white/5 border-white/10 text-white/45 hover:bg-white/8'
                      )}>
                      <span className="font-semibold text-sm leading-none mb-0.5">{pw.label}</span>
                      <span className="text-[10px] opacity-60">{pw.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-white/30">Custom:</span>
                  <input
                    type="number" min={30} max={200}
                    value={prtForm.paper_width}
                    onChange={e => setPrtForm(f => ({ ...f, paper_width: parseInt(e.target.value) || 80 }))}
                    className="w-20 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500/50 transition-colors" />
                  <span className="text-[11px] text-white/30">mm</span>
                </div>
              </div>

              {/* Active */}
              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">{t.dev_active}</span>
                <button onClick={() => setPrtForm(f => ({ ...f, active: !f.active }))} className="active:scale-95">
                  {prtForm.active ? <ToggleRight className="w-6 h-6 text-amber-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setPrtModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">
                {t.cancel}
              </button>
              <button onClick={handlePrtSave} disabled={!prtForm.name.trim() || prtSaving}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {prtSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {prtEditId ? t.save_changes : t.dev_add_printer}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
