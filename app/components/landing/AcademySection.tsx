import { LANDING } from '../../lib/art'
import { ChartIcon, CompassIcon, LayersIcon } from '../learn/icons'
import { SignInButton } from '../SignInButton'
import { ACADEMY_TABLET, AcademyTablet } from './AcademyPreview'
import { quadTransform, Stage } from './Stage'

// Section 2: the clean academy scene (1915 × 821, scaled with the window) with the words on its clear left side and
// My Academy on a tablet that stands on the marble ledge, between the ivy and the scholar's books. The copy and its
// order are the approved design's; positions are in the picture's pixels, so sizes are in cqw of the section.

const W = 1915
const H = 821
const v = (px: number) => `${((px / W) * 100).toFixed(3)}cqw`

// Where the tablet stands in the picture (its four corners), and the outline of the books that lie in front of it.
const TABLET_CORNERS = [
  [946, 258],
  [1622, 222],
  [1612, 707],
  [905, 694],
] as const
const BEHIND_THE_BOOKS = `polygon(0 0, ${W}px 0, ${W}px 608.5px, 1464px 609.5px, 1456px 611.5px, 1452px 617px, 1450.5px 624px, 1450.5px 646px, 1453px 652px, 1457px 655px, 1414px 656.5px, 1412px 659px, 1412.5px 662px, 1422px 666px, 1422px 698px, 1412px 700px, 1412.5px 703px, 1416px 705.5px, 1480px 712px, 1480px ${H}px, 0 ${H}px)`

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
      className="relative w-full scroll-mt-[68px] overflow-hidden bg-[#f6eee3] [container-type:inline-size]"
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
        className="absolute m-0 flex items-center whitespace-nowrap font-sans font-semibold uppercase leading-none text-[#a4701c]"
        style={{ left: v(96), top: v(98), fontSize: v(17.2), letterSpacing: '0.2em', gap: v(21) }}
      >
        <span aria-hidden="true" className="inline-block bg-[#b07a22]" style={{ width: v(62), height: v(3.5) }} />
        The modern academy
      </p>
      <h2
        id="academy-title"
        className="absolute m-0 whitespace-nowrap font-display font-semibold text-[#1d2f1a] [font-variation-settings:'opsz'_36]"
        style={{ left: v(95), top: v(140), fontSize: v(66), lineHeight: v(69), letterSpacing: '-0.012em' }}
      >
        A learning experience
        <br />
        built around you.
      </h2>
      <p
        className="absolute m-0 whitespace-nowrap font-display text-[#26302a] [font-variation-settings:'opsz'_14]"
        style={{ left: v(97), top: v(298), fontSize: v(23.5), lineHeight: v(30), letterSpacing: '-0.005em' }}
      >
        Turn your courses into a personalized learning journey,
        <br />
        from understanding today’s material to knowing
        <br />
        what to study next.
      </p>

      <ul className="absolute m-0 list-none p-0" style={{ left: v(96), top: v(414) }}>
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start" style={{ height: v(80), gap: v(32) }}>
            <span
              className="grid shrink-0 place-items-center rounded-[24%] border border-[#e9dfcf] bg-[#fbf5ec]/80 text-[#1d2f1a] shadow-[0_8px_20px_-14px_rgba(60,40,15,0.45)]"
              style={{ width: v(68), height: v(62) }}
            >
              <Icon size={0} style={{ width: v(39), height: v(39) }} />
            </span>
            <span className="block" style={{ paddingTop: v(5) }}>
              <span
                className="block whitespace-nowrap font-display font-semibold leading-none text-[#1d2f1a] [font-variation-settings:'opsz'_24]"
                style={{ fontSize: v(25.5) }}
              >
                {title}
              </span>
              <span
                className="block whitespace-nowrap font-display leading-none text-[#3a3f38] [font-variation-settings:'opsz'_16]"
                style={{ fontSize: `max(13px, ${v(17.4)})`, marginTop: v(5) }}
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
        style={{ left: v(96), top: v(678), width: v(318), height: v(54), fontSize: v(21.5) }}
      />

      {/* My Academy on its tablet, standing on the ledge; the books stay in front of it. */}
      <Stage width={W} height={H}>
        <span
          className="absolute rounded-[50%] bg-[radial-gradient(closest-side,rgba(74,50,20,0.42),rgba(74,50,20,0))]"
          style={{ left: 880, top: 686, width: 600, height: 24 }}
        />
        <div className="absolute inset-0" style={{ clipPath: BEHIND_THE_BOOKS }}>
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              ...ACADEMY_TABLET,
              transform: quadTransform(ACADEMY_TABLET.width, ACADEMY_TABLET.height, TABLET_CORNERS),
            }}
          >
            <AcademyTablet />
          </div>
        </div>
      </Stage>
    </section>
  )
}
