import Link from 'next/link'
import { LyceoWordmark } from '../learn/LaurelMark'
import { SignInButton } from '../SignInButton'

/** The end of the landing: the invitation into My Academy, which is open today. */
export function FinalCTA() {
  return (
    <section aria-labelledby="cta-title" className="bg-[#f7f0e4]">
      <div className="mx-auto flex max-w-[86rem] items-center justify-between gap-10 px-[clamp(3rem,8vw,10rem)] py-20">
        <div className="max-w-[40rem]">
          <h2
            id="cta-title"
            className="font-display text-[2.6rem] font-bold leading-tight tracking-[-0.02em] text-[#1a3020]"
          >
            Your academy is already open.
          </h2>
          <p className="mt-3 font-display text-[1.25rem] text-[#3a3f38]">
            Bring the slides and notes from your classes. Lyceo teaches each lecture, checks what you understood and
            plans what to study next.
          </p>
        </div>
        <SignInButton
          label="Enter My Academy"
          signedInLabel="Enter My Academy"
          icon="arrow"
          className="inline-flex shrink-0 items-center gap-3 rounded-full bg-[#173a20] px-9 py-[1.05rem] font-display text-[1.25rem] text-[#fbf5ea] shadow-[0_14px_30px_-16px_rgba(20,45,20,0.8)] transition-colors hover:bg-[#21492b]"
        />
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[#e4d9c5] bg-[#efe6d6]">
      <div className="mx-auto flex max-w-[86rem] items-end justify-between gap-10 px-[clamp(3rem,8vw,10rem)] py-12">
        <div className="min-w-0">
          <LyceoWordmark />
          <p className="mt-4 max-w-[24rem] text-[0.92rem] text-ink-soft">
            Named after the Lyceum, where Aristotle taught while walking with his students.
          </p>
        </div>
        <nav aria-label="Footer" className="flex shrink-0 gap-8 whitespace-nowrap text-[0.95rem]">
          <a href="#academy" className="text-ink-soft no-underline hover:text-ink">
            My Academy
          </a>
          <a href="#learning" className="text-ink-soft no-underline hover:text-ink">
            The learning experience
          </a>
          <Link href="/privacy" className="text-ink-soft no-underline hover:text-ink">
            Privacy
          </Link>
        </nav>
        <p className="shrink-0 whitespace-nowrap text-right text-[0.9rem] text-ink-soft">
          © 2026 Lyceo
          <br />
          Built by José Miguel Féliz at Williams College.
        </p>
      </div>
    </footer>
  )
}
