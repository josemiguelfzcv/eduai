'use client'

import { useCallback, useEffect, useRef } from 'react'
import { anchorAt, scrollFor, type ReadingAnchor } from '../../lib/written-lesson'
import { HEADER } from '../shell/Shell'

// Keeps the student's exact place in the lesson. The place is the block at the top of the view and how far into it
// the view starts, not a pixel offset, so it survives the lesson column changing width (a panel opening or closing,
// a window resizing, a section still streaming in below) and comes back on another visit or another device.

type Options = {
  scrollRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  /** This device's copy of the place, for an instant restore. */
  storageKey: string
  /** The place saved on the server, used when this device has none. */
  saved: ReadingAnchor | null
  /** True once the blocks the place points to are on the page. */
  ready: boolean
  /** Called (at most every few seconds) with the place to keep on the server. */
  onSave: (anchor: ReadingAnchor) => void
}

/**
 * The reading line: just below the top bar (the page scrolls under it), so a block that has all but left the view
 * isn't the place.
 */
const LINE = HEADER + 4

function measure(scroll: HTMLElement, content: HTMLElement) {
  const base = scroll.getBoundingClientRect().top - scroll.scrollTop
  return Array.from(content.querySelectorAll<HTMLElement>('[data-block]')).map((el) => {
    const rect = el.getBoundingClientRect()
    return { id: el.dataset.block!, section: el.dataset.section ?? '', top: rect.top - base, height: rect.height }
  })
}

export function useReadingPosition({ scrollRef, contentRef, storageKey, saved, ready, onSave }: Options) {
  const anchor = useRef<ReadingAnchor | null>(null)
  const restoring = useRef(false)
  const restored = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  /** Puts the view back on the anchor. */
  const restore = useCallback(() => {
    const scroll = scrollRef.current
    const content = contentRef.current
    const a = anchor.current
    if (!scroll || !content || !a) return
    const block = measure(scroll, content).find((b) => b.id === a.block)
    const at = scrollFor(a, block)
    if (at === null) return
    const top = Math.max(0, at - LINE)
    if (Math.abs(scroll.scrollTop - top) < 1) return
    restoring.current = true
    scroll.scrollTop = top
    window.requestAnimationFrame(() => (restoring.current = false))
  }, [scrollRef, contentRef])

  // First restore, once the content is there: this device's place, or the server's.
  useEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    let local: ReadingAnchor | null = null
    try {
      local = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
    } catch {}
    anchor.current = local ?? saved
    if (anchor.current) window.requestAnimationFrame(restore)
  }, [ready, storageKey, saved, restore])

  // Follow the reading as the student scrolls.
  useEffect(() => {
    const scroll = scrollRef.current
    const content = contentRef.current
    if (!scroll || !content || !ready) return
    let frame = 0
    const onScroll = () => {
      if (restoring.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const a = anchorAt(scroll.scrollTop + LINE, measure(scroll, content))
        if (!a) return
        anchor.current = a
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(a))
        } catch {}
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => onSaveRef.current(a), 2500)
      })
    }
    scroll.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroll.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [scrollRef, contentRef, ready, storageKey])

  // Keep the place when the column changes width or the content above changes height.
  useEffect(() => {
    const content = contentRef.current
    const scroll = scrollRef.current
    if (!content || !scroll || !ready) return
    let width = content.clientWidth
    const observer = new ResizeObserver(() => {
      if (content.clientWidth !== width) {
        width = content.clientWidth
        restore()
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [contentRef, scrollRef, ready, restore])

  // Save the last place when leaving.
  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      if (anchor.current) onSaveRef.current(anchor.current)
    },
    [],
  )

  return {
    /** Moves the view to a block (a section's start, say) and makes it the place. */
    goTo: (blockId: string, section: string) => {
      const scroll = scrollRef.current
      const content = contentRef.current
      if (!scroll || !content) return
      anchor.current = { section, block: blockId, offset: 0 }
      const block = measure(scroll, content).find((b) => b.id === blockId)
      if (block) scroll.scrollTo({ top: Math.max(0, block.top - HEADER - 24), behavior: 'smooth' })
    },
  }
}
