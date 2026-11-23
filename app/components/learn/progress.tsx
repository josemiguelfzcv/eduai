'use client'

import { STATE_LABEL, type SkillStateName } from '../../lib/mastery'

// How progress is drawn everywhere (Global Progress, a course's Knowledge Map, an assignment's progress): the same
// states from the same evidence, in the same order and colors.

// The order and the colors were checked together (dataviz palette validator, on the paper surface): neighbours stay
// apart for color-blind readers too. "Not checked yet" is the neutral rest, not a color of its own.
export const STATE_ORDER: SkillStateName[] = ['confirmed', 'learning', 'review', 'needs_practice', 'new']
export const STATE_HEX: Record<SkillStateName, string> = {
  confirmed: '#1f6d38',
  learning: '#3da384',
  review: '#cf972a',
  needs_practice: '#b9552f',
  new: '#e3dacb',
}
export const STATE_COLOR: Record<SkillStateName, string> = {
  confirmed: 'bg-[#1f6d38]',
  learning: 'bg-[#3da384]',
  review: 'bg-[#cf972a]',
  needs_practice: 'bg-[#b9552f]',
  new: 'bg-[#e3dacb]',
}

/** The ideas of a course as one bar, a segment per state. */
export function StateBar({ counts, total }: { counts: Record<SkillStateName, number>; total: number }) {
  return (
    <div className="w-full max-w-[22rem]">
      <div
        className="flex h-2.5 gap-[2px] overflow-hidden rounded-full"
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
