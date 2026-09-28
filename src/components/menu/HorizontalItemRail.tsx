'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface RailCategory { id: string; name: string; color: string; icon: string | null }

// How much of a prev / next category card must be on screen before we jump.
const EDGE_RATIO = 0.85

// Which ends of the row are reached. RTL scrollLeft runs negative, hence abs().
function scrollEdges(el: HTMLElement) {
  const pos = Math.abs(el.scrollLeft)
  return { start: pos < 2, end: pos + el.clientWidth >= el.scrollWidth - 2 }
}

/**
 * Sideways-swipe item row for the public guest / delivery menus
 * (item_style = 'carousel'). A "previous category" card sits before the
 * first item and a "next category" card after the last; swiping one of them
 * into view jumps to that category, so the whole menu can be browsed with
 * horizontal swipes alone. When the row already fits the screen (nothing to
 * scroll), a swipe, the arrows or a tap on those cards does the same.
 *
 * Mount it with key={categoryId} so scroll position and the swipe guard
 * reset on every category change.
 */
export default function HorizontalItemRail<T extends { id: string }>({
  items, prev, next, onPrev, onNext, accent, isDark, renderItem,
}: {
  items: T[]
  prev: RailCategory | null
  next: RailCategory | null
  onPrev: () => void
  onNext: () => void
  accent: string
  isDark: boolean
  renderItem: (item: T) => React.ReactNode
}) {
  const { t, isRTL } = useLanguage()
  const railRef   = useRef<HTMLDivElement>(null)
  const startRef  = useRef<HTMLButtonElement>(null)
  const endRef    = useRef<HTMLButtonElement>(null)
  const firstRef  = useRef<HTMLDivElement>(null)
  // Set by real input only (touch / wheel / pointer / arrows) — the
  // programmatic scroll on mount must not count as the guest swiping.
  const swiped    = useRef(false)
  const touch     = useRef<{ x: number; y: number; atStart: boolean; atEnd: boolean } | null>(null)
  const onPrevRef = useRef(onPrev)
  const onNextRef = useRef(onNext)
  useEffect(() => { onPrevRef.current = onPrev; onNextRef.current = onNext })
  const [edge, setEdge] = useState({ start: true, end: false })

  const readEdge = useCallback(() => {
    if (!railRef.current) return
    const { start, end } = scrollEdges(railRef.current)
    setEdge(e => (e.start === start && e.end === end ? e : { start, end }))
  }, [])
  const markSwiped = () => { swiped.current = true }

  // Open on the first item with the "previous" card tucked just off-screen,
  // so it only shows when the guest swipes back past the start.
  useLayoutEffect(() => {
    const rail = railRef.current, first = firstRef.current
    if (!rail || !first || !prev) return
    const r = rail.getBoundingClientRect(), f = first.getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(rail).scrollPaddingInlineStart) || 0
    rail.scrollBy({ left: isRTL ? f.right - (r.right - pad) : f.left - (r.left + pad) })
  }, [prev, isRTL])

  // ResizeObserver also reports once on observe, which seeds `edge`.
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const ro = new ResizeObserver(readEdge)
    ro.observe(rail)
    return () => ro.disconnect()
  }, [readEdge])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const targets = new Map<Element, () => void>()
    if (startRef.current) targets.set(startRef.current, () => onPrevRef.current())
    if (endRef.current)   targets.set(endRef.current,   () => onNextRef.current())
    if (targets.size === 0) return
    const timers = new Map<Element, ReturnType<typeof setTimeout>>()
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        clearTimeout(timers.get(e.target))
        // Only jump after a real swipe — a short category whose edge cards are
        // visible straight away must not skip on its own. The small delay lets
        // the guest see where they're going and cancel by swiping back.
        if (e.intersectionRatio >= EDGE_RATIO && swiped.current) {
          timers.set(e.target, setTimeout(targets.get(e.target)!, 350))
        }
      }
    }, { root: rail, threshold: [0, EDGE_RATIO, 1] })
    targets.forEach((_, el) => io.observe(el))
    return () => { io.disconnect(); timers.forEach(clearTimeout) }
  }, [prev, next])

  const onTouchStart = (e: React.TouchEvent) => {
    markSwiped()
    if (!railRef.current) return
    const { start, end } = scrollEdges(railRef.current)
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, atStart: start, atEnd: end }
  }
  // A swipe that starts with the row already at that end can't scroll, so it
  // would never reach the observer — treat it as prev / next category.
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current
    touch.current = null
    if (!s) return
    const dx = e.changedTouches[0].clientX - s.x
    const dy = e.changedTouches[0].clientY - s.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
    const forward = isRTL ? dx > 0 : dx < 0
    if (forward && s.atEnd && next) onNext()
    else if (!forward && s.atStart && prev) onPrev()
  }

  // Mouse users can't swipe sideways — give them arrows. Scrolling forward
  // means negative scrollLeft in RTL.
  const step = (dir: 1 | -1) => {
    const rail = railRef.current
    if (!rail) return
    markSwiped()
    rail.scrollBy({ left: dir * (isRTL ? -1 : 1) * rail.clientWidth * 0.7, behavior: 'smooth' })
  }
  const BackIcon    = isRTL ? ChevronRight : ChevronLeft
  const ForwardIcon = isRTL ? ChevronLeft  : ChevronRight
  const arrowCls = 'hidden pointer-fine:flex absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full items-center justify-center shadow-lg active:scale-90 transition-transform'
  const arrowStyle = { background: isDark ? 'rgba(20,24,34,0.85)' : 'rgba(255,255,255,0.95)', color: accent }

  const edgeCard = (cat: RailCategory, side: 'prev' | 'next') => {
    const label = side === 'prev' ? t.gm_prev_category : t.gm_next_category
    const Icon  = side === 'prev' ? BackIcon : ForwardIcon
    return (
      <button
        ref={side === 'prev' ? startRef : endRef}
        onClick={side === 'prev' ? onPrev : onNext}
        aria-label={`${label}: ${cat.name}`}
        className={`${side === 'prev' ? 'snap-start' : 'snap-end'} shrink-0 w-28 sm:w-36 rounded-2xl flex flex-col items-center justify-center gap-2 px-2 active:scale-95 transition-transform`}
        style={{ border: `2px dashed ${accent}66`, background: `${accent}0d` }}
      >
        <span className="w-12 h-12 rounded-full flex items-center justify-center shadow" style={{ background: cat.color }}>
          {cat.icon
            ? <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{cat.icon}</span>
            : <span className="text-white text-lg font-bold">{cat.name.charAt(0).toUpperCase()}</span>}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : '#9ca3af' }}>
          {label}
        </span>
        <span className="text-xs font-bold text-center line-clamp-2 leading-tight" style={{ color: accent }}>{cat.name}</span>
        <Icon className="w-4 h-4 animate-pulse" style={{ color: accent }} />
      </button>
    )
  }

  return (
    <motion.div className="relative -mx-4"
      initial={{ opacity: 0, x: isRTL ? -32 : 32 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
      <div
        ref={railRef}
        onScroll={readEdge}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onWheel={markSwiped}
        onPointerDown={markSwiped}
        className="scroll-hide flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 px-4 py-1"
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {prev && edgeCard(prev, 'prev')}
        {items.map((item, i) => (
          <div key={item.id} ref={i === 0 ? firstRef : undefined} className="snap-start shrink-0 w-[72%] sm:w-64 lg:w-72 flex">
            {renderItem(item)}
          </div>
        ))}
        {next && edgeCard(next, 'next')}
      </div>
      {(!edge.start || prev) && (
        <button onClick={() => (edge.start ? onPrev() : step(-1))} aria-label={t.gm_prev_category} className={`${arrowCls} start-2`} style={arrowStyle}>
          <BackIcon className="w-5 h-5" />
        </button>
      )}
      {(!edge.end || next) && (
        <button onClick={() => (edge.end ? onNext() : step(1))} aria-label={t.gm_next_category} className={`${arrowCls} end-2`} style={arrowStyle}>
          <ForwardIcon className="w-5 h-5" />
        </button>
      )}
    </motion.div>
  )
}
