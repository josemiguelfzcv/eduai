'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { HomeIcon, PanelRightIcon, PersonIcon, SearchIcon, SidebarIcon, SignOutIcon, TempleIcon } from '../learn/icons'
import { LyceoWordmark } from '../learn/LaurelMark'
import { useAcademy } from './academy'
import { SearchDialog } from './Search'

/** The top of every page: the sidebar toggle and the logo, the two places of Lyceo, search, and the student. */
export function TopBar({
  sidebarOpen,
  sidebarWidth,
  onToggleSidebar,
  motion,
  ask,
}: {
  sidebarOpen: boolean
  sidebarWidth: number
  onToggleSidebar: () => void
  motion: string
  /** Set while a learning workspace offers Ask Lyceo. */
  ask: { visible: boolean; toggle: () => void } | null
}) {
  const path = usePathname() ?? ''
  const [searching, setSearching] = useState(false)
  const lyceum = path.startsWith('/lyceum')

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
    <header className="relative z-20 flex h-16 shrink-0">
      <Scenery />

      {/* The sidebar's top: its toggle on the green, the logo on a tab of the page. */}
      <div className={`relative flex shrink-0 bg-grove transition-[width] ${motion}`} style={{ width: sidebarWidth }}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="grid w-[64px] shrink-0 place-items-center text-ivory/90 transition-colors hover:text-ivory"
          aria-label={sidebarOpen ? 'Collapse the sidebar' : 'Expand the sidebar'}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          title={sidebarOpen ? 'Collapse the sidebar' : 'Expand the sidebar'}
        >
          <span className="grid size-10 place-items-center rounded-xl hover:bg-ivory/[0.1]">
            <SidebarIcon size={22} />
          </span>
        </button>
        {sidebarOpen && (
          <div className="flex min-w-0 flex-1 items-center rounded-bl-[22px] bg-[#f6eee2] pl-4">
            <Link href="/dashboard" className="rounded-lg no-underline" aria-label="Lyceo, My Academy">
              <LyceoWordmark />
            </Link>
          </div>
        )}
      </div>
      {!sidebarOpen && (
        <Link href="/dashboard" className="ml-4 self-center rounded-lg no-underline" aria-label="Lyceo, My Academy">
          <LyceoWordmark />
        </Link>
      )}

      <nav aria-label="Lyceo" className="relative ml-7 flex items-center gap-2">
        <HeaderLink href="/dashboard" active={!lyceum} icon={<HomeIcon size={19} />}>
          My Academy
        </HeaderLink>
        <HeaderLink href="/lyceum" active={lyceum} icon={<TempleIcon size={19} />}>
          The Lyceum
        </HeaderLink>
      </nav>

      <div className="relative ml-auto flex items-center gap-2.5 pr-5">
        <button
          type="button"
          onClick={() => setSearching(true)}
          aria-label="Search your courses"
          title="Search (⌘K)"
          className="grid size-10 place-items-center rounded-full bg-[#fbf6ee]/70 text-[#1d1c19] backdrop-blur-sm transition-colors hover:bg-[#fbf6ee]"
        >
          <SearchIcon size={21} />
        </button>
        {ask && (
          <button
            type="button"
            onClick={ask.toggle}
            aria-pressed={ask.visible}
            aria-controls="ask-lyceo"
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.86rem] font-medium backdrop-blur-sm transition-colors ${
              ask.visible
                ? 'border-grove/15 bg-grove text-ivory hover:bg-grove-soft'
                : 'border-[#e0d3bd] bg-[#fdf8f0]/90 text-grove hover:border-gold'
            }`}
          >
            <PanelRightIcon size={18} />
            Ask Lyceo
          </button>
        )}
        <UserMenu />
      </div>

      {searching && <SearchDialog onClose={() => setSearching(false)} />}
    </header>
  )
}

function HeaderLink({
  href,
  active,
  icon,
  children,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[0.92rem] no-underline transition-colors ${
        active
          ? 'bg-[#efe3cf]/90 font-semibold text-grove after:absolute after:inset-x-3 after:-bottom-[5px] after:h-[2.5px] after:rounded-full after:bg-gold'
          : 'font-medium text-[#2a2924] hover:bg-[#efe3cf]/60'
      }`}
    >
      {icon}
      {children}
    </Link>
  )
}

/** The hill of temples behind the right of the bar. */
function Scenery() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/learn/band-right.webp"
        alt=""
        width={715}
        height={330}
        className="absolute right-[6%] top-[-196px] h-[330px] w-[715px] max-w-none opacity-95"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, #000 30%, #000 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 30%, #000 80%, transparent 100%)',
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[#f6eee2]" />
    </div>
  )
}

function UserMenu() {
  const academy = useAcademy()
  const user = academy?.user
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const email = user?.email ?? null
  const name = (user?.user_metadata?.full_name as string | undefined) ?? null
  const picture = (user?.user_metadata?.avatar_url as string | undefined) ?? null

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        className="grid size-10 place-items-center overflow-hidden rounded-full border-2 border-gold/80 bg-grove font-display text-[1.05rem] text-ivory shadow-sm"
      >
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          (name ?? email ?? '?').charAt(0).toUpperCase()
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-panel py-1.5 shadow-xl"
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
