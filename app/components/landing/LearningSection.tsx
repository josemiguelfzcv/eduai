import { PencilIcon, PlayIcon, RepeatIcon } from '../learn/icons'
import { LANDING } from '../../lib/art'
import { LearningPreview } from './LearningPreview'
import { Parallax, Reveal } from './Parallax'

const FEATURES = [
  { icon: PlayIcon, title: 'Interactive lessons', text: 'Understand key ideas with clear, personalized explanations.' },
  { icon: PencilIcon, title: 'Practice with feedback', text: 'Build real understanding, not just the right answer.' },
  { icon: RepeatIcon, title: 'Revisit and reinforce', text: 'Review what matters, at the right time for you.' },
]

/** Section 3: how Lyceo teaches. The real lecture workspace, set in the academy's stoa. */
export function LearningSection() {
  return (
    <section
      id="learning"
      aria-labelledby="learning-title"
      className="relative scroll-mt-[76px] overflow-hidden bg-[#f6efe3]"
    >
      <Parallax speed={0.1} className="absolute inset-x-0 -bottom-[6%] -top-[6%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LANDING.learning} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_60%]" />
      </Parallax>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(248,242,231,0.94)_0%,rgba(248,242,231,0.8)_26%,rgba(248,242,231,0.55)_50%,rgba(248,242,231,0.72)_76%,rgba(248,242,231,0.9)_100%)]"
      />

      <Reveal className="relative grid min-h-[clamp(660px,46vw,800px)] grid-cols-[minmax(0,29fr)_minmax(0,48fr)_minmax(0,23fr)] items-center gap-[2.5%] px-[clamp(2.5rem,4vw,5rem)] py-20">
        <div>
          <p className="flex items-center gap-3 whitespace-nowrap text-[0.9rem] font-semibold uppercase tracking-[0.18em] text-[#94661c]">
            <span aria-hidden="true" className="h-[3px] w-10 shrink-0 rounded-full bg-[#b9893a]" />
            The learning experience
          </p>
          <h2
            id="learning-title"
            className="mt-8 font-display text-[clamp(2.5rem,2.95vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.03em] text-[#1a3020]"
          >
            From curiosity to understanding
          </h2>
          <p className="mt-6 font-display text-[1.3rem] leading-[1.5] text-[#26302a]">
            Every lecture holds something worth discovering. Lyceo helps you uncover it, understand it, and make it
            yours.
          </p>
        </div>
        <LearningPreview />
        <ul className="space-y-[clamp(1.5rem,2.2vw,2.25rem)]">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-[clamp(0.9rem,1.2vw,1.25rem)]">
              <span className="grid size-[clamp(2.7rem,3.3vw,3.6rem)] shrink-0 place-items-center rounded-2xl border border-[#e6dccb] bg-[#fdf9f2] text-[#1a3020] shadow-[0_8px_20px_-16px_rgba(60,40,15,0.6)]">
                <Icon size={24} />
              </span>
              <span>
                <span className="block font-display text-[clamp(1.12rem,1.45vw,1.42rem)] font-semibold leading-tight text-[#1a3020]">
                  {title}
                </span>
                <span className="mt-1 block font-display text-[clamp(0.92rem,1.08vw,1.06rem)] leading-snug text-[#3a3f38]">
                  {text}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}
