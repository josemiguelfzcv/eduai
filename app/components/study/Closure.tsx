import type { SkillStateName } from '../../lib/mastery'
import { summaryLines, type SessionSummary } from '../../lib/study'

const TONE: Record<SkillStateName, string> = {
  new: 'border-line text-ink-soft',
  learning: 'border-gold/60 text-gold-deep',
  needs_practice: 'border-terracotta/40 text-terracotta',
  confirmed: 'border-moss/40 text-moss',
  review: 'border-gold/60 text-gold-deep',
}

export function StateChip({ state, label }: { state: SkillStateName; label: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[0.8rem] font-medium ${TONE[state]}`}>
      {label}
    </span>
  )
}

/**
 * The closure of a Quick Check: what happened today, then, apart, how each skill moved, then tomorrow's step. Every
 * line names something that happened; empty categories never show.
 */
export function Closure({ summary, compact = false }: { summary: SessionSummary; compact?: boolean }) {
  const lines = summaryLines(summary)
  return (
    <div className={compact ? 'space-y-4' : 'space-y-8'}>
      <section aria-label="Today">
        {!compact && <h2 className="text-[1.4rem]">Today</h2>}
        <ul className={`${compact ? '' : 'mt-3'} space-y-1.5`}>
          {lines.today.map((line) => (
            <li key={line} className={compact ? 'text-[0.95rem]' : 'text-[1.02rem]'}>
              {line}
            </li>
          ))}
        </ul>
      </section>
      {lines.overTime.length > 0 && !compact && (
        <section aria-label="Over time">
          <h2 className="text-[1.4rem]">Over time</h2>
          <ul className="mt-3 space-y-3">
            {summary.overTime.map((o, i) => (
              <li key={o.skillId} className="panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[1.15rem]">{o.skill}</span>
                  <StateChip state={o.state} label={o.label} />
                </div>
                <p className="mt-1 text-[0.95rem] text-ink-soft">{lines.overTime[i].text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {lines.tomorrow && (
        <section aria-label="Tomorrow">
          {compact ? (
            <p className="text-[0.95rem] text-ink-soft">Next: {lines.tomorrow}</p>
          ) : (
            <>
              <h2 className="text-[1.4rem]">Tomorrow</h2>
              <p className="mt-2 text-[1.02rem]">{lines.tomorrow}</p>
            </>
          )}
        </section>
      )}
    </div>
  )
}
