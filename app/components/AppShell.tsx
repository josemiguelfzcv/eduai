'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'
import { useFeatures } from './study/client'
import { HeaderScene } from './learn/LearnPage'
import { useCourseArt } from './shell/art'
import { Breadcrumbs } from './shell/Breadcrumbs'
import { useLocation } from './shell/location'
import { useShell } from './shell/Shell'

/** Returns the signed-in user, sending visitors without a session back to the landing page. */
export function useRequiredUser() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let active = true
    // Auth events repeat the same user; keeping one object stops pages from loading their data twice.
    const keep = (next: User) => setUser((prev) => (prev?.id === next.id ? prev : next))
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) keep(data.session.user)
      else window.location.replace('/')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) keep(session.user)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return user
}

const NAV = [
  { href: '/dashboard', label: 'My Academy' },
  { href: '/upload', label: 'New lesson' },
  { href: '/profile', label: 'Profile' },
]
// Where the learning loop is on, students add material (mapped into ideas) instead of making a lesson.
const LOOP_NAV = [
  { href: '/dashboard', label: 'My Academy' },
  { href: '/materials/new', label: 'Add material' },
  { href: '/profile', label: 'Profile' },
]

export function AppShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  // Inside a course's learning environment the page draws in its frame, without a second header.
  // Inside Lyceo's shell the page draws in its main column, under the breadcrumbs, without a header of its own. On a
  // course's page, the course's scene sits behind the top of the page.
  const inShell = useShell()
  if (inShell)
    return (
      <div className="relative px-8 pb-14 pt-5">
        <CourseScene />
        <div className={`relative ${wide ? 'max-w-[76rem]' : 'max-w-[60rem]'}`}>
          <Breadcrumbs className="mb-6" />
          {children}
        </div>
      </div>
    )
  return <ClassicShell wide={wide}>{children}</ClassicShell>
}

function ClassicShell({ children, wide }: { children: React.ReactNode; wide: boolean }) {
  const pathname = usePathname()
  const width = wide ? 'max-w-6xl' : 'max-w-4xl'
  const features = useFeatures()
  const nav = features?.learningLoop ? LOOP_NAV : NAV

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.replace('/')
  }

  // Course and lesson pages live inside My Academy, so its tab stays marked there.
  const current = (href: string) =>
    pathname === href
      ? 'page'
      : href === '/dashboard' &&
          ['/courses/', '/class/', '/materials/', '/sessions/'].some((p) => pathname.startsWith(p)) &&
          pathname !== '/materials/new'
        ? 'true'
        : undefined

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className={`mx-auto flex items-center justify-between gap-4 px-5 py-4 ${width}`}>
          <Logo href="/dashboard" />
          <nav aria-label="Main" className="hidden items-center gap-1 text-[0.95rem] sm:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current(item.href)}
                className={`rounded-md px-3 py-1.5 no-underline transition-colors ${
                  current(item.href) ? 'bg-ivory-deep font-bold text-ink' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button onClick={signOut} className="rounded-md px-3 py-1.5 text-ink-soft hover:text-ink">
              Sign out
            </button>
          </nav>
          <button onClick={signOut} className="text-[0.9rem] text-ink-soft hover:text-ink sm:hidden">
            Sign out
          </button>
        </div>
        {/* On phones the links get their own row of tabs. */}
        <nav aria-label="Main" className="border-t border-line sm:hidden">
          <div className="flex px-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current(item.href)}
                className={`-mb-px flex-1 whitespace-nowrap border-b-2 py-3 text-center text-[0.92rem] no-underline ${
                  current(item.href) ? 'border-forest font-semibold text-ink' : 'border-transparent text-ink-soft'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className={`mx-auto px-5 pb-20 pt-10 ${width}`}>{children}</main>
    </div>
  )
}

export function LoadingNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-ink-soft">
      <span className="spinner text-forest" />
      {children}
    </p>
  )
}

function CourseScene() {
  const where = useLocation()
  const art = useCourseArt()
  return where.courseId === null ? null : <HeaderScene banner={art.banner(where.courseId)} />
}
