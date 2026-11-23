'use client'

import { STATE_LABEL, type SkillStateName } from '../../lib/mastery'

// How progress is drawn everywhere (Global Progress, a course's Knowledge Map, an assignment's progress): the same
// states from the same evidence, in the same order and colors.

export const STATE_ORDER: SkillStateName[] = ['confirmed', 'review', 'learning', 'needs_practice', 'new']
export const STATE_COLOR: Record<SkillStateName, string> = {
  confirmed: 'bg-grove-soft',
  review: 'bg-[#c9a24e]',
  learning: 'bg-[#e0c17a]',
  needs_practice: 'bg-terracotta/80',
  new: 'bg-[#e4dccd]',
}

/** The ideas of a course as one bar, a segment per state. */
export function StateBar({ counts, total }: { counts: Record<SkillStateName, number>; total: number }) {
  return (
    <div className="w-full max-w-[22rem]">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-[#ece4d5]"
        role="img"
        aria-label={STATE_ORDER.filter((s) => counts[s])
          .map((s) => `${counts[s]} ${STATE_LABEL[s].toLowerCase()}`)
          .join(', ')}
      >
        {total > 0 &&
          STATE_ORDER.map((s) =>
            counts[s] ? (
              <span key={s} className={STATE_COLOR[s]} style={{ width: `${(counts[s] / total) * 100}%` }} />
            ) : null,
          )}
      </div>
    </div>
  )
}
