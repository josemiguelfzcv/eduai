import { LANDING } from '../../lib/art'
import { SignInButton } from '../SignInButton'
import { Parallax } from './Parallax'

/**
 * Section 1: entering the academy. The scene fills the screen; the words sit in its open sky on the left, over a
 * soft haze of light so they read against the leaves.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative h-[clamp(720px,94vh,860px)] overflow-hidden bg-[#efe6d4]">
      <Parallax speed={0.1} className="absolute inset-x-0 -bottom-[4%] -top-[4%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LANDING.hero}
          alt=""
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-[0%_50%] motion-safe:animate-[scene-drift_36s_ease-in-out_infinite_alternate]"
        />
      </Parallax>
      {/* Morning light, breathing slowly. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10%] -top-[20%] h-[80%] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgba(255,236,196,0.55),rgba(255,236,196,0))] motion-safe:animate-[sun-breathe_14s_ease-in-out_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_64%_at_24%_50%,rgba(251,246,236,0.86),rgba(251,246,236,0.55)_48%,rgba(251,246,236,0)_78%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#fbf6ec]/75 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#f7f0e4]/70"
      />

      <div className="relative flex h-full items-center pl-[clamp(4rem,13.5vw,15rem)] pt-20">
        <div className="max-w-[44rem]">
          <p className="text-[1.02rem] font-semibold uppercase tracking-[0.24em] text-[#94661c]">
            The Lyceum, reimagined
          </p>
          <span aria-hidden="true" className="mt-7 block h-[3px] w-20 rounded-full bg-[#b9893a]" />
          <h1
            id="hero-title"
            className="mt-9 font-display text-[clamp(4.6rem,6.2vw,7rem)] font-bold leading-[0.94] tracking-[-0.035em] text-[#1a3020]"
          >
            For minds
            <br />
            in motion.
          </h1>
          <p className="mt-8 font-display text-[clamp(1.45rem,1.75vw,1.85rem)] leading-[1.35] text-[#1f2a22]">
            Inspired by the thinkers of yesterday.
            <br />
            Built for the curious minds of tomorrow.
          </p>
          <div className="mt-11 flex flex-wrap items-center gap-5">
            <SignInButton
              label="Enter the Academy"
              signedInLabel="Enter the Academy"
              icon="arrow"
              className="inline-flex items-center gap-3 rounded-full bg-[#173a20] px-9 py-[1.05rem] font-display text-[1.25rem] text-[#fbf5ea] shadow-[0_14px_30px_-16px_rgba(20,45,20,0.8)] transition-colors hover:bg-[#21492b]"
            />
            <a
              href="#academy"
              className="inline-flex items-center rounded-full border border-[#1f2a22]/55 bg-[#fdf9f1]/75 px-10 py-[1.02rem] font-display text-[1.25rem] text-[#1f2a22] no-underline backdrop-blur-sm transition-colors hover:bg-[#fdf9f1]"
            >
              Explore Lyceo
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
