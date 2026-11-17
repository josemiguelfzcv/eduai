import Link from 'next/link'
import { Logo } from './components/Logo'
import { SignInButton } from './components/SignInButton'
import { Theo } from './components/Theo'
import { renderBoardLine } from './lib/math'

const HERO_BOARD = [
  'Test is 95% accurate. You test positive.',
  'True positives: $0.95 \\times 10 = 9.5$',
  'False positives: $0.10 \\times 990 = 99$',
  '$$P(\\text{sick} \\mid +) = \\frac{9.5}{108.5} \\approx 8.8\\%$$',
]

const STEPS = [
  {
    mark: 'Α',
    title: 'Upload your slides or a lecture recording',
    body: 'A PDF of the slides or an audio file of the class. Lyceo reads it, so the lesson covers what your professor actually taught.',
  },
  {
    mark: 'Β',
    title: 'Theo teaches it on the board',
    body: 'A narrated lesson built from your material, with formulas and examples written on the board as he talks.',
  },
  {
    mark: 'Γ',
    title: 'Answer one question after each part',
    body: 'One short question in your own words. Theo grades the idea, not the wording.',
  },
  {
    mark: 'Δ',
    title: 'Miss one, and he explains it another way',
    body: 'A new angle and a new board, built around what you answered. Then you try again.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/demo" className="hidden rounded-md px-3 py-2 text-ink-soft no-underline hover:text-ink sm:inline">
            Try the demo
          </Link>
          <SignInButton className="btn btn-quiet py-2" label="Sign in" />
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-10 lg:grid-cols-[1fr_1.05fr] lg:pt-16">
          <div className="min-w-0">
            <h1 className="text-[clamp(2.6rem,6vw,4.4rem)] font-semibold leading-[1.04]">
              The tutor that learns how you learn.
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.15rem] text-ink-soft">
              Upload the slides or recording from your hardest class. Theo turns it into a lesson he teaches on a chalkboard,
              checks that you understood each part, and explains it another way when you didn&apos;t.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/demo" className="btn btn-gold px-6 py-3 text-[1.05rem] no-underline">
                Try a 5-minute lesson
              </Link>
              <SignInButton className="btn btn-quiet px-5 py-3" />
            </div>
            <p className="mt-4 text-[0.95rem] text-ink-soft">The demo lesson on Bayes&apos; theorem needs no account.</p>
          </div>

          <div className="relative min-w-0 pb-16 sm:pb-10 sm:pl-14">
            <div className="board px-7 pb-9 pt-11 sm:px-10">
              <div className="flex flex-col gap-2">
                {HERO_BOARD.map((line, i) => (
                  <div
                    key={line}
                    className="board-line chalk-in"
                    style={{ animationDelay: `${300 + i * 650}ms` }}
                    dangerouslySetInnerHTML={{ __html: renderBoardLine(line) }}
                  />
                ))}
              </div>
            </div>
            <div className="panel absolute -bottom-2 right-6 hidden max-w-[17rem] p-4 sm:block shadow-[0_10px_30px_-12px_rgba(28,39,51,0.35)]">
              <p className="text-[0.95rem] text-ink-soft">So, roughly what&apos;s the chance you&apos;re sick?</p>
              <p className="mt-1 font-bold">&ldquo;Like 95%?&rdquo;</p>
              <p className="mt-2 border-l-4 border-terracotta pl-3 text-[0.95rem]">
                That&apos;s the trap. Let&apos;s count 1,000 people instead.
              </p>
            </div>
            <Theo size={112} className="absolute -bottom-2 right-0 sm:-left-6 sm:bottom-2 sm:right-auto" />
          </div>
        </section>

        <section className="border-y border-line bg-parchment-deep/60">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="max-w-xl text-[clamp(1.8rem,3.4vw,2.6rem)]">How a lesson works</h2>
            <ol className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.mark}>
                  <span className="font-display text-[2.6rem] leading-none text-gold-deep" aria-hidden="true">
                    {s.mark}
                  </span>
                  <h3 className="mt-3 text-[1.2rem]">{s.title}</h3>
                  <p className="mt-2 text-ink-soft">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 lg:grid-cols-2">
          <div className="min-w-0">
            <h2 className="text-[clamp(1.8rem,3.4vw,2.6rem)]">Every answer teaches Theo something</h2>
            <p className="mt-5 max-w-[34rem] text-[1.1rem] text-ink-soft">
              Lyceo keeps track of which ideas you got on the first try and which needed a second explanation. Your next
              lesson uses it: examples from your major, explanations in the style you prefer, smaller steps where
              you&apos;ve been struggling, and review lessons built from exactly what you missed.
            </p>
          </div>

          <figure className="panel p-6 sm:p-8" aria-label="Example of a student's learning profile">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-display text-[1.35rem] font-semibold">Your learning profile</p>
              <p className="text-ink-soft">12 lessons</p>
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-3 border-b sm:gap-4 border-line pb-6">
              <div>
                <dt className="text-[0.9rem] text-ink-soft">First try</dt>
                <dd className="font-display text-[1.35rem] font-semibold sm:text-[1.9rem] text-teal">72%</dd>
              </div>
              <div>
                <dt className="text-[0.9rem] text-ink-soft">Pace</dt>
                <dd className="font-display text-[1.35rem] font-semibold sm:text-[1.9rem]">Steady</dd>
              </div>
              <div>
                <dt className="text-[0.9rem] text-ink-soft">Learns by</dt>
                <dd className="font-display text-[1.35rem] font-semibold sm:text-[1.9rem]">Analogy</dd>
              </div>
            </dl>
            <p className="mt-6 font-bold">Worth reviewing</p>
            <ul className="mt-3 space-y-2">
              {[
                ["Bayes' theorem", 'Stat 161'],
                ['Standard error', 'Stat 161'],
                ['Big-O of nested loops', 'CS 136'],
              ].map(([concept, course]) => (
                <li key={concept} className="flex items-center justify-between gap-4 rounded-lg bg-parchment px-4 py-2.5">
                  <span>{concept}</span>
                  <span className="text-[0.9rem] text-ink-soft">{course}</span>
                </li>
              ))}
            </ul>
          </figure>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-[0.95rem] text-ink-soft sm:flex-row sm:justify-between">
          <p>Named after the Lyceum, where Aristotle taught while walking with his students.</p>
          <p>Built by José Miguel Féliz at Williams College.</p>
        </div>
      </footer>
    </div>
  )
}
