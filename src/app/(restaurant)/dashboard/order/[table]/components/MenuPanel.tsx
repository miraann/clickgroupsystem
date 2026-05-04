'use client'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { DbCategory, DbMenuItem } from '../types'

const itemGridVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.15, ease: 'easeOut' } },
}

interface Props {
  mobilePanel:     'menu' | 'order'
  categories:      DbCategory[]
  activeCategory:  string
  onCategory:      (id: string) => void
  visible:         DbMenuItem[]
  draftQty:        (id: string) => number
  onItemTap:       (item: DbMenuItem) => void
  formatPrice:     (n: number) => string
}

export function MenuPanel({
  mobilePanel, categories, activeCategory, onCategory,
  visible, draftQty, onItemTap, formatPrice,
}: Props) {
  return (
    <div className={cn('flex-1 flex-col overflow-hidden', mobilePanel === 'menu' ? 'flex' : 'hidden sm:flex')}>
      {/* Category scroll */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-white/8"
        style={{ scrollbarWidth: 'none' }}
      >
        {categories.length === 0
          ? <p className="text-xs text-white/25 italic">No categories — add in Settings → Menu → Category</p>
          : categories.map(cat => (
            <button key={cat.id} onClick={() => onCategory(cat.id)}
              className={cn(
                'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 touch-manipulation whitespace-nowrap',
                activeCategory === cat.id
                  ? 'text-white shadow-lg'
                  : 'bg-white/5 border border-white/8 text-white/45 hover:bg-white/10 hover:text-white/70'
              )}
              style={activeCategory === cat.id ? { backgroundColor: cat.color, boxShadow: `0 4px 14px ${cat.color}40` } : {}}>
              {cat.name}
            </button>
          ))
        }
      </div>

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-white/25">No items in this category</p>
            <p className="text-xs text-white/15">Add items in Settings → Menu → Item</p>
          </div>
        ) : (
          <motion.div
            key={activeCategory}
            className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3"
            variants={itemGridVariants}
            initial="hidden"
            animate="visible"
          >
            {visible.map(item => {
              const qty = draftQty(item.id)
              return (
                <motion.div key={item.id} variants={itemVariants}>
                <button onClick={() => onItemTap(item)}
                  className={cn(
                    'relative w-full rounded-2xl border overflow-hidden text-left',
                    'transition-all duration-150 active:scale-95 touch-manipulation',
                    qty > 0
                      ? 'border-amber-500/50 shadow-xl shadow-amber-500/15 ring-1 ring-amber-500/25'
                      : 'border-white/8 hover:border-white/20 hover:shadow-lg hover:shadow-black/30'
                  )}
                  style={{ aspectRatio: '3/2' }}
                >
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} loading="lazy" decoding="async"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-white/3 to-transparent flex items-center justify-center">
                      <span className="text-5xl opacity-15 select-none">🍽</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/45" />
                  {qty > 0 && <div className="absolute inset-0 bg-amber-500/10" />}
                  {qty > 0 && (
                    <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center shadow-lg shadow-amber-500/50 tabular-nums z-10">
                      {qty}
                    </span>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-3 z-10">
                    <p className={cn('text-base sm:text-2xl font-bold leading-tight line-clamp-2 text-center drop-shadow-lg', qty > 0 ? 'text-white' : 'text-white/90')}>
                      {item.name}
                    </p>
                    <p className={cn('text-sm sm:text-2xl font-extrabold tabular-nums mt-1 drop-shadow-lg', qty > 0 ? 'text-amber-400' : 'text-amber-300/80')}>
                      {formatPrice(Number(item.price))}
                    </p>
                  </div>
                </button>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </div>
  )
}
