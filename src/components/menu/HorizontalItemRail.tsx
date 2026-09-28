'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface RailCategory { id: string; name: string; color: string; icon: string | null }
type Side = 'prev' | 'next'

// How far past an end the guest must keep dragging (touch) or scrolling
// (trackpad / shift+wheel) before we switch category. Merely reaching the
// end — or a fling that runs into it — never switches.
const PULL_PX  = 90
const WHEEL_PX = 300
// A pause this long between wheel events starts a new wheel gesture.
const WHEEL_GAP_MS = 300

// Which ends of the row are reached. RTL scrollLeft runs negative, hence abs().
function scrollEdges(el: HTMLElement) {
  const pos = Math.abs(el.scrollLeft)
  return { start: pos < 2, end: pos + el.clientWidth >= el.scrollWidth - 2 }
}

/**
 * Sideways-swipe item row for the public guest / delivery menus
 * (item_style = 'carousel'). A "previous category" card sits before the
 * first item and a "next category" card after the last. Pulling hard past
 * either end — or tapping those cards / the arrows — opens that category,
 * so the whole menu can be browsed sideways. The card fills up while the
 * guest pulls so they can see how far to go.
 *
 * Mount it with key={categoryId} so scroll position and gesture state reset
 * on every category change.
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
  const railRef  = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const endRef   = useRef<HTMLButtonElement>(null)
  const firstRef = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number; lastX: number; axis: 'x' | 'y' | null; side: Side | null; originX: number; progress: number } | null>(null)
  const wheel = useRef<{ last: number; sum: number; side: Side | null; timer?: ReturnType<typeof setTimeout> }>({ last: 0, sum: 0, side: null })
  const [edge, setEdge] = useState({ start: true, end: false })

  const readEdge = useCallback(() => {
    if (!railRef.current) return
    const { start, end } = scrollEdges(railRef.current)
    setEdge(e => (e.start === start && e.end === end ? e : { start, end }))
  }, [])

  // Open on the first item with the "previous" card tucked just off-screen.
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

  // Treat mount as mid-gesture, so trackpad momentum from the swipe that
  // switched category can't carry straight on into the one after.
  useEffect(() => {
    const w = wheel.current
    w.last = performance.now()
    return () => clearTimeout(w.timer)
  }, [])

  const go = (side: Side) => (side === 'prev' ? onPrev() : onNext())

  // Pull progress (0..1) drives the edge card's fill and bar through a CSS
  // variable, so dragging doesn't re-render the whole row.
  const setPull = (side: Side, p: number) => {
    const el = side === 'prev' ? startRef.current : endRef.current
    el?.style.setProperty('--pull', String(Math.min(1, Math.max(0, p))))
  }

  // Scroll delta → how far it moves toward the row's end (RTL flips it).
  const forwardOf = (d: number) => (isRTL ? -d : d)

  const onTouchStart = (e: React.TouchEvent) => {
    const x = e.touches[0].clientX, y = e.touches[0].clientY
    touch.current = { x, y, lastX: x, axis: null, side: null, originX: x, progress: 0 }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const g = touch.current, rail = railRef.current
    if (!g || !rail) return
    const x = e.touches[0].clientX, y = e.touches[0].clientY
    if (!g.axis) {
      if (Math.abs(x - g.x) < 8 && Math.abs(y - g.y) < 8) return
      g.axis = Math.abs(x - g.x) > Math.abs(y - g.y) ? 'x' : 'y'
    }
    if (g.axis !== 'x') return
    const push = forwardOf(g.lastX - x)   // > 0: finger pushing toward the end
    g.lastX = x
    if (!g.side) {
      // The pull only starts once the row can't scroll any further that way.
      const { start, end } = scrollEdges(rail)
      if (push > 0 && end && next) g.side = 'next'
      else if (push < 0 && start && prev) g.side = 'prev'
      else return
      g.originX = x
      return
    }
    const pulled = forwardOf(g.originX - x) * (g.side === 'next' ? 1 : -1)
    if (pulled < -12) { setPull(g.side, 0); g.side = null; return }   // turned back: plain scrolling again
    g.progress = pulled / PULL_PX
    setPull(g.side, g.progress)
  }
  const onTouchEnd = () => {
    const g = touch.current
    touch.current = null
    if (!g?.side) return
    setPull(g.side, 0)
    if (g.progress >= 1) go(g.side)
  }

  const onWheel = (e: React.WheelEvent) => {
    const rail = railRef.current
    const d = e.deltaX || (e.shiftKey ? e.deltaY : 0)
    if (!rail || !d) return
    const w = wheel.current
    const forward = forwardOf(d) > 0
    // Only a fresh gesture that starts already at an end and pushes past it
    // can switch — not the tail of a fling that merely reached the end.
    if (e.timeStamp - w.last > WHEEL_GAP_MS) {
      const { start, end } = scrollEdges(rail)
      w.sum = 0
      w.side = forward && end && next ? 'next' : !forward && start && prev ? 'prev' : null
    }
    w.last = e.timeStamp
    const side = w.side
    if (!side) return
    clearTimeout(w.timer)
    if (forward !== (side === 'next')) { setPull(side, 0); w.side = null; return }
    w.sum += Math.abs(d)
    setPull(side, w.sum / WHEEL_PX)
    if (w.sum >= WHEEL_PX) { w.side = null; go(side); return }
    w.timer = setTimeout(() => setPull(side, 0), WHEEL_GAP_MS)
  }

  // Mouse users can't swipe sideways — give them arrows. Scrolling forward
  // means negative scrollLeft in RTL.
  const step = (dir: 1 | -1) => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({ left: dir * (isRTL ? -1 : 1) * rail.clientWidth * 0.7, behavior: 'smooth' })
  }
  const BackIcon    = isRTL ? ChevronRight : ChevronLeft
  const ForwardIcon = isRTL ? ChevronLeft  : ChevronRight
  const arrowCls = 'hidden pointer-fine:flex absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full items-center justify-center shadow-lg active:scale-90 transition-transform'
  const arrowStyle = { background: isDark ? 'rgba(20,24,34,0.85)' : 'rgba(255,255,255,0.95)', color: accent }

  const edgeCard = (cat: RailCategory, side: Side) => {
    const label = side === 'prev' ? t.gm_prev_category : t.gm_next_category
    const Icon  = side === 'prev' ? BackIcon : ForwardIcon
    return (
      <button
        ref={side === 'prev' ? startRef : endRef}
        onClick={side === 'prev' ? onPrev : onNext}
        aria-label={`${label}: ${cat.name}`}
        className={`${side === 'prev' ? 'snap-start' : 'snap-end'} relative overflow-hidden shrink-0 w-28 sm:w-36 rounded-2xl flex flex-col items-center justify-center gap-2 px-2 active:scale-95 transition-transform`}
        style={{ border: `2px dashed ${accent}66`, background: `${accent}0d` }}
      >
        {/* Pull feedback: tint + bar fill as the guest drags past the end */}
        <span aria-hidden className="absolute inset-0 pointer-events-none transition-opacity duration-100"
          style={{ background: accent, opacity: 'calc(var(--pull, 0) * 0.22)' }} />
        <span className="relative w-12 h-12 rounded-full flex items-center justify-center shadow" style={{ background: cat.color }}>
          {cat.icon
            ? <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{cat.icon}</span>
            : <span className="text-white text-lg font-bold">{cat.name.charAt(0).toUpperCase()}</span>}
        </span>
        <span className="relative text-[10px] font-semibold uppercase tracking-wide" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : '#9ca3af' }}>
          {label}
        </span>
        <span className="relative text-xs font-bold text-center line-clamp-2 leading-tight" style={{ color: accent }}>{cat.name}</span>
        <Icon className="relative w-4 h-4 animate-pulse" style={{ color: accent }} />
        <span aria-hidden className="absolute bottom-3 inset-x-4 h-1 rounded-full overflow-hidden pointer-events-none"
          style={{ background: `${accent}26`, opacity: 'min(1, calc(var(--pull, 0) * 8))' }}>
          <span className="block h-full rounded-full transition-[width] duration-100"
            style={{ width: 'calc(var(--pull, 0) * 100%)', background: accent }} />
        </span>
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
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onWheel={onWheel}
        className="scroll-hide flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-4 px-4 py-1"
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
