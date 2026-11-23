'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { GlobalSidebar, SidebarRail } from './Sidebar'
import { TopBar } from './TopBar'
import { useMedia, usePreference } from './store'

// The application shell, the same on every page inside Lyceo (desktop web):
//
//   ┌ Lyceo ──────────────┬──────────────────────────── search · Ask Lyceo · bell · you ┬──────────────────────┐
//   │ My Academy          │ breadcrumbs (inside a course)                              │ Ask Lyceo (optional) │
//   │ Study Plan          │ the page                                                   │                      │
//   │ Global Progress     │                                                            │                      │
//   │ Your Courses ▾      │                                                            │                      │
//   └─────────────────────┴────────────────────────────────────────────────────────────┴──────────────────────┘
//
// It stays mounted across pages, so the sidebar keeps its open courses and sections and the page column keeps its
// own scroll. The sidebar folds to a rail and Ask Lyceo folds away, independently; both choices are remembered.

type Shell = {
  /** The page column's scroll container. Its top runs under the top bar (HEADER pixels). */
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Kept for pages with a scene of their own behind the top bar; the bar is clear now, so it does nothing. */
  holdScene: () => () => void
  /** Puts Ask Lyceo (or nothing) in the right panel; learning workspaces register it while they're open. */
  setAside: (node: React.ReactNode | null) => void
  openAside: () => void
  closeAside: () => void
  asideVisible: boolean
}

const ShellContext = createContext<Shell | null>(null)
export const useShell = () => useContext(ShellContext)

export const SIDEBAR_OPEN = 280
/** The top bar's height. Pages scroll under it, so a page's own top starts this far down. */
export const HEADER = 64
export const SIDEBAR_RAIL = 76

export function AcademyShell({ children }: { children: React.ReactNode }) {
  const [sidebar, setSidebar] = usePreference('lyceo.nav.sidebar', 'open', ['open', 'rail'] as const)
  const [ask, setAsk] = usePreference('lyceo.learn.ask', 'open', ['open', 'closed'] as const)
  const [aside, setAside] = useState<React.ReactNode | null>(null)
  const [animate, setAnimate] = useState(false)
  // Wide desktops keep Ask Lyceo beside the page; narrower laptop screens open it over the page.
  const wide = useMedia('(min-width: 1280px)')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const holdScene = useCallback(() => () => {}, [])
  // Once the page has scrolled, the top bar sets itself on ivory so it reads over the page.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setScrolled(el.scrollTop > 6)
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [])

  // No sliding on first paint: the remembered choices apply at once, transitions start after.
  useEffect(() => {
    const t = window.setTimeout(() => setAnimate(true), 80)
    return () => window.clearTimeout(t)
  }, [])

  // On narrower screens Ask Lyceo covers part of the page, so it opens only when asked, for this visit.
  const [overlay, setOverlay] = useState(false)
  const openAside = useCallback(() => (wide ? setAsk('open') : setOverlay(true)), [wide, setAsk])
  const closeAside = useCallback(() => (wide ? setAsk('closed') : setOverlay(false)), [wide, setAsk])
  const asideVisible = !!aside && (wide ? ask === 'open' : overlay)
  useEffect(() => {
    if (!overlay || wide) return
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOverlay(false)
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [overlay, wide])
  const shell = useMemo<Shell>(
    () => ({ scrollRef, holdScene, setAside, openAside, closeAside, asideVisible }),
    [holdScene, openAside, closeAside, asideVisible],
  )
  const open = sidebar === 'open'
  const motion = animate
    ? 'duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none'
    : 'transition-none'

  return (
    <ShellContext.Provider value={shell}>
      <div className="relative flex h-dvh min-w-[1024px] flex-col overflow-hidden bg-[#f8f1e6] text-ink">
        <TopBar
          left={open ? SIDEBAR_OPEN : SIDEBAR_RAIL}
          motion={motion}
          scrolled={scrolled}
          ask={aside ? { visible: asideVisible, toggle: () => (asideVisible ? closeAside() : openAside()) } : null}
        />

        <div className="relative flex min-h-0 flex-1">
          <nav
            id="app-sidebar"
            aria-label="Lyceo"
            style={{ width: open ? SIDEBAR_OPEN : SIDEBAR_RAIL }}
            className={`relative z-30 shrink-0 overflow-hidden rounded-r-[30px] bg-[linear-gradient(180deg,#1a4428,#133a22_55%,#0f3320)] text-ivory shadow-[10px_0_34px_-24px_rgba(20,40,20,0.75)] transition-[width] ${motion}`}
          >
            {open ? (
              <GlobalSidebar onCollapse={() => setSidebar('rail')} />
            ) : (
              <SidebarRail onExpand={() => setSidebar('open')} />
            )}
          </nav>

          <main className="relative flex min-w-0 flex-1">
            <div
              ref={scrollRef}
              id="lesson-scroll"
              style={{ paddingTop: HEADER, scrollPaddingTop: HEADER }}
              className="min-w-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {children}
            </div>

            {aside && asideVisible && !wide && (
              <button
                type="button"
                aria-label="Close Ask Lyceo"
                tabIndex={-1}
                className="absolute inset-0 z-20 cursor-default bg-ink/10"
                onClick={closeAside}
              />
            )}
            {aside && (
              <div
                id="ask-lyceo"
                className={`shrink-0 overflow-hidden transition-[width,opacity] ${motion} ${
                  wide ? 'relative' : 'absolute inset-y-0 right-0 z-30'
                } ${asideVisible ? 'w-[380px] opacity-100 2xl:w-[440px]' : 'pointer-events-none w-0 opacity-0'}`}
                aria-hidden={!asideVisible}
                inert={!asideVisible}
              >
                <div className="h-full w-[380px] pb-3 pr-3 2xl:w-[440px]" style={{ paddingTop: HEADER }}>
                  <div
                    className={`h-full overflow-hidden rounded-[20px] border border-[#ebdfcc] bg-[#fbf4eb] ${
                      wide
                        ? 'shadow-[0_14px_34px_-28px_rgba(80,55,20,0.55)]'
                        : 'shadow-[0_20px_60px_-20px_rgba(60,40,15,0.45)]'
                    }`}
                  >
                    {aside}
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  )
}
