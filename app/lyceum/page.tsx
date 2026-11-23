'use client'

import Link from 'next/link'
import { Breadcrumbs } from '../components/shell/Breadcrumbs'

/** The Lyceum: the longer-term vision of a connected world of knowledge. Not built yet, and said so. */
export default function LyceumPage() {
  return (
    <div className="px-8 pb-14 pt-5">
      <div className="max-w-[72rem]">
        <Breadcrumbs className="mb-5" />
        <section className="relative overflow-hidden rounded-[22px] border border-[#ebdfcc] bg-[#fbf4e9] shadow-[0_3px_18px_-8px_rgba(95,65,25,0.2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/learn/banner-temples.webp"
            alt=""
            className="absolute inset-y-0 right-0 h-full w-[68%] object-cover"
            style={{
              maskImage: 'linear-gradient(to right, transparent, #000 34%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent, #000 34%)',
            }}
          />
          <div className="relative max-w-[34rem] px-10 py-14">
            <p className="text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-gold-deep">
              The Lyceum — Coming soon
            </p>
            <h1 className="mt-4 font-display text-[2.3rem] font-bold leading-[1.1] tracking-[-0.015em] text-grove">
              An entire world of knowledge, waiting to be explored.
            </h1>
            <p className="mt-4 font-display text-[1.15rem] text-[#2a2924]">
              A living academy of ideas, disciplines, and discovery.
            </p>
            <p className="mt-6 max-w-[28rem] text-[0.92rem] leading-relaxed text-ink-soft">
              The Lyceum isn’t open yet. For now, Lyceo works with your own courses, in My Academy.
            </p>
            <Link
              href="/dashboard"
              className="mt-7 inline-flex items-center rounded-full bg-grove px-5 py-2.5 text-[0.9rem] font-semibold text-ivory no-underline hover:bg-grove-soft"
            >
              Back to My Academy
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
