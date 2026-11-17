import Link from 'next/link'
import type { LearnerSummary } from '../../lib/lesson'
import { getStyle } from '../../lib/learning-styles'

const PACE: Record<LearnerSummary['pace'], string> = { gentle: 'Smaller steps', steady: 'Steady', brisk: 'Brisk' }

/** What Lyceo has learned about how the student learns. Only real numbers; nothing shows before the first check-in. */
export function LearningProfile({ learner }: { learner: LearnerSummary }) {
  const style = getStyle(learner.styleId)
  return (
    <section aria-labelledby="profile-title" className="panel p-5 sm:p-6">
      <h2 id="profile-title" className="text-[1.3rem]">
        How you learn
      </h2>
      {learner.conceptsSeen === 0 ? (
        <p className="mt-2 text-[0.92rem] text-ink-soft">
          After your first check-ins, this shows how often you get ideas right on the first try and the pace Theo uses
          for you.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-[0.82rem] text-ink-soft">Right on the first try</dt>
            <dd className="font-display text-[1.6rem] leading-tight text-moss">
              {learner.firstTryAccuracy === null ? 'None yet' : `${Math.round(learner.firstTryAccuracy * 100)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-[0.82rem] text-ink-soft">Ideas checked</dt>
            <dd className="font-display text-[1.6rem] leading-tight">{learner.conceptsSeen}</dd>
          </div>
          <div>
            <dt className="text-[0.82rem] text-ink-soft">Pace</dt>
            <dd className="font-display text-[1.3rem] leading-tight">{PACE[learner.pace]}</dd>
          </div>
          <div>
            <dt className="text-[0.82rem] text-ink-soft">Learns by</dt>
            <dd className="font-display text-[1.3rem] leading-tight">
              {style ? style.label.split(' ')[0] : 'Not set'}
            </dd>
          </div>
        </dl>
      )}
      <p className="mt-4 text-[0.86rem] text-ink-soft">
        {style ? 'Theo writes every lesson for this.' : 'Theo doesn’t know how you like to learn yet.'}{' '}
        <Link href="/profile" className="text-forest underline underline-offset-4">
          {style ? 'Change' : 'Set your learning style'}
        </Link>
      </p>
    </section>
  )
}
