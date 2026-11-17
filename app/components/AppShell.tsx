'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'

/** Returns the signed-in user, sending visitors without a session back to the landing page. */
export function useRequiredUser() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) setUser(data.session.user)
      else window.location.replace('/')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setUser(session.user)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return user
}

const NAV = [
  { href: '/dashboard', label: 'Lessons' },
  { href: '/upload', label: 'New lesson' },
  { href: '/profile', label: 'Profile' },
]

export function AppShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const pathname = usePathname()

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.replace('/')
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className={`mx-auto flex items-center justify-between gap-4 px-5 py-4 ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>
          <Logo href="/dashboard" />
          <nav className="flex items-center gap-1 text-[0.95rem]">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 no-underline transition-colors ${
                  pathname === item.href ? 'bg-parchment-deep font-bold text-ink' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button onClick={signOut} className="rounded-md px-3 py-1.5 text-ink-soft hover:text-ink">
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className={`mx-auto px-5 pb-20 pt-10 ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>{children}</main>
    </div>
  )
}

export function LoadingNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-ink-soft">
      <span className="spinner text-aegean" />
      {children}
    </p>
  )
}
