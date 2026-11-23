'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '../learn/icons'
import { LaurelMark } from '../learn/LaurelMark'
import { SignInButton } from '../SignInButton'

// The landing's navigation, laid out like the approved hero (measured on its 1672px frame, so every size is in vw):
// the wordmark at the left, Product, The Lyceum, Resources and About in the middle, Log in at the right. Over the
// hero it sits on the scene; once the page scrolls it settles on a band of ivory.

const v = (px: number) => `${((px / 1672) * 100).toFixed(3)}vw`

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

  const link = 'rounded-md text-[#283223] no-underline transition-colors hover:text-[#1d2f1a]'
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[height,background-color,box-shadow] duration-300 ${
        scrolled ? 'bg-[#f8f2e8]/92 shadow-[0_8px_30px_-22px_rgba(40,30,10,0.55)] backdrop-blur-md' : ''
      }`}
      style={{ height: scrolled ? 76 : v(224) }}
    >
      <a
        href="#main"
        className="sr-only rounded-md bg-ivory px-3 py-2 text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
      >
        Skip to content
      </a>

      {/* The wordmark: the laurel and the name, centered on the bar. */}
      <a
        href="#top"
        aria-label="Lyceo, back to the top"
        className="absolute top-1/2 flex -translate-y-1/2 items-center rounded-lg text-[#1e321d] no-underline"
        style={{ left: v(198), gap: scrolled ? 10 : v(12) }}
      >
        <LaurelMark
          size={0}
          className="shrink-0"
          style={{ width: scrolled ? 42 : v(61), height: scrolled ? 42 : v(61) }}
        />
        <span
          className="font-display font-[650] leading-none tracking-[-0.012em] [font-variation-settings:'opsz'_36]"
          style={{ fontSize: scrolled ? 34 : v(48) }}
        >
          Lyceo
        </span>
      </a>

      <nav
        aria-label="Lyceo"
        className="absolute top-1/2 flex -translate-y-1/2 items-center font-medium"
        style={{ left: v(594), gap: v(58), fontSize: `max(14px, ${v(16.5)})` }}
      >
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu((value) => !value)}
            aria-expanded={menu}
            aria-haspopup="menu"
            className={`inline-flex items-center gap-[0.35em] ${link}`}
          >
            Product <ChevronDownIcon size={16} />
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute left-1/2 top-[2.2em] w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-[#e6dac6] bg-[#fbf6ee] p-2 text-[15px] shadow-xl"
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
        <a href="#lyceum" className={link}>
          The Lyceum
        </a>
        <a href="#resources" className={link}>
          Resources
        </a>
        <a href="#about" className={link}>
          About
        </a>
      </nav>

      <div className="absolute top-1/2 -translate-y-1/2" style={{ right: v(108) }}>
        <SignInButton
          label="Log in"
          signedInLabel="My Academy"
          icon="none"
          className="inline-flex items-center justify-center rounded-full border border-[#1d2f1a]/45 bg-[#f6efe5]/95 font-medium text-[#1d2a1d] shadow-[0_6px_18px_-12px_rgba(40,30,10,0.45)] transition-colors hover:bg-[#fffaf2]"
          style={{
            minWidth: scrolled ? 96 : v(103),
            height: scrolled ? 42 : v(47),
            padding: `0 ${scrolled ? '20px' : v(22)}`,
            fontSize: `max(14px, ${v(18)})`,
          }}
        />
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
