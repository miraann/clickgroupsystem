'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useInventoryData, type CachedInvCategory, type CachedInvUnit, type CachedInvItem } from '@/hooks/useInventoryData'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  Package, Plus, Pencil, Trash2, X, Loader2, Check,
  ToggleLeft, ToggleRight, AlertTriangle, Tag, Ruler,
  ShoppingCart, TrendingDown, Archive, Settings, Save,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────
type InvCategory = CachedInvCategory
type InvUnit     = CachedInvUnit
type InvItem     = CachedInvItem

// ── Constants ──────────────────────────────────────────────────
const COLOR_PRESETS = [
  '#10b981','#f59e0b','#3b82f6','#8b5cf6',
  '#ef4444','#ec4899','#f97316','#14b8a6',
]
const DEFAULT_UNITS = [
  { name: 'Kilogram',   abbreviation: 'kg' },
  { name: 'Gram',       abbreviation: 'g'  },
  { name: 'Litre',      abbreviation: 'L'  },
  { name: 'Millilitre', abbreviation: 'mL' },
  { name: 'Piece',      abbreviation: 'pc' },
  { name: 'Box',        abbreviation: 'bx' },
  { name: 'Bottle',     abbreviation: 'bt' },
  { name: 'Bag',        abbreviation: 'bg' },
]
const EMPTY_ITEM: Omit<InvItem, 'id' | 'sort_order'> = {
  name: '', sku: '', category_id: null, unit_id: null,
  current_stock: 0, min_stock: 5, cost_price: 0, active: true,
}

// ── Stock badge ────────────────────────────────────────────────
function StockBadge({ current, min, labels }: { current: number; min: number; labels: { outOfStock: string; lowStock: string; inStock: string } }) {
  if (current <= 0)       return <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-medium">{labels.outOfStock}</span>
  if (current <= min)     return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">{labels.lowStock}</span>
  return                         <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">{labels.inStock}</span>
}

// ══════════════════════════════════════════════════════════════
export default function InventoryPage() {
  const { t } = useLanguage()
  const supabase = createClient()
  const router = useRouter()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [mounted, setMounted]           = useState(false)

  useEffect(() => {
    setRestaurantId(localStorage.getItem('restaurant_id'))
    setMounted(true)
    const p = new URLSearchParams(window.location.search).get('tab') as typeof tab | null
    if (p && ['settings', 'items', 'categories', 'units'].includes(p)) setTab(p)
  }, [])

  const { data: swrData, isLoading: swrLoading, mutate } = useInventoryData(restaurantId)
  const loading = !mounted || swrLoading

  const [tab, setTab] = useState<'settings' | 'items' | 'categories' | 'units'>('settings')

  const switchTab = (key: typeof tab) => {
    setTab(key)
    const url = new URL(window.location.href)
    if (key === 'settings') url.searchParams.delete('tab')
    else url.searchParams.set('tab', key)
    router.replace(url.pathname + url.search)
  }

  // Feature flags
  const [enabled,      setEnabled]      = useState(false)
  const [showOnDash,   setShowOnDash]   = useState(false)
  const [autoDeduct,   setAutoDeduct]   = useState(false)
  const [lowThreshold, setLowThreshold] = useState(5)
  const [flagSaving,   setFlagSaving]   = useState(false)
  const [flagSaved,    setFlagSaved]    = useState(false)

  // Data
  const [categories, setCategories] = useState<InvCategory[]>([])
  const [units,      setUnits]      = useState<InvUnit[]>([])
  const [items,      setItems]      = useState<InvItem[]>([])

  // Category modal
  const [catModal, setCatModal]   = useState(false)
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [catForm,   setCatForm]   = useState({ name: '', color: '#10b981' })
  const [catSaving, setCatSaving] = useState(false)
  const [catDelId,  setCatDelId]  = useState<string | null>(null)

  // Unit modal
  const [unitModal, setUnitModal]   = useState(false)
  const [unitEditId, setUnitEditId] = useState<string | null>(null)
  const [unitForm,   setUnitForm]   = useState({ name: '', abbreviation: '' })
  const [unitSaving, setUnitSaving] = useState(false)
  const [unitDelId,  setUnitDelId]  = useState<string | null>(null)

  // Item modal
  const [itemModal, setItemModal]   = useState(false)
  const [itemEditId, setItemEditId] = useState<string | null>(null)
  const [itemForm,   setItemForm]   = useState(EMPTY_ITEM)
  const [itemSaving, setItemSaving] = useState(false)
  const [itemDelId,  setItemDelId]  = useState<string | null>(null)
  const [itemSearch, setItemSearch] = useState('')

  // Sync local state from SWR cache
  useEffect(() => {
    if (!swrData) return
    setEnabled(swrData.flags.enabled)
    setShowOnDash(swrData.flags.showOnDash)
    setAutoDeduct(swrData.flags.autoDeduct)
    setLowThreshold(swrData.flags.lowThreshold)
    setCategories(swrData.categories)
    setUnits(swrData.units)
    setItems(swrData.items)
  }, [swrData])

  // ── Save settings ─────────────────────────────────────────
  const saveSettings = async () => {
    if (!restaurantId) return
    setFlagSaving(true)
    const { data: rest } = await supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle()
    const merged = {
      ...(rest?.settings ?? {}),
      inventory_enabled:       enabled,
      inventory_on_dashboard:  showOnDash,
      inventory_auto_deduct:   autoDeduct,
      inventory_low_threshold: lowThreshold,
    }
    await supabase.from('restaurants').update({ settings: merged }).eq('id', restaurantId)
    mutate(prev => prev ? { ...prev, flags: { enabled, showOnDash, autoDeduct, lowThreshold } } : prev, false)
    setFlagSaving(false)
    setFlagSaved(true)
    setTimeout(() => setFlagSaved(false), 2000)
  }

  // ── Category CRUD ─────────────────────────────────────────
  const openCatAdd  = () => { setCatEditId(null); setCatForm({ name: '', color: '#10b981' }); setCatModal(true) }
  const openCatEdit = (c: InvCategory) => { setCatEditId(c.id); setCatForm({ name: c.name, color: c.color }); setCatModal(true) }
  const saveCat = async () => {
    if (!catForm.name.trim() || !restaurantId) return
    setCatSaving(true)
    const payload = { name: catForm.name.trim(), color: catForm.color }
    if (catEditId) {
      await supabase.from('inventory_categories').update(payload).eq('id', catEditId)
    } else {
      const nextOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) + 1 : 0
      await supabase.from('inventory_categories').insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
    }
    setCatSaving(false); setCatModal(false); mutate()
  }
  const deleteCat = async (id: string) => {
    if (catDelId !== id) { setCatDelId(id); setTimeout(() => setCatDelId(d => d === id ? null : d), 3000); return }
    await supabase.from('inventory_categories').delete().eq('id', id)
    setCatDelId(null); mutate()
  }

  // ── Unit CRUD ─────────────────────────────────────────────
  const openUnitAdd  = () => { setUnitEditId(null); setUnitForm({ name: '', abbreviation: '' }); setUnitModal(true) }
  const openUnitEdit = (u: InvUnit) => { setUnitEditId(u.id); setUnitForm({ name: u.name, abbreviation: u.abbreviation }); setUnitModal(true) }
  const saveUnit = async () => {
    if (!unitForm.name.trim() || !restaurantId) return
    setUnitSaving(true)
    const payload = { name: unitForm.name.trim(), abbreviation: unitForm.abbreviation.trim() }
    if (unitEditId) {
      await supabase.from('inventory_units').update(payload).eq('id', unitEditId)
    } else {
      const nextOrder = units.length > 0 ? Math.max(...units.map(u => u.sort_order)) + 1 : 0
      await supabase.from('inventory_units').insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
    }
    setUnitSaving(false); setUnitModal(false); mutate()
  }
  const deleteUnit = async (id: string) => {
    if (unitDelId !== id) { setUnitDelId(id); setTimeout(() => setUnitDelId(d => d === id ? null : d), 3000); return }
    await supabase.from('inventory_units').delete().eq('id', id)
    setUnitDelId(null); mutate()
  }
  const seedUnits = async () => {
    if (!restaurantId) return
    let order = units.length > 0 ? Math.max(...units.map(u => u.sort_order)) + 1 : 0
    const toInsert = DEFAULT_UNITS.filter(d => !units.find(u => u.abbreviation === d.abbreviation))
    if (!toInsert.length) return
    await supabase.from('inventory_units')
      .insert(toInsert.map(u => ({ restaurant_id: restaurantId, ...u, sort_order: order++ })))
    mutate()
  }

  // ── Item CRUD ─────────────────────────────────────────────
  const openItemAdd  = () => { setItemEditId(null); setItemForm(EMPTY_ITEM); setItemModal(true) }
  const openItemEdit = (it: InvItem) => {
    setItemEditId(it.id)
    setItemForm({ name: it.name, sku: it.sku ?? '', category_id: it.category_id, unit_id: it.unit_id,
      current_stock: it.current_stock, min_stock: it.min_stock, cost_price: it.cost_price, active: it.active })
    setItemModal(true)
  }
  const saveItem = async () => {
    if (!itemForm.name.trim() || !restaurantId) return
    setItemSaving(true)
    const payload = {
      name: itemForm.name.trim(), sku: itemForm.sku || null,
      category_id: itemForm.category_id, unit_id: itemForm.unit_id,
      current_stock: itemForm.current_stock, min_stock: itemForm.min_stock,
      cost_price: itemForm.cost_price, active: itemForm.active,
    }
    if (itemEditId) {
      await supabase.from('inventory_items').update(payload).eq('id', itemEditId)
    } else {
      const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0
      await supabase.from('inventory_items').insert({ restaurant_id: restaurantId, ...payload, sort_order: nextOrder })
    }
    setItemSaving(false); setItemModal(false); mutate()
  }
  const deleteItem = async (id: string) => {
    if (itemDelId !== id) { setItemDelId(id); setTimeout(() => setItemDelId(d => d === id ? null : d), 3000); return }
    await supabase.from('inventory_items').delete().eq('id', id)
    setItemDelId(null); mutate()
  }
  const toggleItem = async (it: InvItem) => {
    const v = !it.active
    setItems(is => is.map(i => i.id === it.id ? { ...i, active: v } : i)) // optimistic
    await supabase.from('inventory_items').update({ active: v }).eq('id', it.id)
  }


  // ── Derived ───────────────────────────────────────────────
  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (i.sku ?? '').toLowerCase().includes(itemSearch.toLowerCase())
  )
  const outCount  = items.filter(i => i.current_stock <= 0).length
  const lowCount  = items.filter(i => i.current_stock > 0 && i.current_stock <= i.min_stock).length
  const okCount   = items.filter(i => i.current_stock > i.min_stock).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <Package className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">{t.inv_title}</h1>
            <p className="text-xs text-white/40">{t.inv_subtitle}</p>
          </div>
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
            enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/8 text-white/30')}>
            {enabled ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl bg-white/4 border border-white/8 w-fit">
        {([
          { key: 'settings',   label: 'Settings',   icon: <Settings   className="w-4 h-4" /> },
          { key: 'items',      label: 'Items',       icon: <Archive    className="w-4 h-4" /> },
          { key: 'categories', label: 'Categories',  icon: <Tag        className="w-4 h-4" /> },
          { key: 'units',      label: 'Units',       icon: <Ruler      className="w-4 h-4" /> },
        ] as const).map(({ key, label, icon }) => (
          <button key={key} onClick={() => switchTab(key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              tab === key ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-white/50 hover:text-white/70')}>
            {icon}{label}
            {key === 'items' && items.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">{items.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ SETTINGS TAB ══ */}
      {tab === 'settings' && (
        <div className="space-y-5">

          {/* Master toggle card */}
          <div className={cn('p-5 rounded-2xl border transition-all', enabled
            ? 'bg-emerald-500/8 border-emerald-500/25'
            : 'bg-white/3 border-white/8')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
                  enabled ? 'bg-emerald-500/20' : 'bg-white/8')}>
                  <Package className={cn('w-5 h-5', enabled ? 'text-emerald-400' : 'text-white/30')} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Inventory Module</p>
                  <p className="text-xs text-white/40">Enable stock tracking for ingredients and supplies</p>
                </div>
              </div>
              <button onClick={() => setEnabled(e => !e)} className="active:scale-95 shrink-0">
                {enabled ? <ToggleRight className="w-8 h-8 text-emerald-400" /> : <ToggleLeft className="w-8 h-8 text-white/25" />}
              </button>
            </div>
          </div>

          {/* Sub-settings */}
          <div className={cn('rounded-2xl border divide-y divide-white/5 overflow-hidden transition-all',
            enabled ? 'bg-white/3 border-white/8' : 'bg-white/2 border-white/5 opacity-40 pointer-events-none')}>

            {/* Show on dashboard */}
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">Show on Dashboard</p>
                <p className="text-xs text-white/35 mt-0.5">Display Inventory shortcut in the dashboard bottom bar</p>
              </div>
              <button onClick={() => setShowOnDash(v => !v)} className="active:scale-95 shrink-0">
                {showOnDash ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
              </button>
            </div>

            {/* Auto deduct */}
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">Auto-Deduct on Sale</p>
                <p className="text-xs text-white/35 mt-0.5">Automatically reduce stock when a menu item is sold</p>
              </div>
              <button onClick={() => setAutoDeduct(v => !v)} className="active:scale-95 shrink-0">
                {autoDeduct ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
              </button>
            </div>

            {/* Low stock threshold */}
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">Low Stock Alert Threshold</p>
                <p className="text-xs text-white/35 mt-0.5">Warn when stock falls at or below this quantity</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setLowThreshold(v => Math.max(0, v - 1))}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/12 text-white/60 flex items-center justify-center text-lg active:scale-95">−</button>
                <span className="w-10 text-center text-sm font-bold text-white">{lowThreshold}</span>
                <button onClick={() => setLowThreshold(v => v + 1)}
                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/12 text-white/60 flex items-center justify-center text-lg active:scale-95">+</button>
              </div>
            </div>
          </div>

          {/* Stock summary */}
          {enabled && items.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t.inv_in_stock,    count: okCount,  color: 'emerald', icon: <ShoppingCart className="w-4 h-4" /> },
                { label: t.inv_low_stock,   count: lowCount, color: 'amber',   icon: <TrendingDown className="w-4 h-4" /> },
                { label: t.inv_out_of_stock,count: outCount, color: 'rose',    icon: <AlertTriangle className="w-4 h-4" /> },
              ].map(({ label, count, color, icon }) => (
                <div key={label} className={`p-4 rounded-2xl border bg-${color}-500/8 border-${color}-500/20`}>
                  <div className={`text-${color}-400 mb-2`}>{icon}</div>
                  <p className="text-2xl font-black text-white">{count}</p>
                  <p className="text-xs text-white/40 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Save button */}
          <button onClick={saveSettings} disabled={flagSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl active:scale-95 transition-all shadow-lg shadow-emerald-500/20">
            {flagSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : flagSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {flagSaved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ══ ITEMS TAB ══ */}
      {tab === 'items' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <Archive className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Inventory Items</h2>
                <p className="text-xs text-white/40">Ingredients, supplies and stock items</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{items.length}</span>
            </div>
            <button onClick={openItemAdd}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>

          {/* Search */}
          {items.length > 0 && (
            <input value={itemSearch} onChange={e => setItemSearch(e.target.value)}
              placeholder="Search by name or SKU…"
              className="w-full mb-4 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 transition-colors" />
          )}

          {/* Items list */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-20 text-white/25">
              <Archive className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{items.length === 0 ? 'No items yet' : 'No results'}</p>
              <p className="text-xs mt-1">Add ingredients, supplies and stock items</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map(it => {
                const cat  = categories.find(c => c.id === it.category_id)
                const unit = units.find(u => u.id === it.unit_id)
                return (
                  <div key={it.id} className={cn('flex items-center gap-4 p-4 rounded-2xl border transition-all',
                    it.active ? 'bg-white/5 border-white/10' : 'bg-white/2 border-white/5 opacity-50')}>

                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-emerald-400" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{it.name}</p>
                        {it.sku && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono">{it.sku}</span>}
                        <StockBadge current={it.current_stock} min={it.min_stock} labels={{ outOfStock: t.inv_out_of_stock, lowStock: t.inv_low_stock, inStock: t.inv_in_stock }} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-white/40">
                          <span className="font-semibold text-white/70">{it.current_stock}</span>
                          {unit ? ` ${unit.abbreviation}` : ''} in stock
                        </span>
                        <span className="text-xs text-white/25">min {it.min_stock}{unit ? ` ${unit.abbreviation}` : ''}</span>
                        {cat && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: cat.color + '22', color: cat.color }}>
                            <Tag className="w-2.5 h-2.5" />{cat.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <button onClick={() => toggleItem(it)} className="active:scale-95 shrink-0">
                      {it.active ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                    </button>
                    <button onClick={() => openItemEdit(it)}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteItem(it.id)}
                      className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                        itemDelId === it.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                      {itemDelId === it.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ CATEGORIES TAB ══ */}
      {tab === 'categories' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <Tag className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Categories</h2>
                <p className="text-xs text-white/40">Group inventory items by type</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{categories.length}</span>
            </div>
            <button onClick={openCatAdd}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
              <Plus className="w-4 h-4" /> Add Category
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="text-center py-20 text-white/25">
              <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No categories yet</p>
              <p className="text-xs mt-1">Add categories like "Beverages", "Produce", "Dairy"…</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map(c => (
                <div key={c.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: c.color + '22', border: `1.5px solid ${c.color}55` }}>
                    <Tag className="w-4 h-4" style={{ color: c.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <p className="text-xs text-white/35 mt-0.5">
                      {items.filter(i => i.category_id === c.id).length} items
                    </p>
                  </div>
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <button onClick={() => openCatEdit(c)}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteCat(c.id)}
                    className={cn('h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-xs font-medium shrink-0',
                      catDelId === c.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2' : 'w-8 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                    {catDelId === c.id ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ UNITS TAB ══ */}
      {tab === 'units' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <Ruler className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Units of Measurement</h2>
                <p className="text-xs text-white/40">kg, g, L, mL, pieces…</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{units.length}</span>
            </div>
            <div className="flex gap-2">
              {units.length === 0 && (
                <button onClick={seedUnits}
                  className="flex items-center gap-2 px-4 py-2 bg-white/8 hover:bg-white/12 text-white/70 text-sm font-medium rounded-xl active:scale-95 transition-all">
                  Import Defaults
                </button>
              )}
              <button onClick={openUnitAdd}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-all">
                <Plus className="w-4 h-4" /> Add Unit
              </button>
            </div>
          </div>

          {units.length === 0 ? (
            <div className="text-center py-20 text-white/25">
              <Ruler className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No units yet</p>
              <p className="text-xs mt-1">Click "Import Defaults" for kg, g, L, mL, pieces…</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {units.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-blue-400">{u.abbreviation}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                    <p className="text-xs text-white/35">{u.abbreviation}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openUnitEdit(u)}
                      className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteUnit(u.id)}
                      className={cn('h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 text-[10px] font-medium',
                        unitDelId === u.id ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5' : 'w-7 bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400')}>
                      {unitDelId === u.id ? 'Del?' : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ CATEGORY MODAL ══ */}
      {catModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{catEditId ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={() => setCatModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Name *</label>
                <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Beverages, Produce, Dairy…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-2 font-medium">Color</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button key={c} onClick={() => setCatForm(f => ({ ...f, color: c }))}
                      className="w-7 h-7 rounded-lg transition-all active:scale-95 flex items-center justify-center"
                      style={{ backgroundColor: c }}>
                      {catForm.color === c && <Check className="w-4 h-4 text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCatModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
              <button onClick={saveCat} disabled={!catForm.name.trim() || catSaving}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {catSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {catEditId ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ UNIT MODAL ══ */}
      {unitModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{unitEditId ? 'Edit Unit' : 'Add Unit'}</h2>
              <button onClick={() => setUnitModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Unit Name *</label>
                <input value={unitForm.name} onChange={e => setUnitForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Kilogram"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Abbreviation *</label>
                <input value={unitForm.abbreviation} onChange={e => setUnitForm(f => ({ ...f, abbreviation: e.target.value }))}
                  placeholder="kg"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setUnitModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
              <button onClick={saveUnit} disabled={!unitForm.name.trim() || !unitForm.abbreviation.trim() || unitSaving}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {unitSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {unitEditId ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ITEM MODAL ══ */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d1220]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">{itemEditId ? 'Edit Item' : 'Add Item'}</h2>
              <button onClick={() => setItemModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name + SKU */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Item Name *</label>
                  <input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Tomato, Olive Oil…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">SKU</label>
                  <input value={itemForm.sku ?? ''} onChange={e => setItemForm(f => ({ ...f, sku: e.target.value }))}
                    placeholder="TOM-001"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono" />
                </div>
              </div>

              {/* Category + Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Category</label>
                  <select value={itemForm.category_id ?? ''} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value || null }))}
                    className="w-full bg-[#0d1220] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors">
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Unit</label>
                  <select value={itemForm.unit_id ?? ''} onChange={e => setItemForm(f => ({ ...f, unit_id: e.target.value || null }))}
                    className="w-full bg-[#0d1220] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors">
                    <option value="">— None —</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
                  </select>
                </div>
              </div>

              {/* Stock + Min stock + Cost */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Current Stock</label>
                  <input type="number" min="0" step="0.01" value={itemForm.current_stock}
                    onChange={e => setItemForm(f => ({ ...f, current_stock: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Min Stock</label>
                  <input type="number" min="0" step="0.01" value={itemForm.min_stock}
                    onChange={e => setItemForm(f => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Cost Price</label>
                  <input type="number" min="0" step="0.01" value={itemForm.cost_price}
                    onChange={e => setItemForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
              </div>

              {/* Active */}
              <div className="flex items-center justify-between p-3 bg-white/3 rounded-xl">
                <span className="text-sm text-white/70">Active</span>
                <button onClick={() => setItemForm(f => ({ ...f, active: !f.active }))} className="active:scale-95">
                  {itemForm.active ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-white/25" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setItemModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Cancel</button>
              <button onClick={saveItem} disabled={!itemForm.name.trim() || itemSaving}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2">
                {itemSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {itemEditId ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
