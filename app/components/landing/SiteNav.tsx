'use client'

import { useEffect, useRef, useState } from 'react'
import { Logo } from '../Logo'
import { SignInButton } from '../SignInButton'

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#academy', label: 'My Academy' },
  { href: '#lyceum', label: 'The Lyceum', soon: true },
]

/**
 * Landing navigation. Transparent with ivory text over the hero photograph,
 * solid ivory once the page scrolls. Below the large breakpoint the links move into a sheet.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24)
    const frame = requestAnimationFrame(update)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    firstLinkRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      root.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const solid = scrolled || open
  const tone = solid ? 'dark' : 'light'

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300 ${
          solid
            ? 'border-b border-line bg-ivory/92 shadow-[0_6px_24px_-18px_rgba(28,37,32,0.5)] backdrop-blur-md'
            : 'border-b border-transparent'
        }`}
      >
        <a
          href="#main"
          className="sr-only rounded-md bg-ivory px-3 py-2 text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <div className="mx-auto flex h-[4.5rem] max-w-[86rem] items-center justify-between gap-6 px-5 sm:px-8">
          <Logo tone={tone} />

          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.92rem] font-medium no-underline transition-colors ${
                  solid ? 'text-ink-soft hover:text-ink' : 'text-ivory/85 hover:text-ivory'
                }`}
              >
                {link.label}
                {link.soon && (
                  <span
                    className={`rounded-full border px-2 py-px text-[0.68rem] font-semibold ${
                      solid ? 'border-gold/70 text-gold-deep' : 'border-ivory/50 text-ivory/85'
                    }`}
                  >
                    Soon
                  </span>
                )}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <SignInButton
              label="Log in"
              icon="none"
              hideWhenSignedIn
              className={`rounded-full px-4 py-2 text-[0.92rem] font-medium transition-colors ${
                solid ? 'text-ink-soft hover:text-ink' : 'text-ivory/90 hover:text-ivory'
              }`}
            />
            <SignInButton
              label="Get Started Free"
              signedInLabel="Open My Academy"
              icon="none"
              className={`btn px-5 py-2.5 ${solid ? 'btn-primary' : 'btn-ivory'}`}
            />
          </div>

          <button
            ref={toggleRef}
            type="button"
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full lg:hidden ${solid ? 'text-ink' : 'text-ivory'}`}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              {open ? (
                <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 8h16M3 14h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Outside the header: its backdrop blur would otherwise become the containing block for this fixed sheet. */}
      {open && (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 bottom-0 top-[4.5rem] z-40 overflow-y-auto bg-ivory px-6 pb-10 pt-6 lg:hidden"
        >
          <nav aria-label="Main">
            <ul className="divide-y divide-line border-b border-line">
              {LINKS.map((link, i) => (
                <li key={link.href}>
                  <a
                    ref={i === 0 ? firstLinkRef : undefined}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between py-4 font-display text-[1.9rem] text-ink no-underline"
                  >
                    {link.label}
                    {link.soon && (
                      <span className="rounded-full border border-gold/70 px-2.5 py-0.5 font-sans text-[0.75rem] font-semibold text-gold-deep">
                        Coming soon
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-8 grid gap-3">
            <SignInButton
              label="Get Started Free"
              signedInLabel="Open My Academy"
              icon="arrow"
              className="btn btn-primary py-3.5"
            />
            <SignInButton label="Log in" icon="none" hideWhenSignedIn className="btn btn-quiet py-3.5" />
          </div>
        </div>
      )}
    </>
  )
}
