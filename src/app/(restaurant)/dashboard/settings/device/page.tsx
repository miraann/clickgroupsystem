'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  Monitor, MonitorCheck, Plus, Pencil, Trash2,
  X, Loader2, ToggleLeft, ToggleRight, Check,
  ChefHat, Tag, Printer, Wifi, Bluetooth,
  Usb, Receipt, UtensilsCrossed, Tag as LabelIcon,
  Wine, Activity, AlertCircle, CheckCircle2, WifiOff, Ruler,
  ScanLine, Radio,
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

interface DetectedDevice {
  id: string
  name: string
  connection_type: 'usb' | 'bluetooth' | 'network'
  address: string
  port?: number
  manufacturer?: string
  status: 'online' | 'offline'
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

// ── Scan phase label ───────────────────────────────────────────
const SCAN_PHASES = ['usb', 'bluetooth', 'network', null] as const
type ScanPhase = typeof SCAN_PHASES[number]

function ScanPhaseBadge({ phase }: { phase: ScanPhase }) {
  if (!phase) return null
  const info = {
    usb:       { icon: <Usb       className="w-3 h-3" />, label: 'Scanning USB…',       color: 'text-blue-400'   },
    bluetooth: { icon: <Bluetooth className="w-3 h-3" />, label: 'Scanning Bluetooth…', color: 'text-indigo-400' },
    network:   { icon: <Wifi      className="w-3 h-3" />, label: 'Scanning Network…',   color: 'text-cyan-400'   },
  }[phase]
  return (
    <span className={cn('flex items-center gap-1.5 text-xs font-medium', info.color)}>
      {info.icon}{info.label}
    </span>
  )
}



function triggerTestPrint(printerName: string, paperWidth: number) {
  const now  = new Date().toLocaleString()
  const cols = paperWidth >= 80 ? 42 : paperWidth >= 58 ? 32 : 24
  const line = '-'.repeat(cols)
  // Chrome blocks window.print() called from window.onload in a popup (no user gesture).
  // Solution: show a "Print Now" button — clicking it IS a user gesture, so print works.
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Test Print — ClickGroup POS</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@media screen{
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#080b14;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;width:100%;max-width:300px;text-align:center}
  .brand{font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:.12em;text-transform:uppercase;margin-bottom:18px}
  .icon{width:52px;height:52px;background:rgba(245,158,11,0.12);border:1.5px solid rgba(245,158,11,0.3);border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:22px}
  .name{font-size:15px;font-weight:600;color:#fff;margin-bottom:3px}
  .sub{font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:18px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:7px 11px;background:rgba(255,255,255,0.04);border-radius:9px;margin-bottom:5px}
  .lbl{font-size:10px;color:rgba(255,255,255,0.3)}
  .val{font-size:10px;color:rgba(255,255,255,0.65);font-weight:500}
  .printbtn{margin-top:18px;width:100%;padding:12px;background:#f59e0b;border:none;border-radius:12px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;letter-spacing:.01em}
  .printbtn:hover{background:#d97706}
  .printbtn:active{transform:scale(.97)}
  .foot{margin-top:10px;font-size:9px;color:rgba(255,255,255,0.15);line-height:1.5}
  #receipt{display:none}
}
@media print{
  body{background:#fff;color:#000}
  .card,.brand,.icon,.name,.sub,.row,.printbtn,.foot{display:none!important}
  #receipt{display:block!important;font-family:'Courier New',monospace;font-size:12px;width:${paperWidth}mm;padding:4px}
  @page{size:${paperWidth}mm auto;margin:2mm}
}
</style></head><body>
<div class="card">
  <div class="brand">ClickGroup POS</div>
  <div class="icon">🖨</div>
  <div class="name">Test Print</div>
  <div class="sub">${printerName}</div>
  <div class="row"><span class="lbl">Paper width</span><span class="val">${paperWidth} mm</span></div>
  <div class="row"><span class="lbl">Columns</span><span class="val">${cols} chars</span></div>
  <div class="row"><span class="lbl">Time</span><span class="val">${now}</span></div>
  <button class="printbtn" onclick="window.print();setTimeout(function(){window.close()},3000)">🖨&nbsp; Print Now</button>
  <div class="foot">Select your printer in the dialog, then click Print.</div>
</div>
<div id="receipt">
  <p style="text-align:center;font-weight:bold;font-size:15px">TEST PRINT</p>
  <p style="text-align:center">ClickGroup POS</p>
  <p>${line}</p>
  <p>Printer : ${printerName}</p>
  <p>Paper   : ${paperWidth} mm</p>
  <p>Time    : ${now}</p>
  <p>${line}</p>
  <p style="text-align:center;font-weight:bold">** PRINTER READY **</p>
</div>
</body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank', 'width=360,height=440,left=200,top=120')
  if (!win) { URL.revokeObjectURL(url); throw new Error('Popup blocked — allow popups for this site and try again.') }
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// Common BLE thermal printer service UUIDs (tried in order)
const BT_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic Printer (Epson, Star, etc.)
  '0000ffe0-0000-1000-8000-00805f9b34fb', // BLE serial (many cheap thermal printers)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // ESC/POS BLE (some brands)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Nordic UART compatible
]

async function sendBtTestPage(printerName: string, paperWidth: number): Promise<string> {
  const bt = (navigator as any).bluetooth

  const ESC = 0x1B, GS = 0x1D
  const cols = paperWidth >= 80 ? 42 : paperWidth >= 58 ? 32 : 24
  const divider = '-'.repeat(cols)
  const enc = new TextEncoder()

  const bytes = new Uint8Array([
    ESC, 0x40,
    ESC, 0x61, 0x01,
    ESC, 0x45, 0x01, ...enc.encode('TEST PRINT\n'), ESC, 0x45, 0x00,
    ...enc.encode('ClickGroup POS\n'),
    ...enc.encode(divider + '\n'),
    ESC, 0x61, 0x00,
    ...enc.encode(`Printer : ${printerName}\n`),
    ...enc.encode(`Paper   : ${paperWidth} mm\n`),
    ...enc.encode(`Type    : Bluetooth\n`),
    ...enc.encode(`Status  : OK\n`),
    ESC, 0x61, 0x01,
    ...enc.encode(divider + '\n'),
    ...enc.encode('** PRINTER READY **\n'),
    0x0A, 0x0A, 0x0A,
    GS, 0x56, 0x42, 0x10,
  ])

  // Try already-authorized devices first (no picker dialog)
  let dev: any = null
  try { const devs = await bt.getDevices(); dev = devs[0] ?? null } catch {}

  if (!dev) {
    // First time — show picker and authorize with all common printer services
    dev = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BT_PRINTER_SERVICES })
  }

  const server = await dev.gatt.connect()
  try {
    for (const serviceUuid of BT_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid)
        const chars   = await service.getCharacteristics()
        const writable = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse)
        if (!writable) continue

        // Write in 512-byte BLE-safe chunks
        for (let i = 0; i < bytes.length; i += 512) {
          const chunk = bytes.slice(i, Math.min(i + 512, bytes.length))
          if (writable.properties.writeWithoutResponse) {
            await writable.writeValueWithoutResponse(chunk)
          } else {
            await writable.writeValue(chunk)
          }
        }
        return `Test page sent to ${dev.name ?? 'Bluetooth printer'}`
      } catch { /* try next service UUID */ }
    }
    throw new Error('No writable printer characteristic found — pair the printer first via the BT button, then test again')
  } finally {
    server.disconnect()
  }
}

// ── Main Page ──────────────────────────────────────────────────
export default function DevicePage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const router = useRouter()

  const [tab, setTab] = useState<'kds' | 'printers' | 'other'>('kds')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tab') as typeof tab | null
    if (p && ['kds', 'printers', 'other'].includes(p)) setTab(p)
  }, [])

  const switchTab = (key: typeof tab) => {
    setTab(key)
    const url = new URL(window.location.href)
    if (key === 'kds') url.searchParams.delete('tab')
    else url.searchParams.set('tab', key)
    router.replace(url.pathname + url.search)
  }
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

  // Auto-detect state
  const [scanning, setScanning]           = useState(false)
  const [scanPhase, setScanPhase]         = useState<ScanPhase>(null)
  const [scanProgress, setScanProgress]   = useState(0)
  const [detectedDevices, setDetectedDevices] = useState<DetectedDevice[]>([])
  const [showDetected, setShowDetected]   = useState(false)
  const [detectedTest, setDetectedTest]   = useState<Record<string, 'testing' | 'ok' | 'fail'>>({})


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

  // ── USB live connect/disconnect events ────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('usb' in navigator)) return
    const nav = navigator as any
    const onConnect = (e: any) => {
      const d = e.device
      const id = `usb-${d.vendorId}-${d.productId}`
      setDetectedDevices(prev => {
        if (prev.some(x => x.id === id)) return prev.map(x => x.id === id ? { ...x, status: 'online' as const } : x)
        return [...prev, {
          id,
          name: d.productName || `USB Device (${d.vendorId}:${d.productId})`,
          connection_type: 'usb' as const,
          address: '',
          manufacturer: d.manufacturerName,
          status: 'online' as const,
        }]
      })
      setShowDetected(true)
    }
    const onDisconnect = (e: any) => {
      const id = `usb-${e.device.vendorId}-${e.device.productId}`
      setDetectedDevices(prev => prev.map(x => x.id === id ? { ...x, status: 'offline' as const } : x))
    }
    nav.usb.addEventListener('connect', onConnect)
    nav.usb.addEventListener('disconnect', onDisconnect)
    return () => {
      nav.usb.removeEventListener('connect', onConnect)
      nav.usb.removeEventListener('disconnect', onDisconnect)
    }
  }, [])

  // ══════════════════════════════════════════════════════════
  // Auto-detect handlers
  // ══════════════════════════════════════════════════════════

  const scanDevices = async () => {
    setScanning(true)
    setScanProgress(0)
    setDetectedDevices([])
    setShowDetected(false)
    const found: DetectedDevice[] = []

    // ── USB (WebUSB — silently lists already-authorized devices) ──
    // Note: HID-class devices (barcode scanners, mice) are excluded by Chrome security.
    // Use the USB button to authorize a new non-HID device (printer, card reader, etc.)
    setScanPhase('usb')
    setScanProgress(20)
    if (typeof navigator !== 'undefined' && 'usb' in navigator) {
      try {
        const usbDevs = await (navigator as any).usb.getDevices()
        for (const d of usbDevs) {
          found.push({
            id:              `usb-${d.vendorId}-${d.productId}`,
            name:            d.productName || `USB Device (${d.vendorId}:${d.productId})`,
            connection_type: 'usb',
            address:         '',
            manufacturer:    d.manufacturerName || undefined,
            status:          'online',
          })
        }
      } catch {}
    }
    setScanProgress(50)

    // ── Bluetooth ─────────────────────────────────────────
    setScanPhase('bluetooth')
    if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      try {
        const btDevs = await (navigator as any).bluetooth.getDevices()
        for (const d of btDevs) {
          found.push({
            id: `bt-${d.id}`,
            name: d.name || 'Bluetooth Device',
            connection_type: 'bluetooth',
            address: d.id,
            status: 'online',
          })
        }
        if (btDevs.length === 0) {
          try {
            const d = await (navigator as any).bluetooth.requestDevice({
              acceptAllDevices: true,
              optionalServices: BT_PRINTER_SERVICES,
            })
            found.push({
              id: `bt-${d.id}`,
              name: d.name || 'Bluetooth Device',
              connection_type: 'bluetooth',
              address: d.id,
              status: 'online',
            })
          } catch { /* user dismissed picker */ }
        }
      } catch {}
    }
    setScanProgress(70)

    // ── Network (server-side LAN scan — works when server is on same network) ──
    setScanPhase('network')
    try {
      const res = await fetch('/api/devices/scan', { method: 'POST', signal: AbortSignal.timeout(20000) })
      const { devices: netDevs, cloudDeployment } = await res.json()
      if (!cloudDeployment) {
        for (const d of (netDevs ?? [])) {
          found.push({
            id:              d.id,
            name:            d.name,
            connection_type: 'network',
            address:         d.ip,
            port:            d.port,
            status:          'online',
          })
        }
      }
    } catch { /* silent — expected on cloud deployment or slow network */ }

    setScanProgress(100)
    setScanPhase(null)

    setDetectedDevices(found)
    setShowDetected(true)
    setScanning(false)
  }

  // Request NEW USB device (shows OS picker — authorizes a new device)
  const requestNewUsb = async () => {
    if (typeof navigator === 'undefined' || !('usb' in navigator)) return
    try {
      const d = await (navigator as any).usb.requestDevice({ filters: [] })
      const id = `usb-${d.vendorId}-${d.productId}`
      setDetectedDevices(prev => {
        if (prev.some(x => x.id === id)) return prev
        return [...prev, {
          id,
          name: d.productName || `USB Device (${d.vendorId}:${d.productId})`,
          connection_type: 'usb' as const,
          address: '',
          manufacturer: d.manufacturerName || undefined,
          status: 'online' as const,
        }]
      })
      setShowDetected(true)
    } catch {}
  }

  // Request NEW Bluetooth device (shows OS picker)
  const requestNewBt = async () => {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) return
    try {
      const d = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BT_PRINTER_SERVICES,
      })
      const id = `bt-${d.id}`
      setDetectedDevices(prev => {
        if (prev.some(x => x.id === id)) return prev
        return [...prev, {
          id,
          name: d.name || `Bluetooth Device`,
          connection_type: 'bluetooth' as const,
          address: d.id,
          status: 'online' as const,
        }]
      })
      setShowDetected(true)
    } catch {}
  }

  // Pre-fill the Add Printer modal from a detected device
  const addDetectedToSystem = (d: DetectedDevice) => {
    const conn: ConnectionType =
      d.connection_type === 'network'   ? 'ip'
      : d.connection_type === 'bluetooth' ? 'bluetooth'
      : 'usb'
    setPrtEditId(null)
    setPrtForm({
      ...EMPTY_PRINTER_FORM,
      name:            d.name,
      connection_type: conn,
      ip_address:      conn === 'ip'        ? d.address : '',
      port:            d.port ?? 9100,
      bt_address:      conn === 'bluetooth' ? d.address : '',
      usb_path:        conn === 'usb'       ? (d.address || '') : '',
    })
    setPrtModal(true)
  }

  // Test connection for a detected network device — prints a test invoice
  const testDetectedNetwork = async (d: DetectedDevice) => {
    if (d.connection_type !== 'network') return
    setDetectedTest(prev => ({ ...prev, [d.id]: 'testing' }))
    try {
      const res = await fetch('/api/printer/print-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: d.address, port: d.port ?? 9100, name: d.name, paper_width: 80 }),
      })
      const json = await res.json()
      setDetectedTest(prev => ({ ...prev, [d.id]: json.ok ? 'ok' : 'fail' }))
    } catch {
      setDetectedTest(prev => ({ ...prev, [d.id]: 'fail' }))
    }
  }

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

  // ── Test configured printer connection ────────────────────────────────
  const testPrinter = async (p: PrinterDevice) => {
    setTestResults(prev => ({ ...prev, [p.id]: { status: 'testing' } }))

    if (p.connection_type === 'ip' || p.connection_type === 'usb') {
      // Both USB (via Windows usbprint.sys driver) and IP (via Windows network printer)
      // are accessible through the browser's native print dialog.
      try {
        triggerTestPrint(p.name, p.paper_width ?? 80)
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'ok', message: 'Print dialog opened — select your printer.' } }))
      } catch (e: any) {
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'fail', message: e?.message ?? 'Failed to open print dialog' } }))
      }

    } else if (p.connection_type === 'bluetooth') {
      if (!('bluetooth' in navigator)) {
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'fail', message: 'Web Bluetooth not supported (use Chrome/Edge)' } }))
        return
      }
      try {
        const msg = await sendBtTestPage(p.name, p.paper_width ?? 80)
        setTestResults(prev => ({ ...prev, [p.id]: { status: 'ok', message: msg } }))
      } catch (e: any) {
        const raw = e?.message ?? ''
        const msg = raw.includes('cancelled') || raw.includes('cancel') ? 'Pairing cancelled' : raw
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
          <button key={key} onClick={() => switchTab(key)}
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
          <div className="flex items-center justify-between mb-5">
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

          {/* ── Auto-Detect Panel ── */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/3 overflow-hidden">
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-3.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
                <Radio className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Auto-Detect Devices</p>
                <p className="text-xs text-white/35">Scans USB, Bluetooth, and local network (LAN) for printers</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Request USB */}
                <button onClick={requestNewUsb} title="Authorize new USB device"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-[11px] font-medium transition-all active:scale-95 border border-white/8">
                  <Usb className="w-3 h-3" /> USB
                </button>
                {/* Request BT */}
                <button onClick={requestNewBt} title="Pair new Bluetooth device"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-[11px] font-medium transition-all active:scale-95 border border-white/8">
                  <Bluetooth className="w-3 h-3" /> Pair BT
                </button>
                {/* Scan button */}
                <button onClick={scanDevices} disabled={scanning}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95 disabled:opacity-60',
                    scanning
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
                  )}>
                  {scanning
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ScanLine className="w-3.5 h-3.5" />}
                  {scanning ? 'Scanning…' : 'Scan'}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {scanning && (
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <ScanPhaseBadge phase={scanPhase} />
                  <span className="text-[11px] text-white/30">{scanProgress}%</span>
                </div>
                <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-white/25 mt-1.5">
                  Network scan probes 254 addresses and may take a few seconds.
                </p>
              </div>
            )}

            {/* Results */}
            {showDetected && !scanning && (
              <div className="border-t border-white/8 px-4 py-3">
                {/* Device type legend */}
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-start gap-2 text-[10px] text-white/35 leading-relaxed">
                    <Usb className="w-3 h-3 shrink-0 mt-0.5 text-blue-400/60" />
                    <span><span className="text-white/50 font-medium">USB printers / card readers</span> — click the <span className="text-white/50">USB</span> button above to authorize them in Chrome first, then scan again.</span>
                  </div>
                  <div className="flex items-start gap-2 text-[10px] text-white/35 leading-relaxed">
                    <ScanLine className="w-3 h-3 shrink-0 mt-0.5 text-amber-400/60" />
                    <span><span className="text-white/50 font-medium">Barcode scanners</span> — work automatically as a USB keyboard. No setup needed here; just focus any text field and scan.</span>
                  </div>
                  <div className="flex items-start gap-2 text-[10px] text-white/35 leading-relaxed">
                    <Wifi className="w-3 h-3 shrink-0 mt-0.5 text-cyan-400/60" />
                    <span><span className="text-white/50 font-medium">Network / IP printers</span> — click <span className="text-white/50">Add Printer</span> and enter the IP address manually (auto-scan only works on local deployments).</span>
                  </div>
                </div>

                {detectedDevices.length === 0 ? (
                  <div className="flex items-center gap-3 py-2 text-white/30">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">No USB devices authorized yet</p>
                      <p className="text-[10px]">Click the <span className="font-medium text-white/40">USB</span> button above, select your printer, then scan again.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-white/35 font-medium mb-2">{detectedDevices.length} device{detectedDevices.length !== 1 ? 's' : ''} found</p>
                    {detectedDevices.map(d => {
                      const connIcon =
                        d.connection_type === 'usb'       ? <Usb       className="w-3.5 h-3.5 text-blue-400" />
                        : d.connection_type === 'bluetooth' ? <Bluetooth className="w-3.5 h-3.5 text-indigo-400" />
                        : <Wifi className="w-3.5 h-3.5 text-cyan-400" />

                      const connColor =
                        d.connection_type === 'usb'       ? 'bg-blue-500/15 text-blue-400'
                        : d.connection_type === 'bluetooth' ? 'bg-indigo-500/15 text-indigo-400'
                        : 'bg-cyan-500/15 text-cyan-400'

                      const testState = detectedTest[d.id]

                      return (
                        <div key={d.id} className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border transition-all',
                          d.status === 'offline'
                            ? 'bg-white/2 border-white/5 opacity-50'
                            : 'bg-white/5 border-white/10'
                        )}>
                          {/* Type icon */}
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', connColor.split(' ')[0])}>
                            {connIcon}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{d.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', connColor)}>
                                {d.connection_type === 'usb' ? 'USB' : d.connection_type === 'bluetooth' ? 'Bluetooth' : 'Network'}
                              </span>
                              {d.address && (
                                <span className="text-[10px] text-white/30 font-mono">
                                  {d.address}{d.port ? `:${d.port}` : ''}
                                </span>
                              )}
                              {d.manufacturer && (
                                <span className="text-[10px] text-white/25">{d.manufacturer}</span>
                              )}
                            </div>
                          </div>

                          {/* Status */}
                          <span className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                            d.status === 'online' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/8 text-white/30'
                          )}>
                            {d.status}
                          </span>

                          {/* Test (network only) */}
                          {d.connection_type === 'network' && (
                            <button
                              onClick={() => testDetectedNetwork(d)}
                              disabled={testState === 'testing'}
                              title="Test connection"
                              className={cn(
                                'w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 shrink-0 border',
                                testState === 'ok'      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                : testState === 'fail'  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                : testState === 'testing' ? 'bg-white/8 border-white/10 text-white/40'
                                : 'bg-white/5 border-white/10 text-white/30 hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/10'
                              )}>
                              {testState === 'testing'
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : testState === 'ok'
                                ? <CheckCircle2 className="w-3 h-3" />
                                : testState === 'fail'
                                ? <WifiOff className="w-3 h-3" />
                                : <Activity className="w-3 h-3" />}
                            </button>
                          )}

                          {/* Add to System */}
                          <button
                            onClick={() => addDetectedToSystem(d)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-[11px] font-medium transition-all active:scale-95 shrink-0 border border-amber-500/20">
                            <Plus className="w-3 h-3" /> Add
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Configured Printers List ── */}
          {prtLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
          ) : prtError ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">{prtError}</div>
          ) : printers.length === 0 ? (
            <div className="text-center py-14 text-white/25">
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
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: purpose.color + '20', color: purpose.color }}>
                          {purpose.label}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-white/8 text-white/50">
                          {conn.icon}
                          {conn.label}
                        </span>
                        <span className="text-[10px] text-white/30 font-mono">{connDetail}</span>
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
                    Pair the printer in your device&apos;s Bluetooth settings first, then enter the device address or name here.
                  </p>
                </div>
              )}

              {/* USB fields */}
              {prtForm.connection_type === 'usb' && (
                <div className="space-y-3 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/15">
                  <p className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
                    <Usb className="w-3.5 h-3.5" /> USB via WebUSB
                  </p>
                  <p className="text-[11px] text-white/40 leading-relaxed">
                    Printing uses <strong className="text-white/60">WebUSB</strong> directly from your browser — no driver or path needed.
                    Click <strong className="text-white/60">USB</strong> on the Auto-Detect panel to authorize your printer in Chrome/Edge, then it will be available for printing.
                  </p>
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
