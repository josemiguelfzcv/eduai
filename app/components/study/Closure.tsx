import type { SkillStateName } from '../../lib/mastery'
import { summaryLines, type SessionSummary } from '../../lib/study'
import { Theo } from '../Theo'

const TONE: Record<SkillStateName, string> = {
  new: 'border-line text-ink-soft',
  learning: 'border-gold/70 text-gold-deep',
  needs_practice: 'border-terracotta/40 text-terracotta',
  confirmed: 'border-moss/40 bg-moss/[0.06] text-moss',
  review: 'border-gold/70 text-gold-deep',
}

export function StateChip({ state, label }: { state: SkillStateName; label: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[0.8rem] font-medium ${TONE[state]}`}>
      {label}
    </span>
  )
}

/**
 * The closure of a study session: what happened today, then, apart, how each skill moved, then tomorrow's step. Every
 * line names something that happened; empty categories never show. `compact` is the short version for My Academy.
 */
export function Closure({ summary, compact = false }: { summary: SessionSummary; compact?: boolean }) {
  const lines = summaryLines(summary)
  const [headline, ...today] = lines.today

  if (compact) {
    return (
      <div className="space-y-3">
        <ul className="space-y-1.5">
          {lines.today.map((line) => (
            <li key={line} className="text-[0.97rem]">
              {line}
            </li>
          ))}
        </ul>
        {lines.tomorrow && <p className="text-[0.95rem] text-ink-soft">Next: {lines.tomorrow}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-12">
      <div className="relative">
        <div className="board px-6 pb-12 pt-12 text-center sm:px-10">
          <p className="mx-auto max-w-[26ch] font-chalk text-[clamp(1.7rem,3.4vw,2.2rem)] leading-snug text-chalk">
            {headline}
          </p>
        </div>
        <Theo size={84} float={false} className="absolute -bottom-8 right-6" />
      </div>

      {today.length > 0 && (
        <section aria-labelledby="closure-today">
          <h2 id="closure-today" className="text-[1.45rem]">
            Today
          </h2>
          <ul className="mt-4 space-y-3">
            {today.map((line) => (
              <li key={line} className="flex gap-3 text-[1.02rem] leading-relaxed">
                <span aria-hidden="true" className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-gold" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.overTime.length > 0 && (
        <section aria-labelledby="closure-time">
          <h2 id="closure-time" className="text-[1.45rem]">
            Over time
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {summary.overTime.map((o, i) => (
              <li key={o.skillId} className="py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-display text-[1.2rem] leading-snug">{o.skill}</span>
                  <StateChip state={o.state} label={o.label} />
                </div>
                <p className="mt-1 max-w-[62ch] text-[0.97rem] text-ink-soft">{lines.overTime[i].text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lines.tomorrow && (
        <section aria-labelledby="closure-tomorrow" className="rounded-2xl bg-ivory-deep/70 px-6 py-5">
          <h2 id="closure-tomorrow" className="text-[1.2rem]">
            Tomorrow
          </h2>
          <p className="mt-1 text-[1.02rem]">{lines.tomorrow}</p>
        </section>
      )}
    </div>
  )
}
