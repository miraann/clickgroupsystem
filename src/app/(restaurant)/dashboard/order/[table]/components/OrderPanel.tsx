'use client'
import { ShoppingBag, ChefHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DraftRow } from './DraftRow'
import { SentRow } from './SentRow'
import type { DbOrderItem, DbMenuItem, DraftEntry } from '../types'

interface Props {
  activeTab:    'ordering' | 'ordered'
  setActiveTab: (t: 'ordering' | 'ordered') => void
  mobilePanel:  'menu' | 'order'
  draft:        Map<string, DraftEntry>
  draftEntries: { item: DbMenuItem; entry: DraftEntry }[]
  draftTotal:   number
  sentItems:    DbOrderItem[]
  sentTotal:    number
  formatPrice:  (n: number) => string
  onQty:        (itemId: string, delta: number) => void
  onRemove:     (itemId: string, qty: number) => void
  onEdit:       (itemId: string) => void
  onAction:     (item: DbOrderItem) => void
}

export function OrderPanel({
  activeTab, setActiveTab, mobilePanel,
  draft, draftEntries, draftTotal,
  sentItems, sentTotal,
  formatPrice, onQty, onRemove, onEdit, onAction,
}: Props) {
  return (
    <div className={cn(
      'shrink-0 flex-col border-r border-white/8 bg-white/[0.01]',
      mobilePanel === 'order' ? 'flex w-full sm:w-80 xl:w-96' : 'hidden sm:flex sm:w-80 xl:w-96'
    )}>
      {/* Tabs */}
      <div className="shrink-0 flex border-b border-white/8">
        {(['ordering', 'ordered'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn('flex-1 py-3.5 text-xs font-bold uppercase tracking-wider transition-all relative touch-manipulation',
              activeTab === tab ? 'text-amber-400' : 'text-white/25 hover:text-white/45')}>
            <span className="flex items-center justify-center gap-1.5">
              {tab === 'ordering' ? 'Ordering' : 'Ordered'}
              {tab === 'ordering' && draft.size > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold tabular-nums">
                  {draftEntries.reduce((s, o) => s + o.entry.qty, 0)}
                </span>
              )}
              {tab === 'ordered' && sentItems.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold tabular-nums">
                  {sentItems.reduce((s, i) => s + i.qty, 0)}
                </span>
              )}
            </span>
            {activeTab === tab && <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-amber-500 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'ordering' ? (
          draftEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 pb-10">
              <div className="w-16 h-16 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                <ShoppingBag className="w-7 h-7 text-white/15" />
              </div>
              <p className="text-sm text-white/25">No items yet</p>
              <p className="text-xs text-white/15">Tap items from the menu</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {draftEntries.map(({ item, entry }) => (
                <DraftRow
                  key={item.id}
                  item={item}
                  entry={entry}
                  onQty={d => onQty(item.id, d)}
                  onRemove={() => onRemove(item.id, entry.qty)}
                  onEdit={() => onEdit(item.id)}
                  formatPrice={formatPrice}
                />
              ))}
            </div>
          )
        ) : (
          sentItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 pb-10">
              <div className="w-16 h-16 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                <ChefHat className="w-7 h-7 text-white/15" />
              </div>
              <p className="text-sm text-white/25">Nothing sent to kitchen</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {sentItems.map(i => (
                <SentRow key={i.id} item={i} onAction={() => onAction(i)} formatPrice={formatPrice} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Subtotal strip */}
      {activeTab === 'ordering' && draftEntries.length > 0 && (
        <div className="shrink-0 px-4 py-3 border-t border-white/8 flex items-center justify-between">
          <span className="text-xs text-white/30">{draftEntries.reduce((s, o) => s + o.entry.qty, 0)} items</span>
          <span className="text-sm font-bold text-white/60 tabular-nums">{formatPrice(draftTotal)}</span>
        </div>
      )}
      {activeTab === 'ordered' && sentItems.length > 0 && (
        <div className="shrink-0 px-4 py-3 border-t border-white/8 flex items-center justify-between">
          <span className="text-xs text-white/30">
            {sentItems.filter(i => i.status === 'ready').length > 0 ? `${sentItems.filter(i => i.status === 'ready').length} ready · ` : ''}
            {sentItems.filter(i => i.status === 'cooking').length > 0 ? `${sentItems.filter(i => i.status === 'cooking').length} cooking · ` : ''}
            {sentItems.filter(i => i.status === 'sent').length} in queue
          </span>
          <span className="text-sm font-bold text-white/60 tabular-nums">{formatPrice(sentTotal)}</span>
        </div>
      )}
    </div>
  )
}
