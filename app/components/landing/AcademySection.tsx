import { ThetaMark } from '../Logo'
import { SignInButton } from '../SignInButton'

/** Section 3: My Academy, with an illustrative product preview. Everything in the preview is labeled as example data. */
export function AcademySection() {
  return (
    <section id="academy" aria-labelledby="academy-title" className="relative">
      <div className="mx-auto grid max-w-[80rem] items-center gap-14 px-5 py-24 sm:px-8 lg:py-32 xl:grid-cols-[0.8fr_1.2fr] xl:gap-16">
        <div>
          <p className="eyebrow">My Academy</p>
          <h2 id="academy-title" className="mt-5 max-w-[14ch] text-[clamp(2.3rem,4vw,3.5rem)]">
            Your semester, in one place.
          </h2>
          <p className="mt-5 max-w-[30rem] text-[1.05rem] text-ink-soft">
            Your personal learning space. See your classes, track your progress, and get a clear plan for what to study
            next.
          </p>
          <SignInButton
            label="Explore My Academy"
            signedInLabel="Open My Academy"
            icon="arrow"
            className="btn btn-primary mt-9 px-6 py-3.5"
          />
        </div>
        <AcademyPreview />
      </div>
    </section>
  )
}

// A small-scale copy of the real My Academy screen. Every value is example data and labeled as such.
const STEPS = [
  {
    title: 'Review “Standard error”',
    course: 'Statistics 201',
    minutes: 6,
    why: 'You missed this on the first try this week. Midterm 2 is in 3 days.',
    action: 'Start review',
  },
  {
    title: 'Continue Binary search trees',
    course: 'Data Structures',
    minutes: 6,
    why: 'You stopped after part 2 of 5.',
    action: 'Continue',
  },
  {
    title: 'Add material for Linear Algebra',
    course: 'Linear Algebra',
    minutes: 5,
    why: 'Exam 2 is in 7 days. There’s nothing to study for it yet.',
    action: 'Add material',
  },
]

const UPCOMING = [
  { month: 'Nov', day: 20, title: 'Midterm 2', course: 'Statistics 201', when: 'In 3 days', soon: true },
  { month: 'Nov', day: 21, title: 'Problem set 7', course: 'Data Structures', when: 'In 4 days', soon: false },
  { month: 'Nov', day: 24, title: 'Exam 2', course: 'Linear Algebra', when: 'In 7 days', soon: false },
]

function AcademyPreview() {
  return (
    <figure className="relative min-w-0">
      <div
        aria-hidden="true"
        className="select-none xl:origin-left xl:[transform:perspective(1900px)_rotateY(-7deg)_rotateX(1.5deg)]"
      >
        <div className="overflow-hidden rounded-[1.3rem] border border-line bg-ivory shadow-[0_50px_90px_-50px_rgba(28,37,32,0.6)]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <ThetaMark size={20} />
              <span className="font-display text-[1.1rem]">Lyceo</span>
            </div>
            <div className="flex items-center gap-1 text-[0.72rem]">
              <span className="rounded-md bg-ivory-deep px-2 py-1 font-semibold">My Academy</span>
              <span className="hidden px-2 py-1 text-ink-soft sm:inline">New lesson</span>
              <span className="hidden px-2 py-1 text-ink-soft sm:inline">Profile</span>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-[1.6rem] leading-tight">Good afternoon.</p>
                <p className="mt-1 text-[0.78rem] text-ink-soft">3 steps for today, about 17 minutes.</p>
              </div>
              <span className="rounded-full bg-ivory-deep px-2.5 py-1 text-[0.68rem] font-semibold text-ink-soft">
                Example data
              </span>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="font-display text-[1.1rem]">What to study today</p>
                <ol className="mt-2.5 space-y-2">
                  {STEPS.map((step, i) => (
                    <li key={step.title} className="flex gap-3 rounded-xl border border-line bg-panel p-3">
                      <span className="w-3 shrink-0 font-display text-[1.1rem] leading-[1.2] text-gold-deep">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[0.95rem] leading-snug">{step.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.66rem] text-ink-soft">
                          <span className="rounded-full bg-ivory-deep px-2 py-0.5 font-medium text-ink">
                            {step.course}
                          </span>
                          <span>About {step.minutes} min</span>
                        </div>
                        <p className="mt-1.5 text-[0.72rem] leading-snug text-ink-soft">{step.why}</p>
                      </div>
                      <span
                        className={`hidden shrink-0 self-center rounded-full px-3 py-1.5 text-[0.68rem] font-semibold sm:inline ${
                          i === 0 ? 'bg-forest text-ivory' : 'border border-stone text-ink'
                        }`}
                      >
                        {step.action}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="hidden min-w-0 md:block">
                <p className="font-display text-[1.1rem]">Upcoming</p>
                <ul className="mt-1 divide-y divide-line">
                  {UPCOMING.map((u) => (
                    <li key={u.title} className="flex items-start gap-2.5 py-2.5">
                      <div className="w-9 shrink-0 rounded-md border border-line bg-panel py-0.5 text-center">
                        <div className="text-[0.55rem] font-semibold text-ink-soft">{u.month}</div>
                        <div className="font-display text-[0.95rem] leading-none">{u.day}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.76rem] font-medium leading-snug">{u.title}</p>
                        <p className="text-[0.64rem] text-ink-soft">{u.course}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold ${
                          u.soon ? 'border-terracotta/40 text-terracotta' : 'border-gold/60 text-gold-deep'
                        }`}
                      >
                        {u.when}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-xl border border-line bg-panel p-3">
                  <p className="font-display text-[0.92rem]">Statistics 201</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-ivory-deep">
                    <div className="h-full w-3/5 rounded-full bg-moss" />
                  </div>
                  <p className="mt-1.5 text-[0.64rem]">3 of 5 concepts right on the first try</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-5 text-[0.85rem] text-ink-soft">
        Illustrative preview of My Academy. The courses, dates and progress shown are example data.
      </figcaption>
    </figure>
  )
}
