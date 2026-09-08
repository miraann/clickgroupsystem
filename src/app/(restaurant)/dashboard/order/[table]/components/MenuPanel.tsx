'use client'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { DbCategory, DbMenuItem } from '../types'

const itemGridVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.012 } },
}
const itemVariants = {
  hidden:  { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.12, ease: 'easeOut' as const } },
}

interface Props {
  mobilePanel:     'menu' | 'order'
  categories:      DbCategory[]
  activeCategory:  string
  onCategory:      (id: string) => void
  visible:         DbMenuItem[]
  draftQty:        (id: string) => number
  loading?:        boolean
  onItemTap:       (item: DbMenuItem) => void
  formatPrice:     (n: number) => string
}

export function MenuPanel({
  mobilePanel, categories, activeCategory, onCategory,
  visible, draftQty, loading, onItemTap, formatPrice,
}: Props) {
  const { t: tr } = useLanguage()

  // First-ever menu load (nothing cached yet) — light shimmer grid.
  if (loading && categories.length === 0) {
    return (
      <div className={cn('flex-1 flex-col overflow-hidden', mobilePanel === 'menu' ? 'flex' : 'hidden sm:flex')}>
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-24 rounded-xl skeleton-shimmer" />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-2xl skeleton-shimmer" style={{ aspectRatio: '4/3' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex-1 flex-col overflow-hidden', mobilePanel === 'menu' ? 'flex' : 'hidden sm:flex')}>
      {/* Category scroll */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-white/8"
        style={{ scrollbarWidth: 'none' }}
      >
        {categories.length === 0
          ? <p className="text-xs text-white/25 italic">{tr.ord_no_categories}</p>
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
            <p className="text-sm text-white/25">{tr.ord_no_items_cat}</p>
            <p className="text-xs text-white/15">{tr.ord_add_items_hint}</p>
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
                    'group w-full rounded-2xl border overflow-hidden text-start flex flex-col',
                    'transition-all duration-150 active:scale-95 touch-manipulation',
                    qty > 0
                      ? 'border-amber-500/50 bg-amber-500/[0.06] shadow-xl shadow-amber-500/15 ring-1 ring-amber-500/25'
                      : 'border-white/8 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-black/30'
                  )}
                >
                  {/* Image — 16:9 */}
                  <div className="relative w-full aspect-video overflow-hidden bg-white/[0.04]">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} loading="lazy" decoding="async"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-white/3 to-transparent flex items-center justify-center">
                        <span className="text-4xl opacity-15 select-none">🍽</span>
                      </div>
                    )}
                    {qty > 0 && (
                      <span className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center shadow-lg shadow-amber-500/50 tabular-nums">
                        {qty}
                      </span>
                    )}
                  </div>

                  {/* Name + price */}
                  <div className="flex flex-col items-center p-2.5 sm:p-3 text-center">
                    <p className={cn('text-sm sm:text-base font-bold leading-snug line-clamp-2', qty > 0 ? 'text-white' : 'text-white/90')}>
                      {item.name}
                    </p>
                    <span className="my-1.5 h-0.5 w-10 rounded-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
                    <p className={cn('text-sm sm:text-lg font-extrabold tabular-nums', qty > 0 ? 'text-amber-400' : 'text-amber-300/90')}>
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
