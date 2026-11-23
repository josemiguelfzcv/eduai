import { LANDING } from '../../lib/art'
import { Parallax } from './Parallax'

/**
 * Section 4: The Lyceum. The longer view: a whole landscape of knowledge across disciplines. It isn't built yet, and
 * the section says so plainly.
 */
export function LyceumSection() {
  return (
    <section
      id="lyceum"
      aria-labelledby="lyceum-title"
      className="relative scroll-mt-[76px] overflow-hidden bg-[#efe4d0]"
    >
      <Parallax speed={0.12} className="absolute inset-x-0 -bottom-[7%] -top-[7%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LANDING.lyceum} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_58%]" />
      </Parallax>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(52%_62%_at_30%_30%,rgba(251,246,236,0.9),rgba(251,246,236,0.55)_50%,rgba(251,246,236,0)_75%)]"
      />
      <div className="relative min-h-[clamp(700px,50vw,860px)] pl-[clamp(3rem,15vw,17rem)] pt-[clamp(5rem,8vw,8.5rem)]">
        <div className="max-w-[62rem]">
          <p className="flex items-center gap-4 text-[0.98rem] font-semibold uppercase tracking-[0.22em] text-[#94661c]">
            <span aria-hidden="true" className="h-[3px] w-14 rounded-full bg-[#b9893a]" />
            The Lyceum — Coming soon
          </p>
          <h2
            id="lyceum-title"
            className="mt-7 font-display text-[clamp(2.7rem,3.3vw,4rem)] font-bold leading-[1.06] tracking-[-0.03em] text-[#1a3020]"
          >
            An entire world of
            <br />
            knowledge, waiting to be explored.
          </h2>
          <p className="mt-6 font-display text-[1.45rem] text-[#1f2a22]">
            A living academy of ideas, disciplines, and discovery.
          </p>
          <p className="mt-9 inline-flex items-center rounded-full border-2 border-[#b9893a] bg-[#2a2a22]/[0.55] px-8 py-3 text-[1.15rem] font-semibold text-[#f3d791] backdrop-blur-sm">
            Coming Soon
          </p>
        </div>
      </div>
    </section>
  )
}
