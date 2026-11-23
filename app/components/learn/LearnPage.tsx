'use client'

import Link from 'next/link'
import type { CourseDetail } from '../../lib/academy'

// The frame of the course pages beside the lessons (lectures, assignments, materials, progress): a header on the page,
// then the content on paper cards, at the same width and rhythm as a lecture.

export function LearnPage({
  detail,
  title,
  description,
  actions,
  children,
}: {
  detail: CourseDetail | null
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const course = detail?.course
  return (
    <div className="px-1 pb-12 pt-1 sm:px-2">
      <div className="mx-auto max-w-[60rem]">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-3 pt-3 sm:px-4">
          <div className="min-w-0">
            <p className="text-[0.86rem] text-ink-soft">
              {course ? [course.code, course.name].filter(Boolean).join(', ') : ' '}
            </p>
            <h1 className="mt-1 font-display text-[clamp(1.55rem,2.3vw,2.05rem)] font-bold leading-[1.15] tracking-[-0.015em] text-[#1d1c19]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-[40rem] text-[0.9rem] leading-relaxed text-ink-soft">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
        </header>
        <div className="mt-6 space-y-5">{children}</div>
      </div>
    </div>
  )
}

/** A paper card holding a part of a page, with an optional heading. */
export function Paper({
  title,
  aside,
  children,
  className = '',
}: {
  title?: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-[18px] border border-[#eee3d2] bg-[#fffaf3] px-4 py-5 shadow-[0_3px_18px_-8px_rgba(95,65,25,0.2)] sm:px-6 ${className}`}
      aria-label={title}
    >
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-[1.25rem] font-semibold text-[#1d1c19]">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export const PILL_PRIMARY =
  'inline-flex items-center gap-2 rounded-full bg-grove px-5 py-2.5 text-[0.88rem] font-semibold text-ivory no-underline shadow-[0_6px_16px_-8px_rgba(20,45,20,0.7)] transition-colors hover:bg-grove-soft disabled:opacity-60'
export const PILL_SECONDARY =
  'inline-flex items-center gap-2 rounded-full border border-[#dcc9a3] bg-[#fffbf4] px-5 py-2.5 text-[0.88rem] font-semibold text-grove no-underline transition-colors hover:border-gold disabled:opacity-60'

/** While the course loads, or when it couldn't. */
export function PageNote({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-ink-soft">{children}</p>
}

export function AddLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={PILL_PRIMARY}>
      {children}
    </Link>
  )
}
