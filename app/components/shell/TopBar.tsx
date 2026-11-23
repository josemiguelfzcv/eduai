'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { whenLabel } from '../../lib/academy'
import { supabase } from '../../lib/supabase'
import {
  BellIcon,
  ChevronDownIcon,
  PanelRightIcon,
  PersonIcon,
  SearchIcon,
  SignOutIcon,
  TempleIcon,
} from '../learn/icons'
import { useAcademy, useSnapshot } from './academy'
import { SearchDialog } from './Search'

const SQUARE =
  'grid size-[42px] place-items-center rounded-[13px] border border-[#e6dccb] bg-[#fdf9f2]/90 text-[#1d1c19] shadow-[0_2px_8px_-5px_rgba(80,55,20,0.4)] backdrop-blur-sm transition-colors hover:bg-[#fffdf8]'

/** The top of every page, over its right side: search, Ask Lyceo where a page offers it, what needs you, and you. */
export function TopBar({
  left,
  motion,
  scrolled,
  ask,
}: {
  /** Where the page begins (the sidebar's width). */
  left: number
  motion: string
  /** The page has scrolled under the bar. */
  scrolled: boolean
  /** Set while a learning workspace offers Ask Lyceo. */
  ask: { visible: boolean; toggle: () => void } | null
}) {
  const [searching, setSearching] = useState(false)

  // ⌘K or Ctrl+K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header
      className={`pointer-events-none absolute right-0 top-0 z-20 flex h-16 items-center transition-[left] ${motion}`}
      style={{ left }}
    >
      {/* Clear over the page; ivory once the page scrolls under it. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
          scrolled ? 'bg-[#f8f1e6]/92 shadow-[0_10px_24px_-20px_rgba(60,40,15,0.55)] backdrop-blur-md' : ''
        }`}
      />
      <div className="pointer-events-auto relative ml-auto flex items-center gap-3.5 pr-7">
        <button
          type="button"
          onClick={() => setSearching(true)}
          aria-label="Search your courses"
          title="Search (⌘K)"
          className={SQUARE}
        >
          <SearchIcon size={21} />
        </button>
        {ask && (
          <button
            type="button"
            onClick={ask.toggle}
            aria-pressed={ask.visible}
            aria-controls="ask-lyceo"
            className={`inline-flex h-[42px] items-center gap-2 rounded-[13px] border px-3.5 text-[0.88rem] font-medium backdrop-blur-sm transition-colors ${
              ask.visible
                ? 'border-grove/15 bg-grove text-ivory hover:bg-grove-soft'
                : 'border-[#e0d3bd] bg-[#fdf8f0]/90 text-grove hover:border-gold'
            }`}
          >
            <PanelRightIcon size={18} />
            Ask Lyceo
          </button>
        )}
        <Notices />
        <UserMenu />
      </div>

      {searching && (
        <div className="pointer-events-auto">
          <SearchDialog onClose={() => setSearching(false)} />
        </div>
      )}
    </header>
  )
}

/** Closes a popover on a click outside it or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', outside)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('mousedown', outside)
      window.removeEventListener('keydown', escape)
    }
  }, [open, close])
  return ref
}

/** The bell: what needs the student soon. Deadlines within three days and a Quick Check left open. */
function Notices() {
  const { snapshot } = useSnapshot()
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const due = (snapshot?.deadlines ?? []).filter((d) => !d.completedAt && d.daysLeft >= 0 && d.daysLeft <= 3)
  const paused = snapshot?.sinceLastTime?.status === 'active' ? snapshot.sinceLastTime : null
  const count = due.length + (paused ? 1 : 0)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count ? `Notices: ${count} that need you soon` : 'Notices: nothing needs you right now'}
        className={`relative ${SQUARE}`}
      >
        <BellIcon size={21} />
        {count > 0 && (
          <span className="absolute right-[9px] top-[8px] size-[9px] rounded-full bg-[#c98a1a] ring-2 ring-[#fdf9f2]" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[52px] z-50 w-80 overflow-hidden rounded-2xl border border-line bg-panel py-2 shadow-xl">
          <p className="px-4 pb-1.5 pt-1 font-display text-[1.1rem] font-semibold">Coming up</p>
          {count === 0 && <p className="px-4 pb-2 text-[0.9rem] text-ink-soft">Nothing needs you right now.</p>}
          {paused && (
            <Link
              href={`/sessions/${paused.sessionId}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-ink no-underline hover:bg-ivory"
            >
              <span className="block text-[0.94rem] font-medium">A Quick Check is waiting for you</span>
              <span className="block text-[0.84rem] text-ink-soft">
                {paused.courseName ? `${paused.courseName}. ` : ''}Pick up where you stopped.
              </span>
            </Link>
          )}
          {due.map((d) => (
            <Link
              key={d.id}
              href="/study-plan"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-ink no-underline hover:bg-ivory"
            >
              <span className="block text-[0.94rem] font-medium">{d.title}</span>
              <span className="block text-[0.84rem] text-ink-soft">
                {d.courseName}, due {whenLabel(d.daysLeft)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const academy = useAcademy()
  const user = academy?.user
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const email = user?.email ?? null
  const name = (user?.user_metadata?.full_name as string | undefined) ?? null
  const picture = (user?.user_metadata?.avatar_url as string | undefined) ?? null
  const words = (name ?? email ?? '?').trim().split(/\s+/)
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 1)).toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        className="flex items-center gap-2 rounded-full text-[#1d1c19]"
      >
        <span className="grid size-[42px] place-items-center overflow-hidden rounded-full bg-[#1f4a2c] font-display text-[1.02rem] font-medium tracking-[0.02em] text-ivory shadow-sm">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <ChevronDownIcon size={17} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[52px] z-50 w-64 overflow-hidden rounded-2xl border border-line bg-panel py-1.5 shadow-xl"
        >
          <div className="px-4 py-2.5">
            {name && <p className="truncate font-medium">{name}</p>}
            {email && <p className="truncate text-[0.84rem] text-ink-soft">{email}</p>}
          </div>
          <div className="my-1 border-t border-line" />
          <Link
            role="menuitem"
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2 text-ink no-underline hover:bg-ivory"
          >
            <PersonIcon size={18} /> Profile
          </Link>
          <Link
            role="menuitem"
            href="/lyceum"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2 text-ink no-underline hover:bg-ivory"
          >
            <TempleIcon size={18} /> The Lyceum
          </Link>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-ink hover:bg-ivory"
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.replace('/')
            }}
          >
            <SignOutIcon size={18} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
