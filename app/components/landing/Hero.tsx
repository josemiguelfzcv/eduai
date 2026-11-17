import { SignInButton } from '../SignInButton'
import { HERO_PLACEHOLDER } from './hero-placeholder'

/**
 * Section 1 (hero) and section 2 (the Lyceo difference).
 * On large screens the copy sits in the open sky of the scene and the three benefits rest on the marble ledge.
 * Below that, the scene becomes a band at the top and everything else stacks on ivory.
 *
 * The scene is currently a plate cut from the reference image; Phase 2 swaps in layered renders and a video loop.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate xl:min-h-[clamp(680px,47vw,900px)]">
      <div
        className="relative h-[52svh] min-h-[330px] overflow-hidden bg-stone md:h-[60svh] xl:absolute xl:inset-0 xl:h-auto"
        style={{ backgroundImage: `url(${HERO_PLACEHOLDER})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/academy/hero-academy-1448.webp"
          srcSet="/academy/hero-academy-1448.webp 1448w, /academy/hero-academy-2172.webp 2172w"
          sizes="100vw"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="settle absolute inset-0 h-full w-full object-cover object-[63%_62%] md:object-center"
        />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[rgba(14,24,18,0.5)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ivory via-ivory/60 to-transparent xl:hidden" />
        <div
          className="absolute inset-0 hidden xl:block"
          style={{ background: 'radial-gradient(46% 58% at 37% 40%, rgba(250,246,238,0.5), rgba(250,246,238,0) 72%)' }}
        />
      </div>

      <div className="relative -mt-14 px-5 sm:px-8 md:mx-auto md:max-w-[52rem] xl:mx-0 xl:max-w-none xl:mt-0 xl:pl-[23%] xl:pr-8 xl:pt-[clamp(7.25rem,8.6vw,9.5rem)]">
        <h1
          id="hero-title"
          className="max-w-[13ch] text-[clamp(2.7rem,6.6vw,4.4rem)] font-medium xl:text-[clamp(2.7rem,4.7vw,5.1rem)] leading-[1.02] tracking-[-0.022em] text-ink"
        >
          <span className="rise block">Your university,</span>
          <em className="rise block font-normal text-forest" style={{ animationDelay: '110ms' }}>
            understood.
          </em>
        </h1>
        <p
          className="rise mt-5 max-w-[32rem] text-[clamp(1.08rem,1.35vw,1.28rem)] xl:max-w-[25rem] 2xl:max-w-[32rem] font-medium leading-snug text-ink"
          style={{ animationDelay: '240ms' }}
        >
          Personalized, AI-powered learning for college students.
        </p>
        <p
          className="rise mt-3 max-w-[30rem] text-ink-soft xl:max-w-[27rem] xl:text-ink/80"
          style={{ animationDelay: '320ms' }}
        >
          Lyceo knows your classes, progress, and what to study next — so you can learn smarter, stay on track, and go
          further.
        </p>
        <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '420ms' }}>
          <SignInButton
            label="Get Started Free"
            signedInLabel="Open My Academy"
            icon="arrow"
            className="btn btn-primary px-6 py-3.5"
          />
          <a href="#how" className="btn btn-quiet px-6 py-3.5 no-underline">
            See How It Works
          </a>
        </div>
      </div>

      <Difference />
    </section>
  )
}

const BENEFITS = [
  {
    title: 'Your classes, in context',
    body: 'A learning plan built around the courses you’re actually taking.',
    icon: (
      <path
        d="M16 4 3.5 10.5 16 17l12.5-6.5L16 4Zm-12.5 12L16 22.5 28.5 16M3.5 21.5 16 28l12.5-6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: 'Your progress, at a glance',
    body: 'See which ideas you got right on the first try and which need another pass.',
    icon: (
      <path
        d="M3.5 23.5 11 16l5 5L28.5 8.5m0 0H21m7.5 0V16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: 'What to study next',
    body: 'Recommendations based on your progress and your upcoming exams.',
    icon: (
      <g stroke="currentColor" strokeWidth="1.6" fill="none">
        <circle cx="16" cy="16" r="12" />
        <circle cx="16" cy="16" r="6.5" />
        <circle cx="16" cy="16" r="1.6" fill="currentColor" />
      </g>
    ),
  },
]

function Difference() {
  return (
    <section
      aria-labelledby="difference-title"
      className="relative z-10 px-5 pb-16 pt-12 sm:px-8 xl:absolute xl:inset-x-0 xl:-bottom-[1.6rem] xl:p-0"
    >
      <h2 id="difference-title" className="sr-only">
        The Lyceo difference
      </h2>
      <ul
        className="rise mx-auto grid max-w-[52rem] gap-7 lg:max-w-[70rem] lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-stone/80 xl:rounded-[1.4rem] xl:border xl:border-white/60 xl:bg-ivory/85 xl:px-4 xl:py-5 xl:shadow-[0_18px_40px_-28px_rgba(28,37,32,0.55)] xl:backdrop-blur-md"
        style={{ animationDelay: '560ms' }}
      >
        {BENEFITS.map((b) => (
          <li key={b.title} className="flex gap-4 lg:px-6">
            <svg width="32" height="32" viewBox="0 0 32 32" className="mt-0.5 shrink-0 text-forest" aria-hidden="true">
              {b.icon}
            </svg>
            <div>
              <h3 className="font-display text-[1.18rem] font-medium leading-snug">{b.title}</h3>
              <p className="mt-1 text-[0.9rem] leading-snug text-ink-soft xl:text-[0.86rem]">{b.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
