import { LANDING } from '../../lib/art'
import { PencilIcon, PlayIcon, RepeatIcon } from '../learn/icons'
import { LEARNING_SCREEN, LearningScreen } from './LearningPreview'
import { Stage } from './Stage'

// Section 3, as the approved design: a 1916 × 821 picture that scales with the window. The words on the left, a
// lecture on the laptop in the middle, the three ways Lyceo teaches on the right. Positions are measured on the
// design, in its pixels, so sizes are in cqw of the section.

const W = 1916
const H = 821
const v = (px: number) => `${((px / W) * 100).toFixed(3)}cqw`

// The laptop's screen in the picture.
const SCREEN = { left: 517, top: 112 }

const FEATURES = [
  {
    icon: PlayIcon,
    title: 'Interactive lessons',
    text: ['Understand key ideas with clear,', 'personalized explanations.'],
  },
  {
    icon: PencilIcon,
    title: 'Practice with feedback',
    text: ['Build real understanding, not', 'just the right answer.'],
  },
  { icon: RepeatIcon, title: 'Revisit and reinforce', text: ['Review what matters, at the right', 'time for you.'] },
]

export function LearningSection() {
  return (
    <section
      id="learning"
      aria-labelledby="learning-title"
      className="relative w-full scroll-mt-[76px] overflow-hidden bg-[#f6eee4] [container-type:inline-size]"
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LANDING.learning}
        alt=""
        width={W}
        height={H}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />

      <p
        className="absolute m-0 flex items-center whitespace-nowrap font-sans font-semibold uppercase leading-none text-[#a4701c]"
        style={{ left: v(60), top: v(205.4), fontSize: v(19), letterSpacing: '0.134em', gap: v(18) }}
      >
        <span
          aria-hidden="true"
          className="inline-block rounded-full bg-[#a87623]"
          style={{ width: v(44), height: v(4) }}
        />
        The learning experience
      </p>
      <h2
        id="learning-title"
        className="absolute m-0 whitespace-nowrap font-display font-semibold text-[#1d2f1a] [font-variation-settings:'opsz'_24]"
        style={{ left: v(58), top: v(268.7), fontSize: v(60), lineHeight: v(60), letterSpacing: '-0.035em' }}
      >
        From curiosity to
        <br />
        understanding
      </h2>
      <p
        className="absolute m-0 whitespace-nowrap font-display text-[#26302a] [font-variation-settings:'opsz'_36]"
        style={{ left: v(61), top: v(399.6), fontSize: v(24.3), lineHeight: v(34) }}
      >
        Every lecture holds something worth
        <br />
        discovering. Lyceo helps you uncover it,
        <br />
        understand it, and make it yours.
      </p>

      <ul className="absolute m-0 list-none p-0" style={{ left: v(1474), top: v(218) }}>
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start" style={{ height: v(131), gap: v(27) }}>
            <span
              className="grid shrink-0 place-items-center rounded-[22%] border border-[#e8d7bd] bg-gradient-to-b from-[#fdf6ec] to-[#f3e6d2] text-[#1d2f1a] shadow-[0_10px_22px_-16px_rgba(70,45,15,0.5)]"
              style={{ width: v(72), height: v(72) }}
            >
              <Icon size={0} strokeWidth={1.6} style={{ width: v(42), height: v(42) }} />
            </span>
            <span className="block">
              <span
                className="block whitespace-nowrap font-display font-semibold leading-none text-[#1d2f1a] [font-variation-settings:'opsz'_36]"
                style={{ fontSize: v(29.5), letterSpacing: '-0.005em' }}
              >
                {title}
              </span>
              <span
                className="block whitespace-nowrap font-display text-[#2f342d] [font-variation-settings:'opsz'_16]"
                style={{ fontSize: v(21), lineHeight: v(27), marginTop: v(3) }}
              >
                {text[0]}
                <br />
                {text[1]}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* A lecture on the laptop's screen. */}
      <Stage width={W} height={H}>
        <div className="absolute" style={{ ...SCREEN, ...LEARNING_SCREEN }}>
          <LearningScreen />
        </div>
      </Stage>
    </section>
  )
}
