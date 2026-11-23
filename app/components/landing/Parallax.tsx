'use client'

import { useEffect, useRef } from 'react'

/**
 * Moves a scene a little slower than the page as it scrolls by, so the architecture has depth. The scene is drawn a
 * bit taller than its section to leave room for the movement. Still when motion is reduced.
 */
export function Parallax({
  children,
  speed = 0.14,
  className = '',
}: {
  children: React.ReactNode
  speed?: number
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
      const fromCenter = rect.top + rect.height / 2 - window.innerHeight / 2
      el.style.transform = `translate3d(0, ${(-fromCenter * speed).toFixed(1)}px, 0)`
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
  }, [speed])
  return (
    <div ref={ref} className={`will-change-transform ${className}`}>
      {children}
    </div>
  )
}

/** Marks its section as seen once it scrolls into view (data-seen), for entrance details that play once. */
export function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.dataset.seen = 'true'
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.seen = 'true'
          observer.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} data-seen="false" className={`group/seen ${className}`}>
      {children}
    </div>
  )
}
