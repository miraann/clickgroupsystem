'use client'
import { useState, useEffect } from 'react'
import { X, Trash2, Tag, ArrowRightLeft, DollarSign, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/logAudit'
import type { DbOrderItem } from '../types'

interface Props {
  item:           DbOrderItem
  restaurantId:   string
  currentTable:   string
  supabase:       ReturnType<typeof createClient>
  formatPrice:    (n: number) => string
  onVoid:         (reason: string) => void
  onPriceChange:  (p: number) => void
  onDiscount:     (p: number) => void
  onTransferred:  () => void
  onClose:        () => void
}

type View = 'menu' | 'void' | 'discount' | 'transfer' | 'price'

export function OrderedItemModal({
  item, restaurantId, currentTable, supabase, formatPrice,
  onVoid, onPriceChange, onDiscount, onTransferred, onClose,
}: Props) {
  const { can, isOwner } = usePermissions()
  const ap = (key: string) => isOwner || can(key)

  const [view, setView]                     = useState<View>('menu')
  const [discountType, setDiscountType]     = useState<'pct' | 'fixed'>('pct')
  const [discountVal, setDiscountVal]       = useState('')
  const [newPrice, setNewPrice]             = useState(String(item.item_price))
  const [targetTable, setTargetTable]       = useState('')
  const [working, setWorking]               = useState(false)
  const [err, setErr]                       = useState<string | null>(null)
  const [voidReasons, setVoidReasons]       = useState<{ id: string; text: string }[]>([])
  const [loadingReasons, setLoadingReasons] = useState(false)
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null)
  const [customReason, setCustomReason]     = useState('')

  useEffect(() => {
    if (view !== 'void') return
    setLoadingReasons(true)
    supabase.from('void_reasons').select('id,text').eq('restaurant_id', restaurantId).eq('active', true).order('sort_order')
      .then(({ data }) => { setVoidReasons((data ?? []) as { id: string; text: string }[]); setLoadingReasons(false) })
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  const voidReasonText = selectedReasonId
    ? (voidReasons.find(r => r.id === selectedReasonId)?.text ?? '')
    : customReason.trim()
  const canVoid       = voidReasonText.length > 0
  const originalTotal = item.item_price * item.qty

  const discountedPrice = (() => {
    const v = parseFloat(discountVal) || 0
    if (discountType === 'pct') return Math.max(0, item.item_price - item.item_price * (v / 100))
    return Math.max(0, item.item_price - v / item.qty)
  })()

  const handleTransfer = async () => {
    const tbl = parseInt(targetTable)
    if (!tbl || tbl === parseInt(currentTable)) { setErr('Enter a different table number'); return }
    setWorking(true); setErr(null)

    const { data: existing } = await supabase
      .from('orders').select('id').eq('restaurant_id', restaurantId).eq('table_number', tbl).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    let targetOrderId = existing?.id
    if (!targetOrderId) {
      const { data: newOrder, error } = await supabase
        .from('orders').insert({ restaurant_id: restaurantId, table_number: tbl, status: 'active', total: 0 }).select('id').single()
      if (error) { setErr(error.message); setWorking(false); return }
      targetOrderId = newOrder.id
    }

    const { error } = await supabase.from('order_items').update({ order_id: targetOrderId }).eq('id', item.id)
    if (error) { setErr(error.message); setWorking(false); return }

    const { data: srcOrder } = await supabase
      .from('orders').select('id').eq('restaurant_id', restaurantId).eq('table_number', parseInt(currentTable)).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (srcOrder?.id) {
      const { count } = await supabase
        .from('order_items').select('id', { count: 'exact', head: true })
        .eq('order_id', srcOrder.id).neq('status', 'void')
      if ((count ?? 0) === 0) {
        await supabase.from('orders').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', srcOrder.id)
      }
    }
    logAudit(restaurantId, 'transfer_item', { item_name: item.item_name, qty: item.qty, from_table: currentTable, to_table: targetTable }, item.id)
    setWorking(false)
    onTransferred()
  }

  const actions = [
    { id: 'void'     as View, icon: <Trash2 className="w-6 h-6" />,        label: 'Void',     sub: 'Remove item',          color: 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/18',        perm: 'dashboard.void'          },
    { id: 'discount' as View, icon: <Tag className="w-6 h-6" />,            label: 'Discount', sub: 'Apply item discount',   color: 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/18',   perm: 'dashboard.item_discount' },
    { id: 'transfer' as View, icon: <ArrowRightLeft className="w-6 h-6" />, label: 'Transfer', sub: 'Move to another table', color: 'border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/18',       perm: 'dashboard.transfer'      },
    { id: 'price'    as View, icon: <DollarSign className="w-6 h-6" />,     label: 'Price',    sub: 'Change item price',     color: 'border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/18', perm: 'dashboard.price'        },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#0d1220]/98 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl overflow-hidden">

        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/8">
          <div>
            <p className="text-base font-semibold text-white leading-tight">{item.item_name}</p>
            <p className="text-xs text-white/40 mt-0.5">×{item.qty} · <span className="text-emerald-400">{formatPrice(originalTotal)}</span></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {view === 'menu' && (
            <div className="grid grid-cols-2 gap-3">
              {actions.filter(a => ap(a.perm)).map(a => (
                <button key={a.id} onClick={() => setView(a.id)}
                  className={cn('flex flex-col items-center justify-center gap-2 py-5 rounded-2xl border transition-all active:scale-95', a.color)}>
                  {a.icon}
                  <div className="text-center">
                    <p className="text-sm font-semibold">{a.label}</p>
                    <p className="text-[10px] opacity-60 mt-0.5">{a.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {view === 'void' && (
            <div className="space-y-4">
              <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">Select void reason <span className="text-rose-400">*</span></p>
              {loadingReasons ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-white/30 animate-spin" /></div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {voidReasons.map(r => (
                    <button key={r.id} onClick={() => { setSelectedReasonId(r.id); setCustomReason('') }}
                      className={cn('px-3 py-1.5 rounded-xl text-xs font-medium border transition-all active:scale-95',
                        selectedReasonId === r.id
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                          : 'bg-white/5 border-white/10 text-white/45 hover:bg-white/8 hover:text-white/70')}>
                      {r.text}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Or write custom reason</label>
                <input value={customReason} onChange={e => { setCustomReason(e.target.value); setSelectedReasonId(null) }}
                  placeholder="Custom reason…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/50 transition-colors" />
              </div>
              {!canVoid && <p className="text-xs text-rose-400/70">A void reason is required.</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('menu')} className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95">Back</button>
                <button onClick={() => { if (!canVoid) return; logAudit(restaurantId, 'void_item', { item_name: item.item_name, qty: item.qty, price: item.item_price, reason: voidReasonText, table: currentTable }, item.id); onVoid(voidReasonText) }} disabled={!canVoid}
                  className="py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-400 text-sm font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                  Void Item
                </button>
              </div>
            </div>
          )}

          {view === 'discount' && (
            <div className="space-y-4">
              <div className="flex rounded-xl bg-white/5 p-1 gap-1">
                {(['pct', 'fixed'] as const).map(t => (
                  <button key={t} onClick={() => setDiscountType(t)}
                    className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all', discountType === t ? 'bg-amber-500 text-white' : 'text-white/40 hover:text-white/70')}>
                    {t === 'pct' ? 'Percentage %' : 'Fixed $'}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">{discountType === 'pct' ? 'Discount %' : 'Discount amount ($)'}</label>
                <input type="number" min="0" value={discountVal} onChange={e => setDiscountVal(e.target.value)} placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
              </div>
              {discountVal && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                  <span className="text-xs text-white/40">New price per item</span>
                  <span className="text-sm font-bold text-amber-400">{formatPrice(discountedPrice)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('menu')} className="py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium transition-all active:scale-95">Back</button>
                <button onClick={() => { logAudit(restaurantId, 'apply_discount', { item_name: item.item_name, qty: item.qty, original_price: item.item_price, discounted_price: discountedPrice, discount_type: discountType, discount_val: discountVal, table: currentTable }, item.id); onDiscount(discountedPrice) }} disabled={!discountVal}
                  className="py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition-all active:scale-95">Apply</button>
              </div>
            </div>
          )}

          {view === 'transfer' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Target table number</label>
                <input type="number" min="1" value={targetTable} onChange={e => { setTargetTable(e.target.value); setErr(null) }} placeholder="e.g. 5"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              {err && <p className="text-xs text-rose-400">{err}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('menu')} className="py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium transition-all active:scale-95">Back</button>
                <button onClick={handleTransfer} disabled={!targetTable || working}
                  className="py-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2">
                  {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  Transfer
                </button>
              </div>
            </div>
          )}

          {view === 'price' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">New price per item ($)</label>
                <input type="number" min="0" step="0.5" value={newPrice} onChange={e => setNewPrice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors" />
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                <span className="text-xs text-white/40">New line total</span>
                <span className="text-sm font-bold text-violet-400">{formatPrice((parseFloat(newPrice) || 0) * item.qty)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('menu')} className="py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium transition-all active:scale-95">Back</button>
                <button onClick={() => { logAudit(restaurantId, 'edit_price', { item_name: item.item_name, qty: item.qty, old_price: item.item_price, new_price: parseFloat(newPrice) || 0, table: currentTable }, item.id); onPriceChange(parseFloat(newPrice) || 0) }} disabled={!newPrice}
                  className="py-3 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-400 text-sm font-semibold transition-all active:scale-95">Save Price</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
