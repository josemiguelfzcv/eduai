import { HERO_MOTION, LANDING } from '../../lib/art'
import { SignInButton } from '../SignInButton'
import { HeroScene } from './HeroScene'
import { Parallax } from './Parallax'

// Section 1, the approved hero. It fills the window exactly, so the next section never shows under it, and the scene
// covers it. The words sit where the design puts them on its 1672 × 941 frame; one design pixel is the frame scaled
// to the section (by its width or its height, whichever is tighter), so nothing outgrows the window. The headline and
// the wordmark are set calmer than the mockup: at full screen its sizes were overwhelming.

const W = 1672
const H = 941
/** Past this the words stop growing with the window (very large displays). */
const LARGEST = 1.2
const v = (px: number) =>
  `${px < 0 ? 'max' : 'min'}(${((px / W) * 100).toFixed(3)}cqw, ${((px / H) * 100).toFixed(3)}cqh, ${(px * LARGEST).toFixed(1)}px)`

export function Hero() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative h-svh max-h-[62.5vw] min-h-[520px] w-full overflow-hidden bg-[#efe6d4] [container-type:size]"
    >
      <Parallax speed={0.18} startAtTop className="absolute inset-0">
        <HeroScene src={LANDING.hero} motion={HERO_MOTION} width={W} height={H} />
      </Parallax>
      {/* The design's warm haze: light over the sky, strongest behind the words so they read. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(251,242,231,0.4),rgba(251,242,231,0.2)_46%,rgba(251,242,231,0)_66%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bg-[radial-gradient(closest-side,rgba(252,245,236,0.86),rgba(252,245,236,0.58)_50%,rgba(252,245,236,0)_88%)]"
        style={{ left: v(-150), top: v(-36), width: v(1338), height: v(940) }}
      />
      {/* The morning light, breathing slowly. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-8%] top-[-30%] h-[90%] w-[62%] rounded-full bg-[radial-gradient(closest-side,rgba(255,243,222,0.35),rgba(255,243,222,0))] motion-safe:animate-[sun-breathe_14s_ease-in-out_infinite]"
      />

      <p
        className="absolute m-0 whitespace-nowrap font-sans font-semibold uppercase leading-none text-[#a4701c]"
        style={{ left: v(226), top: v(228), fontSize: v(16.2), letterSpacing: '0.258em' }}
      >
        The Lyceum, reimagined
      </p>
      <span
        aria-hidden="true"
        className="absolute bg-[#9e6a10]"
        style={{ left: v(226), top: v(270), width: v(72), height: v(3.5) }}
      />
      <h1
        id="hero-title"
        className="absolute m-0 whitespace-nowrap font-display font-[650] text-[#1d2f1a] [font-variation-settings:'opsz'_36]"
        style={{ left: v(225), top: v(296), fontSize: v(84), lineHeight: v(77), letterSpacing: '0.012em' }}
      >
        For minds
        <br />
        in motion.
      </h1>
      <p
        className="absolute m-0 whitespace-nowrap font-display text-[#283a26] [font-variation-settings:'opsz'_24]"
        style={{ left: v(227), top: v(463), fontSize: v(25.5), lineHeight: v(31) }}
      >
        Inspired by the thinkers of yesterday.
        <br />
        Built for the curious minds of tomorrow.
      </p>

      <div className="absolute flex items-center" style={{ left: v(225), top: v(553), gap: v(20) }}>
        <SignInButton
          label="Enter the Academy"
          signedInLabel="Enter the Academy"
          icon="arrow"
          className="inline-flex items-center justify-center rounded-full bg-[#1d2f1a] font-display font-medium text-[#f6f0e4] shadow-[0_14px_30px_-18px_rgba(20,45,20,0.8)] transition-colors hover:bg-[#26401f] [&_.btn-arrow]:ml-[0.75em] [&_.btn-arrow]:size-[1em]"
          style={{ width: v(248), height: v(47), fontSize: v(19.5) }}
        />
        <a
          href="#academy"
          className="inline-flex items-center justify-center rounded-full border-2 border-[#1d2f1a]/70 bg-[#f6ede2]/85 font-display font-medium text-[#1d2a1d] no-underline backdrop-blur-[2px] transition-colors hover:bg-[#fbf5ec]"
          style={{ width: v(196), height: v(47), fontSize: v(19.5) }}
        >
          Explore Lyceo
        </a>
      </div>
    </section>
  )
}
