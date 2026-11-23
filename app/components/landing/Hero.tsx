import { LANDING } from '../../lib/art'
import { SignInButton } from '../SignInButton'
import { Parallax } from './Parallax'

// Section 1, exactly as the approved hero: the scene fills a 1672 × 941 frame that scales with the window, and the
// words sit where the design puts them (positions measured on that frame, so every size is in cqw of the section). At rest the
// scene and the words line up as designed; as the page scrolls away, the scene drifts a little behind them.

const v = (px: number) => `${((px / 1672) * 100).toFixed(3)}cqw`

export function Hero() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative w-full overflow-hidden bg-[#efe6d4] [container-type:inline-size]"
      style={{ aspectRatio: '1672 / 941' }}
    >
      <Parallax speed={0.18} startAtTop className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LANDING.hero}
          alt=""
          width={1672}
          height={941}
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </Parallax>
      {/* The design's warm haze: light over the sky, strongest behind the words so they read. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(40% 50% at 31% 46%, rgba(252,245,236,0.86), rgba(252,245,236,0.58) 50%, rgba(252,245,236,0) 88%), linear-gradient(to bottom, rgba(251,242,231,0.4), rgba(251,242,231,0.2) 46%, rgba(251,242,231,0) 66%)',
        }}
      />
      {/* The morning light, breathing slowly. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-8%] top-[-30%] h-[90%] w-[62%] rounded-full bg-[radial-gradient(closest-side,rgba(255,243,222,0.35),rgba(255,243,222,0))] motion-safe:animate-[sun-breathe_14s_ease-in-out_infinite]"
      />

      <p
        className="absolute font-sans font-semibold uppercase leading-none text-[#a4701c]"
        style={{ left: v(226), top: v(204), fontSize: v(18.1), letterSpacing: '0.258em' }}
      >
        The Lyceum, reimagined
      </p>
      <span
        aria-hidden="true"
        className="absolute bg-[#9e6a10]"
        style={{ left: v(226), top: v(253), width: v(81), height: v(4) }}
      />
      <h1
        id="hero-title"
        className="absolute m-0 font-display font-[650] text-[#1d2f1a] [font-variation-settings:'opsz'_36]"
        style={{ left: v(225), top: v(285), fontSize: v(103), lineHeight: v(93), letterSpacing: '0.012em' }}
      >
        For minds
        <br />
        in motion.
      </h1>
      <p
        className="absolute m-0 font-display text-[#283a26] [font-variation-settings:'opsz'_24]"
        style={{ left: v(227), top: v(482), fontSize: v(29), lineHeight: v(34) }}
      >
        Inspired by the thinkers of yesterday.
        <br />
        Built for the curious minds of tomorrow.
      </p>

      <div className="absolute flex items-center" style={{ left: v(225), top: v(582), gap: v(22) }}>
        <SignInButton
          label="Enter the Academy"
          signedInLabel="Enter the Academy"
          icon="arrow"
          className="inline-flex items-center justify-center rounded-full bg-[#1d2f1a] font-display font-medium text-[#f6f0e4] shadow-[0_14px_30px_-18px_rgba(20,45,20,0.8)] transition-colors hover:bg-[#26401f] [&_.btn-arrow]:ml-[0.75em] [&_.btn-arrow]:size-[1em]"
          style={{ width: v(276), height: v(51), fontSize: v(21) }}
        />
        <a
          href="#academy"
          className="inline-flex items-center justify-center rounded-full border-2 border-[#1d2f1a]/70 bg-[#f6ede2]/85 font-display font-medium text-[#1d2a1d] no-underline backdrop-blur-[2px] transition-colors hover:bg-[#fbf5ec]"
          style={{ width: v(217), height: v(52), fontSize: v(21) }}
        >
          Explore Lyceo
        </a>
      </div>
    </section>
  )
}
