'use client'

import Link from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { supabase } from '../../lib/supabase'
import { HomeIcon, PanelRightIcon, SidebarIcon } from './icons'
import { LyceoWordmark } from './LaurelMark'

// The learning environment's frame: a top bar, the course sidebar on the left, the lesson in the middle and Ask
// Lyceo on the right. The middle always comes first: the side panels give way to it.
//
//   Wide screens (1280px and up)   three columns. The sidebar folds to an icon rail; Ask Lyceo folds away.
//   Laptops (1024px and up)        sidebar and lesson in columns; Ask Lyceo opens over the lesson.
//   Phones and tablets             the lesson alone; both panels open as drawers over it.
//
// Whether the student left each panel open is remembered on this device. The lesson scrolls on its own, so opening
// or closing a panel never moves the page; the lesson keeps the student's place itself (useReadingPosition).

type Shell = {
  /** The lesson column's scroll container. */
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Puts Ask Lyceo (or nothing) in the right panel. */
  setAside: (node: React.ReactNode | null) => void
  /** Shows Ask Lyceo: the side panel on wide screens, a drawer on smaller ones. */
  openAside: () => void
  closeAside: () => void
  asideVisible: boolean
  closeDrawers: () => void
}

const ShellContext = createContext<Shell | null>(null)
export const useLearnShell = () => useContext(ShellContext)

// Choices kept on this device. In memory too, so the toggles still work where storage is blocked.
const remembered = new Map<string, string>()
const listeners = new Set<() => void>()
function subscribeChoices(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}
function readChoice(key: string) {
  if (remembered.has(key)) return remembered.get(key)!
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function usePersistentChoice<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const stored = useSyncExternalStore(
    subscribeChoices,
    () => readChoice(key),
    () => null,
  )
  const value = stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : initial
  const set = useCallback(
    (next: T) => {
      remembered.set(key, next)
      try {
        window.localStorage.setItem(key, next)
      } catch {}
      listeners.forEach((l) => l())
    },
    [key],
  )
  return [value, set] as const
}

function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function LearnShell(props: {
  /** The full course sidebar. */
  sidebar: React.ReactNode
  /** The folded sidebar: an icon rail. */
  rail: React.ReactNode
  userEmail: string | null
  children: React.ReactNode
}) {
  const [left, setLeft] = usePersistentChoice('lyceo.learn.sidebar', 'open', ['open', 'rail'] as const)
  const [ask, setAsk] = usePersistentChoice('lyceo.learn.ask', 'open', ['open', 'closed'] as const)
  const [leftDrawer, setLeftDrawer] = useState(false)
  const [askDrawer, setAskDrawer] = useState(false)
  const [aside, setAside] = useState<React.ReactNode | null>(null)
  const [animate, setAnimate] = useState(false)
  const lg = useMedia('(min-width: 1024px)')
  const xl = useMedia('(min-width: 1280px)')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // No sliding on first paint: the saved choices apply instantly, transitions start after.
  useEffect(() => {
    const t = window.setTimeout(() => setAnimate(true), 60)
    return () => window.clearTimeout(t)
  }, [])

  const closeDrawers = useCallback(() => {
    setLeftDrawer(false)
    setAskDrawer(false)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawers()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDrawers])

  const toggleLeft = () => (lg ? setLeft(left === 'open' ? 'rail' : 'open') : setLeftDrawer((v) => !v))
  const openAside = useCallback(() => (xl ? setAsk('open') : setAskDrawer(true)), [xl, setAsk])
  const closeAside = useCallback(() => (xl ? setAsk('closed') : setAskDrawer(false)), [xl, setAsk])
  const toggleAside = () => (xl ? setAsk(ask === 'open' ? 'closed' : 'open') : setAskDrawer((v) => !v))
  const asideVisible = !!aside && (xl ? ask === 'open' : askDrawer)
  const sidebarExpanded = lg ? left === 'open' : leftDrawer

  const shell = useMemo<Shell>(
    () => ({ scrollRef, setAside, openAside, closeAside, asideVisible, closeDrawers }),
    [openAside, closeAside, asideVisible, closeDrawers],
  )
  const motion = animate
    ? 'duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none'
    : 'transition-none'

  return (
    <ShellContext.Provider value={shell}>
      <div className="relative flex h-dvh flex-col overflow-hidden bg-[#f5ecdf] text-ink">
        <Scenery />

        <header className="relative z-20 flex h-[68px] shrink-0 items-center gap-1.5 px-3 sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={toggleLeft}
            className="grid size-10 place-items-center rounded-xl text-grove transition-colors hover:bg-grove/[0.08]"
            aria-label={sidebarExpanded ? 'Hide the course sidebar' : 'Show the course sidebar'}
            aria-expanded={sidebarExpanded}
            aria-controls="course-sidebar"
          >
            <SidebarIcon size={22} />
          </button>
          <Link href="/dashboard" className="rounded-lg px-1 no-underline" aria-label="Lyceo, My Academy">
            <LyceoWordmark />
          </Link>
          <nav aria-label="Main" className="ml-6 hidden md:block">
            <Link
              href="/dashboard"
              aria-current="true"
              className="relative inline-flex items-center gap-2 rounded-xl bg-[#f1e6d5]/90 px-3.5 py-2 text-[0.92rem] font-medium text-grove no-underline after:absolute after:inset-x-3 after:-bottom-1 after:h-[2.5px] after:rounded-full after:bg-gold hover:bg-[#ede0cb]"
            >
              <HomeIcon size={18} /> My Academy
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {aside && (
              <button
                type="button"
                onClick={toggleAside}
                aria-pressed={asideVisible}
                aria-controls="ask-lyceo"
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.88rem] font-medium backdrop-blur-sm transition-colors ${
                  asideVisible
                    ? 'border-grove/15 bg-grove text-ivory hover:bg-grove-soft'
                    : 'border-[#e0d3bd] bg-[#fdf8f0]/85 text-grove hover:border-gold'
                }`}
              >
                <PanelRightIcon size={18} />
                <span className="hidden sm:inline">Ask Lyceo</span>
              </button>
            )}
            <UserMenu email={props.userEmail} />
          </div>
        </header>

        {/* No z-index here: the drawers inside must stack above the top bar and the backdrop. */}
        <div className="relative flex min-h-0 flex-1 px-2 pb-2 sm:px-4 sm:pb-4 lg:gap-5 lg:px-5">
          <div
            id="course-sidebar"
            className={`fixed inset-y-2 left-2 z-40 w-[300px] max-w-[86vw] transition-transform ${motion} ${
              leftDrawer ? 'translate-x-0' : '-translate-x-[110%]'
            } lg:static lg:z-auto lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:transition-[width] ${
              left === 'open' ? 'lg:w-[264px] 2xl:w-[300px]' : 'lg:w-[76px]'
            }`}
            inert={!lg && !leftDrawer}
          >
            <div className="h-full overflow-hidden rounded-[20px] bg-grove text-ivory shadow-[0_18px_40px_-22px_rgba(20,40,20,0.65)]">
              {lg && left === 'rail' ? props.rail : props.sidebar}
            </div>
          </div>

          <main className="relative min-w-0 flex-1">
            <div
              ref={scrollRef}
              id="lesson-scroll"
              className="h-full overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,#000_14px)]"
            >
              {props.children}
            </div>
          </main>

          {aside && (
            <div
              id="ask-lyceo"
              className={`fixed inset-y-2 right-2 z-40 w-[min(420px,calc(100vw-1rem))] transition-transform ${motion} ${
                askDrawer ? 'translate-x-0' : 'translate-x-[110%]'
              } xl:static xl:z-auto xl:shrink-0 xl:translate-x-0 xl:overflow-hidden xl:transition-[width,margin,opacity] ${
                ask === 'open'
                  ? 'xl:w-[360px] xl:opacity-100 2xl:w-[440px]'
                  : 'xl:pointer-events-none xl:-ml-5 xl:w-0 xl:opacity-0'
              }`}
              aria-hidden={!asideVisible}
              inert={!asideVisible}
            >
              <div className="h-full w-full overflow-hidden rounded-[20px] border border-[#ebdfcc] bg-[#fbf4eb] shadow-[0_14px_34px_-28px_rgba(80,55,20,0.55)] xl:w-[360px] 2xl:w-[440px]">
                {aside}
              </div>
            </div>
          )}
        </div>

        {(leftDrawer || askDrawer) && (
          <button
            type="button"
            aria-label="Close the panel"
            className="fixed inset-0 z-30 bg-ink/25 backdrop-blur-[1px] lg:hidden"
            onClick={closeDrawers}
          />
        )}
        {askDrawer && (
          <button
            type="button"
            aria-label="Close Ask Lyceo"
            className="fixed inset-0 z-30 hidden bg-ink/20 lg:block xl:hidden"
            onClick={closeDrawers}
          />
        )}
      </div>
    </ShellContext.Provider>
  )
}

/**
 * The landscape behind the top bar: a hill of temples and cypresses on the right, an arcade's ivy on the left. Only
 * the band above the panels shows; it fades into the page below.
 */
function Scenery() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[78px] select-none overflow-hidden md:h-[120px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/learn/band-right.webp"
        alt=""
        width={715}
        height={330}
        className="absolute right-[4%] top-[-178px] h-[330px] w-[715px] max-w-none opacity-95"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, #000 30%, #000 82%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 30%, #000 82%, transparent 100%)',
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/learn/band-left.webp"
        alt=""
        width={270}
        height={330}
        className="absolute left-0 top-[-40px] hidden h-[330px] w-[270px] max-w-none opacity-60 md:block"
        style={{
          maskImage: 'linear-gradient(to right, #000 10%, transparent 85%)',
          WebkitMaskImage: 'linear-gradient(to right, #000 10%, transparent 85%)',
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-[#f5ecdf]" />
    </div>
  )
}

function UserMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false)
  const initial = (email ?? '?').charAt(0).toUpperCase()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        className="grid size-10 place-items-center rounded-full border-2 border-gold/80 bg-grove font-display text-[1.05rem] text-ivory shadow-sm"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-line bg-panel py-1.5 shadow-xl"
        >
          {email && <p className="truncate px-4 py-2 text-[0.85rem] text-ink-soft">{email}</p>}
          <Link role="menuitem" href="/dashboard" className="block px-4 py-2 text-ink no-underline hover:bg-ivory">
            My Academy
          </Link>
          <Link role="menuitem" href="/profile" className="block px-4 py-2 text-ink no-underline hover:bg-ivory">
            Profile
          </Link>
          <button
            role="menuitem"
            type="button"
            className="block w-full px-4 py-2 text-left text-ink hover:bg-ivory"
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.replace('/')
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
