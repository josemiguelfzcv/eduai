import { LANDING } from '../../lib/art'
import { LaurelMark } from '../learn/LaurelMark'

// Section 4, as the approved design: a 1920 × 819 frame of the academy's landscape that scales with the window, the
// words on its sky at the left, and the laurel carved into the stone at the right. Positions are measured on that
// frame, so sizes are in cqw of the section. The Lyceum isn't built yet, and the section says so.

const v = (px: number) => `${((px / 1920) * 100).toFixed(3)}cqw`

// The landscape (1672 × 941) covers the wider frame; this is the part of its height the design shows.
const SCENE_Y = 49
// The stone's face in the landscape, as fractions of its width (x) and height (y), and the carving's width.
const STONE = { x: 0.9285, y: 0.6854, width: 0.045 }

export function LyceumSection() {
  // Where the stone lands in the frame, given how the landscape covers it.
  const sceneHeight = (941 / 1672) * 1920
  const offset = ((sceneHeight - 819) * SCENE_Y) / 100
  const carvingTop = STONE.y * sceneHeight - offset
  return (
    <section
      id="lyceum"
      aria-labelledby="lyceum-title"
      className="relative w-full scroll-mt-[68px] overflow-hidden bg-[#efe4d0] [container-type:inline-size]"
      style={{ aspectRatio: '1920 / 819' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LANDING.lyceum}
        alt=""
        width={1672}
        height={941}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: `50% ${SCENE_Y}%` }}
      />
      {/* The design's warm haze behind the words, so they read over the hills. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(36% 46% at 31% 33%, rgba(250,240,228,0.7), rgba(250,240,228,0.4) 55%, rgba(250,240,228,0) 90%)',
        }}
      />
      {/* The laurel carved into the stone: gilded, set into the marble. */}
      <LaurelMark
        size={0}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[#8c6526] mix-blend-multiply"
        style={{
          left: `${STONE.x * 100}%`,
          top: v(carvingTop),
          width: v(STONE.width * 1920),
          height: v(STONE.width * 1920),
          filter: 'drop-shadow(0.6px 0.8px 0 rgba(70,45,10,0.45)) drop-shadow(-0.5px -0.5px 0 rgba(255,246,228,0.5))',
        }}
      />

      <p
        className="absolute flex items-center font-sans font-semibold uppercase leading-none text-[#a77324]"
        style={{ left: v(347), top: v(142), fontSize: v(18.4), letterSpacing: '0.16em', gap: v(13) }}
      >
        <span aria-hidden="true" className="inline-block bg-[#9b6608]" style={{ width: v(33), height: v(3) }} />
        The Lyceum
        <span className="sr-only"> (coming soon)</span>
      </p>
      <h2
        id="lyceum-title"
        className="absolute m-0 font-display font-semibold text-[#20301f] [font-variation-settings:'opsz'_18]"
        style={{ left: v(346), top: v(192), fontSize: v(56.8), lineHeight: v(59) }}
      >
        An entire world of
        <br />
        knowledge, waiting to be explored.
      </h2>
      <p
        className="absolute m-0 font-display text-[#252f26] [font-variation-settings:'opsz'_20]"
        style={{ left: v(348), top: v(327), fontSize: v(27), lineHeight: v(32) }}
      >
        A living academy of ideas, disciplines, and discovery.
      </p>
      <p
        className="absolute m-0 inline-flex items-center justify-center rounded-full border-2 border-[#e9b043] bg-[rgba(38,40,36,0.6)] font-sans font-semibold text-[#ecb24a] backdrop-blur-[1px]"
        style={{ left: v(345), top: v(390), width: v(224), height: v(60), fontSize: v(21) }}
      >
        Coming Soon
      </p>
    </section>
  )
}
