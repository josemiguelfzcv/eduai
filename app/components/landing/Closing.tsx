import Link from 'next/link'
import { LyceoWordmark } from '../learn/LaurelMark'
import { SignInButton } from '../SignInButton'

/**
 * The end of the landing: the invitation into My Academy (open today), then what the navigation's Resources and About
 * point to.
 */
export function SiteFooter() {
  return (
    <footer className="bg-[#f1e8d9]">
      <div className="mx-auto flex max-w-[86rem] items-center justify-between gap-10 border-b border-[#e2d6c2] px-[clamp(3rem,8vw,10rem)] py-14">
        <div className="max-w-[40rem]">
          <p className="font-display text-[2.2rem] font-[650] leading-tight tracking-[-0.015em] text-[#1d2f1a]">
            Your academy is already open.
          </p>
          <p className="mt-2 font-display text-[1.18rem] text-[#3a3f38]">
            Bring the slides and notes from your classes. Lyceo teaches each lecture, checks what you understood and
            plans what to study next.
          </p>
        </div>
        <SignInButton
          label="Enter My Academy"
          signedInLabel="Enter My Academy"
          icon="arrow"
          className="inline-flex shrink-0 items-center gap-3 rounded-full bg-[#1d2f1a] px-8 py-[0.95rem] font-display text-[1.2rem] text-[#f6f0e4] shadow-[0_14px_30px_-18px_rgba(20,45,20,0.8)] transition-colors hover:bg-[#26401f]"
        />
      </div>
      <div className="mx-auto grid max-w-[86rem] grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 px-[clamp(3rem,8vw,10rem)] py-12 text-[0.95rem]">
        <div id="about" className="scroll-mt-24">
          <LyceoWordmark />
          <p className="mt-4 max-w-[24rem] text-ink-soft">
            Named after the Lyceum, where Aristotle taught while walking with his students. Built by José Miguel Féliz
            at Williams College.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="font-semibold text-[#1d2f1a]">Product</p>
          <ul className="mt-3 space-y-2">
            <li>
              <a href="#academy" className="text-ink-soft no-underline hover:text-ink">
                My Academy
              </a>
            </li>
            <li>
              <a href="#learning" className="text-ink-soft no-underline hover:text-ink">
                The learning experience
              </a>
            </li>
            <li>
              <a href="#lyceum" className="text-ink-soft no-underline hover:text-ink">
                The Lyceum
              </a>
            </li>
          </ul>
        </nav>
        <nav id="resources" aria-label="Resources" className="scroll-mt-24">
          <p className="font-semibold text-[#1d2f1a]">Resources</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/demo" className="text-ink-soft no-underline hover:text-ink">
                Try a sample lesson
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-ink-soft no-underline hover:text-ink">
                Your data in Lyceo
              </Link>
            </li>
          </ul>
        </nav>
        <p className="self-end text-right text-ink-soft">© 2026 Lyceo</p>
      </div>
    </footer>
  )
}
