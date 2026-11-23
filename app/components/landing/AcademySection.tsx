import { LANDING } from '../../lib/art'
import { ChartIcon, CompassIcon, LayersIcon } from '../learn/icons'
import { SignInButton } from '../SignInButton'
import { ACADEMY_SCREEN, AcademyScreen } from './AcademyPreview'
import { quadTransform, Stage } from './Stage'

// Section 2, as the approved design: a 1671 × 941 picture that scales with the window. The words and the three
// capabilities on the light left; My Academy on the tablet, which stands between the ivy and the scholar's bust.
// Positions are measured on the design, in its pixels, so sizes are in cqw of the section.

const W = 1671
const H = 941
const v = (px: number) => `${((px / W) * 100).toFixed(3)}cqw`

// The tablet's screen in the picture (its corners, measured), and the book that stands in front of its lower right.
const SCREEN_CORNERS = [
  [771.2, 282.3],
  [1509.3, 239.3],
  [1498.1, 754.2],
  [726.6, 735.9],
] as const
const BOOK_IN_FRONT = `polygon(0 0, ${W}px 0, ${W}px 702.5px, 1392px 702.5px, 1387px 705px, 1383px 711px, 1381px 720px, 1381px 736px, 1384px 744px, 1358px 748px, 1355px ${H}px, 0 ${H}px)`

const FEATURES = [
  { icon: LayersIcon, title: 'My Academy', text: 'All your courses, connected and organized.' },
  { icon: ChartIcon, title: 'Your Progress', text: 'Track your understanding and build mastery over time.' },
  {
    icon: CompassIcon,
    title: 'What to Study Next',
    text: 'Personalized recommendations that keep you moving forward.',
  },
]

export function AcademySection() {
  return (
    <section
      id="academy"
      aria-labelledby="academy-title"
      className="relative w-full scroll-mt-[76px] overflow-hidden bg-[#f6eee3] [container-type:inline-size]"
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LANDING.academy}
        alt=""
        width={W}
        height={H}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />

      <p
        className="absolute m-0 flex items-center font-sans font-semibold uppercase leading-none text-[#a4701c]"
        style={{ left: v(94), top: v(122), fontSize: v(17.6), letterSpacing: '0.2em', gap: v(22) }}
      >
        <span aria-hidden="true" className="inline-block bg-[#b07a22]" style={{ width: v(64), height: v(3.5) }} />
        The modern academy
      </p>
      <h2
        id="academy-title"
        className="absolute m-0 whitespace-nowrap font-display font-semibold text-[#1d2f1a] [font-variation-settings:'opsz'_36]"
        style={{ left: v(93), top: v(178), fontSize: v(69), lineHeight: v(72.5), letterSpacing: '-0.012em' }}
      >
        A learning experience
        <br />
        built around you.
      </h2>
      <p
        className="absolute m-0 whitespace-nowrap font-display text-[#26302a] [font-variation-settings:'opsz'_14]"
        style={{ left: v(96), top: v(338), fontSize: v(24.5), lineHeight: v(31), letterSpacing: '-0.005em' }}
      >
        Turn your courses into a personalized learning journey,
        <br />
        from understanding today’s material to knowing
        <br />
        what to study next.
      </p>

      <ul className="absolute m-0 list-none p-0" style={{ left: v(95), top: v(466) }}>
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start" style={{ height: v(86), gap: v(34) }}>
            <span
              className="grid shrink-0 place-items-center rounded-[24%] border border-[#e9dfcf] bg-[#fbf5ec]/80 text-[#1d2f1a] shadow-[0_8px_20px_-14px_rgba(60,40,15,0.45)]"
              style={{ width: v(73), height: v(66) }}
            >
              <Icon size={0} style={{ width: v(42), height: v(42) }} />
            </span>
            <span className="block" style={{ paddingTop: v(6) }}>
              <span
                className="block whitespace-nowrap font-display font-semibold leading-none text-[#1d2f1a] [font-variation-settings:'opsz'_24]"
                style={{ fontSize: v(27) }}
              >
                {title}
              </span>
              <span
                className="block whitespace-nowrap font-display leading-none text-[#3a3f38] [font-variation-settings:'opsz'_16]"
                style={{ fontSize: v(18.4), marginTop: v(4) }}
              >
                {text}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <SignInButton
        label="Discover My Academy"
        signedInLabel="Discover My Academy"
        icon="arrow"
        className="absolute inline-flex items-center justify-center rounded-full bg-[#1d2f1a] font-display font-medium text-[#f6f0e4] shadow-[0_14px_30px_-18px_rgba(20,45,20,0.8)] transition-colors hover:bg-[#26401f] [&_.btn-arrow]:ml-[0.7em] [&_.btn-arrow]:size-[1.05em]"
        style={{ left: v(96), top: v(757), width: v(338), height: v(58), fontSize: v(23) }}
      />

      {/* My Academy on the tablet's screen. */}
      <Stage width={W} height={H}>
        <div className="absolute inset-0" style={{ clipPath: BOOK_IN_FRONT }}>
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              ...ACADEMY_SCREEN,
              transform: quadTransform(ACADEMY_SCREEN.width, ACADEMY_SCREEN.height, SCREEN_CORNERS),
            }}
          >
            <AcademyScreen />
          </div>
        </div>
      </Stage>
    </section>
  )
}
