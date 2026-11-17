import Link from 'next/link'
import { DEMO_LESSON } from '../../lib/demo-lesson'
import { Board } from '../Board'
import { ArrowIcon } from '../SignInButton'
import { Theo } from '../Theo'

const PUZZLE = DEMO_LESSON.segments[3]

const STEPS = [
  {
    title: 'Learn one idea at a time',
    body: 'A narrated lesson built from your own material, with the formulas written on the board as Theo talks.',
  },
  {
    title: 'Answer a check-in',
    body: 'One short question in your own words after each part. Theo grades the idea, not the wording.',
  },
  {
    title: 'Get a different explanation',
    body: 'Miss it, and Theo tries a new angle built around what you answered. Then you try again.',
  },
]

/** Section 4: what studying looks like. The board and the feedback are the real product, from the public demo lesson. */
export function ClassroomSection() {
  return (
    <section id="how" aria-labelledby="how-title" className="border-y border-line bg-ivory-deep/55">
      <div className="mx-auto grid max-w-[80rem] items-center gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-32">
        <div>
          <p className="eyebrow">Interactive learning</p>
          <h2 id="how-title" className="mt-5 max-w-[16ch] text-[clamp(2.3rem,4vw,3.5rem)]">
            A lesson that checks in with you.
          </h2>
          <p className="mt-5 max-w-[32rem] text-[1.05rem] text-ink-soft">
            When you start studying, Theo, your tutor, guides you through the lesson instead of waiting for questions.
          </p>
          <ol className="mt-10 space-y-7">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-forest/25 font-display text-[1rem] text-forest"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-[1.25rem] leading-snug">{s.title}</h3>
                  <p className="mt-1 max-w-[30rem] text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/demo" className="btn btn-primary px-6 py-3.5 no-underline">
              Try a 5-minute lesson
              <ArrowIcon />
            </Link>
            <span className="text-[0.92rem] text-ink-soft">No account needed.</span>
          </div>
        </div>

        <div className="relative min-w-0 sm:pb-10">
          <Board
            lines={PUZZLE.board}
            revealed={PUZZLE.board.length}
            className="board-compact min-h-[300px] sm:min-h-[400px]"
          >
            {/* keeps the formulas clear of the check-in card that overlaps the bottom of the board */}
            <div className="hidden h-36 sm:block" aria-hidden="true" />
          </Board>
          <Theo size={104} className="pointer-events-none absolute -top-10 right-3 sm:-right-6" />
          <div className="panel relative mx-3 -mt-8 p-4 shadow-[0_24px_50px_-30px_rgba(28,37,32,0.6)] sm:absolute sm:bottom-0 sm:right-8 sm:mx-0 sm:mt-0 sm:w-[21rem]">
            <p className="text-[0.92rem] font-medium leading-snug">
              Roughly what’s the chance that someone who tests positive is actually sick?
            </p>
            <p className="mt-3 rounded-lg bg-ivory-deep px-3 py-2 text-[0.88rem]">“About 95%?”</p>
            <div className="mt-3 border-l-[3px] border-terracotta pl-3">
              <p className="text-[0.85rem] font-semibold text-terracotta">Not quite yet.</p>
              <p className="text-[0.85rem] text-ink-soft">
                95% is how often the test catches the disease. Let’s count 1,000 people instead.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
