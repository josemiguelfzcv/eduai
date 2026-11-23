import { ChartIcon, CompassIcon, LayersIcon } from '../learn/icons'
import { LANDING } from '../../lib/art'
import { SignInButton } from '../SignInButton'
import { AcademyPreview } from './AcademyPreview'
import { Parallax } from './Parallax'

const FEATURES = [
  {
    icon: LayersIcon,
    title: 'My Academy',
    text: 'Courses, lectures, assignments, and materials organized in one place.',
  },
  { icon: ChartIcon, title: 'Your Progress', text: 'Understanding tracked through genuine learning evidence.' },
  { icon: CompassIcon, title: 'What to Study Next', text: 'Recommendations informed by your learning history.' },
]

/**
 * Section 2: My Academy. The academy's portico frames the section: its courtyard on the left behind the words, the
 * scholar's bust and books on the right. My Academy itself sits between them.
 */
export function AcademySection() {
  return (
    <section
      id="academy"
      aria-labelledby="academy-title"
      className="relative scroll-mt-[76px] overflow-hidden bg-[#f4ecdf]"
    >
      <Parallax speed={0.08} className="absolute inset-x-0 -bottom-[5%] -top-[5%]">
        {/* The scene is mirrored so the bust faces into the section. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LANDING.academy}
          alt=""
          loading="lazy"
          className="h-full w-full -scale-x-100 object-cover object-[50%_42%]"
        />
      </Parallax>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(250,245,236,0.97)_0%,rgba(250,245,236,0.93)_32%,rgba(250,245,236,0.55)_47%,rgba(250,245,236,0)_62%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#f7f0e4]/80 to-transparent"
      />

      <div className="relative grid min-h-[clamp(780px,60vw,960px)] grid-cols-[minmax(0,41fr)_minmax(0,59fr)] items-center gap-[2.5%] pl-[clamp(3rem,6vw,8rem)] pr-[2%]">
        <div className="max-w-[38rem] py-28">
          <p className="flex items-center gap-4 text-[0.98rem] font-semibold uppercase tracking-[0.22em] text-[#94661c]">
            <span aria-hidden="true" className="h-[3px] w-16 rounded-full bg-[#b9893a]" />
            The modern academy
          </p>
          <h2
            id="academy-title"
            className="mt-8 font-display text-[clamp(2.8rem,3.5vw,4rem)] font-bold leading-[1.04] tracking-[-0.03em] text-[#1a3020]"
          >
            A learning experience built around you.
          </h2>
          <p className="mt-6 max-w-[34rem] font-display text-[1.35rem] leading-[1.45] text-[#26302a]">
            Turn your courses into a personalized learning journey, from understanding today’s material to knowing what
            to study next.
          </p>
          <ul className="mt-9 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-5">
                <span className="grid size-[3.6rem] shrink-0 place-items-center rounded-2xl border border-[#e6dccb] bg-[#fdf9f2] text-[#1a3020] shadow-[0_8px_20px_-16px_rgba(60,40,15,0.6)]">
                  <Icon size={26} />
                </span>
                <span>
                  <span className="block font-display text-[1.45rem] font-semibold leading-tight text-[#1a3020]">
                    {title}
                  </span>
                  <span className="mt-1 block font-display text-[1.08rem] text-[#3a3f38]">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <SignInButton
            label="Discover My Academy"
            signedInLabel="Discover My Academy"
            icon="arrow"
            className="mt-11 inline-flex items-center gap-3 rounded-full bg-[#173a20] px-9 py-[1rem] font-display text-[1.22rem] text-[#fbf5ea] shadow-[0_14px_30px_-16px_rgba(20,45,20,0.8)] transition-colors hover:bg-[#21492b]"
          />
        </div>
        <div className="relative pb-10 pt-20">
          <AcademyPreview />
        </div>
      </div>
    </section>
  )
}
