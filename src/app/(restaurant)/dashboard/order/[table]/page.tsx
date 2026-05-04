'use client'
import { useState, useEffect, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import dynamic from 'next/dynamic'

import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { usePermissions } from '@/lib/permissions/PermissionsContext'

import { useOrderState } from './useOrderState'
import { OrderHeader }      from './components/OrderHeader'
import { OrderPanel }       from './components/OrderPanel'
import { MenuPanel }        from './components/MenuPanel'
import { BottomBar }        from './components/BottomBar'
import { GuestEditModal }   from './components/GuestEditModal'
import { OrderedItemModal } from './components/OrderedItemModal'
import { ItemModal }        from './components/ItemModal'

const PaymentScreen = dynamic(() => import('@/components/restaurant/payment-screen'), { ssr: false })

function OrderPage() {
  const { table }      = useParams<{ table: string }>()
  const searchParams   = useSearchParams()
  const router         = useRouter()
  const { formatPrice } = useDefaultCurrency()
  const { can, isOwner } = usePermissions()
  const p = (key: string) => isOwner || can(key)

  // ── URL-derived context ───────────────────────────────────────
  const isTakeout      = searchParams.get('source') === 'takeout'
  const takeoutName    = searchParams.get('name') ?? null
  const takeoutPhone   = searchParams.get('phone') ?? null
  const guestCountParam = parseInt(searchParams.get('guests') ?? '0')
  const showPayment    = searchParams.get('screen') === 'payment'

  // ── Guest count (URL-synced, written back to DB via hook) ─────
  const [guestCount, setGuestCount]       = useState(guestCountParam)
  const [showGuestEdit, setShowGuestEdit] = useState(false)
  const [guestDraft, setGuestDraft]       = useState(guestCountParam)

  // ── Mobile layout ─────────────────────────────────────────────
  const [mobilePanel, setMobilePanel] = useState<'menu' | 'order'>('menu')

  // ── Master hook ───────────────────────────────────────────────
  const order = useOrderState(table, guestCount)

  // ── Save guest count ─────────────────────────────────────────
  const saveGuestCount = async (count: number) => {
    setGuestCount(count)
    setShowGuestEdit(false)
    router.replace(`/dashboard/order/${table}?guests=${count}`, { scroll: false })
    await order.updateGuestInDb(count)
  }

  // ── Entrance animation ────────────────────────────────────────
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(t) }, [])

  if (order.loading) return null

  if (order.initError) return (
    <div className="flex items-center justify-center h-screen bg-[#022658] p-6">
      <div className="max-w-sm w-full p-5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400" />
        <p className="text-sm text-rose-400 font-semibold">Failed to open order</p>
        <p className="text-xs text-white/40">{order.initError}</p>
        <button onClick={order.init} className="mt-1 px-4 py-2 rounded-xl bg-white/8 text-xs text-white/50 hover:bg-white/12 active:scale-95 transition-all">Retry</button>
      </div>
    </div>
  )

  return (
    <div
      className="flex flex-col h-screen bg-[#022658] overflow-hidden transition-all duration-300"
      style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(6px)' }}
    >

      <OrderHeader
        table={table}
        isTakeout={isTakeout}
        takeoutName={takeoutName}
        takeoutPhone={takeoutPhone}
        orderId={order.orderId}
        guestCount={guestCount}
        grandTotal={order.grandTotal}
        formatPrice={formatPrice}
        canGuestEdit={p('dashboard.order.guest_edit')}
        onGuestEdit={() => { setGuestDraft(guestCount); setShowGuestEdit(true) }}
      />

      <div className="flex flex-1 overflow-hidden">
        <OrderPanel
          activeTab={order.activeTab}
          setActiveTab={order.setActiveTab}
          mobilePanel={mobilePanel}
          draft={order.draft}
          draftEntries={order.draftEntries}
          draftTotal={order.draftTotal}
          sentItems={order.sentItems}
          sentTotal={order.sentTotal}
          formatPrice={formatPrice}
          onQty={(id, d) => order.draftChange(id, d)}
          onRemove={(id, qty) => order.draftChange(id, -qty)}
          onEdit={id => order.setEditingId(id)}
          onAction={item => order.setActionItem(item)}
        />

        <MenuPanel
          mobilePanel={mobilePanel}
          categories={order.categories}
          activeCategory={order.activeCategory}
          onCategory={order.setActiveCategory}
          visible={order.visible}
          draftQty={order.draftQty}
          onItemTap={order.draftAdd}
          formatPrice={formatPrice}
        />
      </div>

      <BottomBar
        table={table}
        isTakeout={isTakeout}
        guestCount={guestCount}
        grandTotal={order.grandTotal}
        sentTotal={order.sentTotal}
        draftSize={order.draft.size}
        sentCount={order.sentItems.length}
        sending={order.sending}
        sendError={order.sendError}
        mobilePanel={mobilePanel}
        setMobilePanel={setMobilePanel}
        restaurantId={order.restaurantId}
        supabase={order.supabase}
        formatPrice={formatPrice}
        canCfd={!!order.restaurantId && p('dashboard.cfd_order')}
        canPay={p('dashboard.pay')}
        canSend={p('dashboard.order.send_kitchen')}
        onSend={order.handleSend}
        onPay={() => {
          const url = new URL(window.location.href)
          url.searchParams.set('screen', 'payment')
          router.push(url.pathname + url.search)
        }}
      />

      {/* ── Modals ── */}

      {showGuestEdit && (
        <GuestEditModal
          table={table}
          guestCount={guestCount}
          guestDraft={guestDraft}
          onKey={k => {
            if (k === '⌫') { setGuestDraft(v => Math.floor(v / 10)); return }
            const next = guestDraft * 10 + parseInt(k)
            if (next > 99) return
            setGuestDraft(next)
          }}
          onConfirm={() => saveGuestCount(guestDraft)}
          onClose={() => setShowGuestEdit(false)}
        />
      )}

      {order.actionItem && (
        <OrderedItemModal
          item={order.actionItem}
          restaurantId={order.restaurantId!}
          currentTable={table}
          supabase={order.supabase}
          formatPrice={formatPrice}
          onVoid={reason => { order.voidItem(order.actionItem!.id, reason); order.setActionItem(null) }}
          onPriceChange={newPrice => {
            order.supabase.from('order_items')
              .update({ item_price: newPrice, updated_at: new Date().toISOString() })
              .eq('id', order.actionItem!.id)
              .then(() => {
                order.setDbItems(prev => prev.map(i => i.id === order.actionItem!.id ? { ...i, item_price: newPrice } : i))
                order.setActionItem(null)
              })
          }}
          onDiscount={discountedPrice => {
            order.supabase.from('order_items')
              .update({ item_price: discountedPrice, updated_at: new Date().toISOString() })
              .eq('id', order.actionItem!.id)
              .then(() => {
                order.setDbItems(prev => prev.map(i => i.id === order.actionItem!.id ? { ...i, item_price: discountedPrice } : i))
                order.setActionItem(null)
              })
          }}
          onTransferred={() => { order.setDbItems(prev => prev.filter(i => i.id !== order.actionItem!.id)); order.setActionItem(null) }}
          onClose={() => order.setActionItem(null)}
        />
      )}

      {order.editingId && (() => {
        const item  = order.menuItems.find(m => m.id === order.editingId)
        const entry = order.draft.get(order.editingId!)
        if (!item || !entry) return null
        const capturedId = order.editingId
        return (
          <ItemModal
            item={item}
            entry={entry}
            kitchenNotes={order.kitchenNotes}
            supabase={order.supabase}
            formatPrice={formatPrice}
            sending={order.sending}
            onConfirm={e => { order.draftSet(capturedId, e); order.setEditingId(null) }}
            onConfirmAndSend={async e => {
              const ok = await order.sendSingleItem(item, e)
              if (ok) order.setEditingId(null)
            }}
            onClose={() => order.setEditingId(null)}
          />
        )
      })()}

      {showPayment && order.orderId && order.restaurantId && (
        <PaymentScreen
          orderId={order.orderId}
          restaurantId={order.restaurantId}
          tableNum={isTakeout ? 'Takeout' : table}
          guests={guestCount}
          items={order.sentItems.map(i => ({ name: i.item_name, price: i.item_price, qty: i.qty }))}
          total={order.grandTotal}
          onClose={() => window.history.back()}
          onPaid={() => {
            if (order.restaurantId) {
              order.supabase.channel(`cfd-sync-${order.restaurantId}`)
                .send({ type: 'broadcast', event: 'table_change', payload: { table: 'idle' } })
                .catch(() => {})
            }
            window.location.href = '/dashboard'
          }}
        />
      )}
    </div>
  )
}

export default function OrderPageWrapper() { return <Suspense><OrderPage /></Suspense> }
