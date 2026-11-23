'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '../learn/icons'
import { LyceoWordmark } from '../learn/LaurelMark'
import { SignInButton } from '../SignInButton'

/**
 * The landing's navigation (desktop). Over the hero it's just the wordmark, the sections and Log in on the scene;
 * once the page scrolls it settles on a band of ivory.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 40)
    const frame = requestAnimationFrame(update)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', escape)
    }
  }, [menu])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-300 ${
        scrolled ? 'bg-[#f8f2e8]/90 shadow-[0_8px_30px_-22px_rgba(40,30,10,0.55)] backdrop-blur-md' : ''
      }`}
    >
      <a
        href="#main"
        className="sr-only rounded-md bg-ivory px-3 py-2 text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <div
        className={`mx-auto grid max-w-[104rem] grid-cols-[1fr_auto_1fr] items-center px-[clamp(2rem,10vw,12rem)] transition-[height] duration-300 ${
          scrolled ? 'h-[76px]' : 'h-[112px]'
        }`}
      >
        <Link href="/" aria-label="Lyceo home" className="justify-self-start rounded-lg no-underline">
          <LyceoWordmark large />
        </Link>

        <nav aria-label="Lyceo" className="flex items-center gap-12 text-[1.02rem] text-[#1f241f]">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-haspopup="menu"
              className="inline-flex items-center gap-1.5 rounded-lg py-1 font-medium hover:text-grove"
            >
              Product <ChevronDownIcon size={16} />
            </button>
            {menu && (
              <div
                role="menu"
                className="absolute left-1/2 top-10 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-[#e6dac6] bg-[#fbf6ee] p-2 shadow-xl"
              >
                <MenuLink
                  href="#academy"
                  title="My Academy"
                  note="Your courses, progress and next steps"
                  onPick={() => setMenu(false)}
                />
                <MenuLink
                  href="#learning"
                  title="The learning experience"
                  note="Lessons from your lectures, with Ask Lyceo"
                  onPick={() => setMenu(false)}
                />
              </div>
            )}
          </div>
          <a href="#lyceum" className="rounded-lg py-1 font-medium text-[#1f241f] no-underline hover:text-grove">
            The Lyceum
          </a>
        </nav>

        <div className="justify-self-end">
          <SignInButton
            label="Log in"
            signedInLabel="My Academy"
            icon="none"
            className="inline-flex items-center rounded-full border border-[#d9cdb6] bg-[#fffdf8]/95 px-6 py-2.5 text-[1rem] font-medium text-[#1f241f] shadow-[0_6px_18px_-12px_rgba(40,30,10,0.5)] transition-colors hover:border-gold"
          />
        </div>
      </div>
    </header>
  )
}

function MenuLink({ href, title, note, onPick }: { href: string; title: string; note: string; onPick: () => void }) {
  return (
    <a
      role="menuitem"
      href={href}
      onClick={onPick}
      className="block rounded-xl px-4 py-3 text-[#1f241f] no-underline hover:bg-[#efe3cf]/70"
    >
      <span className="block font-display text-[1.08rem] font-semibold">{title}</span>
      <span className="block text-[0.86rem] text-ink-soft">{note}</span>
    </a>
  )
}
