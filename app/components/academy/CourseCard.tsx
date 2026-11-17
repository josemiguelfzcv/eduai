import Link from 'next/link'
import { whenLabel, type CourseSummary } from '../../lib/academy'
import { dueLabel, plural } from './format'

export function CourseCard({ course: c }: { course: CourseSummary }) {
  const share = c.conceptsChecked ? c.firstTryCorrect / c.conceptsChecked : 0
  return (
    <Link
      href={`/courses/${c.id}`}
      className="panel block h-full p-5 no-underline transition-colors hover:border-stone-deep sm:p-6"
    >
      <p className="font-display text-[1.3rem] leading-snug">{c.name}</p>
      <p className="mt-0.5 text-[0.84rem] text-ink-soft">{[c.code, c.term].filter(Boolean).join(', ') || ' '}</p>

      <div className="mt-5">
        {c.conceptsChecked > 0 ? (
          <>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-ivory-deep"
              role="img"
              aria-label={`${c.firstTryCorrect} of ${c.conceptsChecked} concepts right on the first try`}
            >
              <div className="h-full rounded-full bg-moss" style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
            <p className="mt-2 text-[0.86rem]">
              {c.firstTryCorrect} of {c.conceptsChecked} concepts right on the first try
            </p>
          </>
        ) : (
          <p className="text-[0.86rem] text-ink-soft">{c.lessons ? 'No check-ins yet' : 'No lessons yet'}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.8rem]">
        {c.lessons > 0 && <span className="text-ink-soft">{plural(c.lessons, 'lesson')}</span>}
        {c.toReview > 0 && <span className="font-semibold text-terracotta">{c.toReview} to review</span>}
        {c.nextDeadline && (
          <span className={`rounded-full border px-2.5 py-0.5 font-semibold ${dueLabel(c.nextDeadline).tone}`}>
            {c.nextDeadline.title} {whenLabel(c.nextDeadline.daysLeft)}
          </span>
        )}
      </div>
    </Link>
  )
}
