import Link from 'next/link'
import { Logo } from '../Logo'
import { SignInButton } from '../SignInButton'

/** Section 6: the final invitation. */
export function FinalCTA() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden">
      <svg
        className="pointer-events-none absolute left-1/2 top-10 h-[50rem] w-[56rem] max-w-none -translate-x-1/2 text-gold/45"
        viewBox="0 0 400 400"
        aria-hidden="true"
      >
        <path
          d="M40 400 V170 A160 160 0 0 1 360 170 V400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M58 400 V174 A142 142 0 0 1 342 174 V400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeOpacity="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative mx-auto max-w-3xl px-5 pb-28 pt-[15.5rem] text-center sm:px-8">
        <h2 id="cta-title" className="text-[clamp(2.4rem,5vw,4.2rem)]">
          Your next lesson starts here.
        </h2>
        <p className="mx-auto mt-5 max-w-[30rem] text-[1.05rem] text-ink-soft">
          Free to start. Sign in with Google and turn your first set of slides into a lesson.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <SignInButton
            label="Get Started Free"
            signedInLabel="Open My Academy"
            icon="arrow"
            className="btn btn-primary px-6 py-3.5"
          />
          <Link href="/demo" className="btn btn-quiet px-6 py-3.5 no-underline">
            Try a 5-minute lesson
          </Link>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ivory-deep/50">
      <div className="mx-auto grid max-w-[80rem] gap-8 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-[22rem] text-[0.9rem] text-ink-soft">
            Named after the Lyceum, where Aristotle taught while walking with his students.
          </p>
        </div>
        <nav aria-label="Footer" className="text-[0.92rem]">
          <ul className="space-y-2.5">
            <li>
              <a href="#how" className="text-ink-soft no-underline hover:text-ink">
                How it works
              </a>
            </li>
            <li>
              <a href="#academy" className="text-ink-soft no-underline hover:text-ink">
                My Academy
              </a>
            </li>
            <li>
              <Link href="/demo" className="text-ink-soft no-underline hover:text-ink">
                Try the demo
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-[0.9rem] text-ink-soft md:text-right">
          © 2026 Lyceo
          <br />
          Built by José Miguel Féliz at Williams College.
        </p>
      </div>
    </footer>
  )
}
