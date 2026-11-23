'use client'

import { useEffect, useRef } from 'react'

/**
 * Moves a scene a little slower than the page as it scrolls by, so the architecture has depth. The scene is drawn a
 * bit taller than its section to leave room for the movement. Still when motion is reduced.
 */
export function Parallax({
  children,
  speed = 0.14,
  startAtTop = false,
  className = '',
}: {
  children: React.ReactNode
  speed?: number
  /** For the first section: still at rest (as designed), drifting only as the page scrolls away from it. */
  startAtTop?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const section = el?.parentElement
    if (!el || !section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      const rect = section.getBoundingClientRect()
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return
      const shift = startAtTop
        ? Math.max(0, -rect.top) * speed
        : -(rect.top + rect.height / 2 - window.innerHeight / 2) * speed
      el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [speed, startAtTop])
  return (
    <div ref={ref} className={`will-change-transform ${className}`}>
      {children}
    </div>
  )
}
