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

const NAV = ['My Academy', 'Classes', 'Progress', 'Study plan']

const UPCOMING = [
  { what: 'Stats midterm', when: 'in 3 days' },
  { what: 'CS problem set', when: 'Friday' },
  { what: 'Econ quiz', when: 'next week' },
]

const TODAY = [
  { what: 'Review standard error', minutes: 12 },
  { what: 'Practice Big-O', minutes: 10 },
  { what: 'Lesson: elasticity', minutes: 15 },
]

function AcademyPreview() {
  return (
    <figure className="relative min-w-0">
      <div
        aria-hidden="true"
        className="select-none xl:origin-left xl:[transform:perspective(1900px)_rotateY(-7deg)_rotateX(1.5deg)]"
      >
        <div className="overflow-hidden rounded-[1.3rem] border border-line bg-panel shadow-[0_50px_90px_-50px_rgba(28,37,32,0.6)]">
          <div className="grid md:grid-cols-[10.5rem_1fr]">
            <div className="hidden flex-col gap-1 bg-forest p-4 text-ivory md:flex">
              <div className="mb-5 flex items-center gap-2 px-1">
                <ThetaMark tone="light" size={22} />
                <span className="font-display text-[1.15rem]">Lyceo</span>
              </div>
              {NAV.map((item, i) => (
                <div
                  key={item}
                  className={`rounded-lg px-3 py-2 text-[0.8rem] ${i === 0 ? 'bg-forest-soft font-semibold text-ivory' : 'text-ivory/70'}`}
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="min-w-0 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="whitespace-nowrap font-display text-[1.35rem] italic">My Academy</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-ivory-deep px-2.5 py-1 text-[0.68rem] font-semibold text-ink-soft">
                    Example data
                  </span>
                  <span className="hidden rounded-full border border-line px-3 py-1 text-[0.72rem] text-ink-soft sm:inline">
                    Fall 2026
                  </span>
                </div>
              </div>

              <div className="relative mt-4 overflow-hidden rounded-xl border border-line">
                <div
                  className="absolute inset-0 bg-cover"
                  style={{ backgroundImage: 'url(/academy/hero-academy-1448.webp)', backgroundPosition: '80% 58%' }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/90 to-panel/0" />
                <div className="relative px-5 py-5 sm:py-6">
                  <p className="font-display text-[1.55rem] leading-tight">Good afternoon.</p>
                  <p className="mt-1 max-w-[17rem] text-[0.8rem] text-ink-soft">
                    Here’s your plan for today, built from your courses.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <PreviewCard title="Your classes" value="4 active courses" />
                <PreviewCard title="Academic pulse" value="78% of concepts mastered" spark />
                <PreviewCard title="Study next" value="Review: standard error" note="Statistics 201" />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line p-4">
                  <p className="text-[0.76rem] font-semibold text-ink-soft">Upcoming</p>
                  <ul className="mt-2 space-y-2">
                    {UPCOMING.map((u) => (
                      <li key={u.what} className="flex items-baseline justify-between gap-3 text-[0.8rem]">
                        <span className="truncate">{u.what}</span>
                        <span className="shrink-0 text-ink-soft">{u.when}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-line p-4">
                  <p className="text-[0.76rem] font-semibold text-ink-soft">Today</p>
                  <ul className="mt-2 space-y-2">
                    {TODAY.map((t) => (
                      <li key={t.what} className="flex items-baseline justify-between gap-3 text-[0.8rem]">
                        <span className="truncate">{t.what}</span>
                        <span className="shrink-0 text-ink-soft">{t.minutes} min</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-5 text-[0.85rem] text-ink-soft">
        Illustrative preview. The courses, dates and progress shown are example data.
      </figcaption>
    </figure>
  )
}

function PreviewCard({
  title,
  value,
  note,
  spark = false,
}: {
  title: string
  value: string
  note?: string
  spark?: boolean
}) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-[0.76rem] font-semibold text-ink-soft">{title}</p>
      <p className="mt-1.5 text-[0.88rem] font-medium leading-snug">{value}</p>
      {note && <p className="mt-0.5 text-[0.76rem] text-ink-soft">{note}</p>}
      {spark && (
        <svg viewBox="0 0 120 28" className="mt-2 h-6 w-full text-moss" aria-hidden="true">
          <path
            d="M2 24 L18 21 L34 22 L50 16 L66 17 L82 11 L98 9 L118 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}
